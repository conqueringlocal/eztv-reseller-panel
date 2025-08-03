import { Customer } from '@/contexts/AppContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

/**
 * Attempts to repair unconsolidated customers by triggering consolidation
 * for any customer groups that have multiple unconsolidated records
 */
export async function repairUnconsolidatedCustomers(customers: Customer[], resellerId: string): Promise<boolean> {
  const groupedCustomers = new Map<string, Customer[]>();
  
  // Find customers that should be consolidated but aren't
  customers.forEach(customer => {
    // Skip already consolidated customers
    if (customer.connectionDetails && Array.isArray(customer.connectionDetails) && customer.connectionDetails.length > 0) {
      return;
    }
    
    if (customer.customer_group) {
      const groupKey = customer.customer_group;
      if (!groupedCustomers.has(groupKey)) {
        groupedCustomers.set(groupKey, []);
      }
      groupedCustomers.get(groupKey)!.push(customer);
    }
  });
  
  // Find groups with multiple customers that need consolidation
  const groupsToRepair = Array.from(groupedCustomers.entries())
    .filter(([_, customers]) => customers.length > 1);
  
  if (groupsToRepair.length === 0) {
    console.log('✅ No customer groups need repair');
    return true;
  }
  
  console.log(`🔧 Repairing ${groupsToRepair.length} customer groups`);
  
  let repairedCount = 0;
  let failedCount = 0;
  
  for (const [groupKey, groupCustomers] of groupsToRepair) {
    try {
      console.log(`🔄 Consolidating group: ${groupKey} (${groupCustomers.length} customers)`);
      
      const { data, error } = await supabase.rpc('consolidate_customer_connections', {
        customer_group_name: groupKey,
        reseller_id_param: resellerId
      });
      
      if (error) {
        console.error(`❌ Failed to consolidate group ${groupKey}:`, error);
        failedCount++;
      } else {
        console.log(`✅ Successfully consolidated group ${groupKey}:`, data);
        repairedCount++;
      }
      
      // Small delay between consolidations
      await new Promise(resolve => setTimeout(resolve, 500));
      
    } catch (error) {
      console.error(`💥 Error consolidating group ${groupKey}:`, error);
      failedCount++;
    }
  }
  
  if (repairedCount > 0) {
    toast.success(`Successfully repaired ${repairedCount} customer groups`);
  }
  
  if (failedCount > 0) {
    toast.error(`Failed to repair ${failedCount} customer groups`);
  }
  
  return failedCount === 0;
}

/**
 * Identifies customers that may have consolidation issues
 */
export function identifyConsolidationIssues(customers: Customer[]): {
  duplicateGroups: Array<{
    groupKey: string;
    customers: Customer[];
    issue: string;
  }>;
  singleCustomersWithoutGroup: Customer[];
  consolidatedCustomers: Customer[];
} {
  const groupedCustomers = new Map<string, Customer[]>();
  const consolidatedCustomers: Customer[] = [];
  const singleCustomersWithoutGroup: Customer[] = [];
  
  customers.forEach(customer => {
    // Check if consolidated
    if (customer.connectionDetails && Array.isArray(customer.connectionDetails) && customer.connectionDetails.length > 0) {
      consolidatedCustomers.push(customer);
      return;
    }
    
    // Group by customer_group if it exists
    if (customer.customer_group) {
      const groupKey = customer.customer_group;
      if (!groupedCustomers.has(groupKey)) {
        groupedCustomers.set(groupKey, []);
      }
      groupedCustomers.get(groupKey)!.push(customer);
    } else {
      singleCustomersWithoutGroup.push(customer);
    }
  });
  
  const duplicateGroups = Array.from(groupedCustomers.entries())
    .filter(([_, customers]) => customers.length > 1)
    .map(([groupKey, customers]) => {
      let issue = `${customers.length} separate records found`;
      
      // Check for common issues
      const uniqueNames = new Set(customers.map(c => c.name));
      const uniqueEmails = new Set(customers.map(c => c.email));
      
      if (uniqueNames.size > 1) {
        issue += '; inconsistent names';
      }
      if (uniqueEmails.size > 1) {
        issue += '; inconsistent emails';
      }
      
      return {
        groupKey,
        customers,
        issue
      };
    });
  
  return {
    duplicateGroups,
    singleCustomersWithoutGroup,
    consolidatedCustomers
  };
}
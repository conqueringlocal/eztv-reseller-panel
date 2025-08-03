
import { Customer } from '@/contexts/AppContext';
import { CustomerGroup } from './types';

// Get customers that need consolidation (have same name/email but aren't consolidated)
export function getCustomersNeedingConsolidation(customers: Customer[]): CustomerGroup[] {
  const groupedCustomers = new Map<string, Customer[]>();
  
  customers.forEach(customer => {
    // Skip already consolidated customers - check for connectionDetails array with multiple entries
    if (customer.connectionDetails && Array.isArray(customer.connectionDetails) && customer.connectionDetails.length > 0) {
      return;
    }
    
    // Skip if customer doesn't have proper grouping info
    if (!customer.customer_group || !customer.name || !customer.email) {
      return;
    }
    
    const groupKey = `${customer.customer_group}_${customer.resellerId}`;
    
    if (!groupedCustomers.has(groupKey)) {
      groupedCustomers.set(groupKey, []);
    }
    
    groupedCustomers.get(groupKey)!.push(customer);
  });
  
  // Return only groups that have more than one customer
  return Array.from(groupedCustomers.entries())
    .filter(([_, customers]) => customers.length > 1)
    .map(([groupKey, customers]) => ({
      groupKey,
      customers,
      name: customers[0].name,
      email: customers[0].email,
      resellerId: customers[0].resellerId
    }));
}

// Process customers for display in the table
export function processCustomersForDisplay(customers: Customer[]): Customer[] {
  const processedCustomers: Customer[] = [];
  const groupedCustomers = new Map<string, Customer[]>();
  
  // First, group customers by customer_group and reseller
  customers.forEach(customer => {
    // If this is a consolidated customer (has connectionDetails array with multiple entries), add it directly
    if (customer.connectionDetails && Array.isArray(customer.connectionDetails) && customer.connectionDetails.length > 0) {
      processedCustomers.push(customer);
      return;
    }
    
    // For non-consolidated customers, group them
    if (customer.customer_group) {
      const groupKey = `${customer.customer_group}_${customer.resellerId}`;
      
      if (!groupedCustomers.has(groupKey)) {
        groupedCustomers.set(groupKey, []);
      }
      groupedCustomers.get(groupKey)!.push(customer);
    } else {
      // Single customer not part of a group - add directly
      processedCustomers.push(customer);
    }
  });
  
  // For each group, if it has multiple entries but isn't consolidated, 
  // show them as separate accounts (this is the bug fix)
  groupedCustomers.forEach((groupCustomers, groupKey) => {
    if (groupCustomers.length === 1) {
      // Single customer in group
      processedCustomers.push(groupCustomers[0]);
    } else {
      // Multiple customers in group - check if they should be consolidated
      // For now, show them all (this allows Derek's accounts to show)
      // The consolidation process will handle merging them later
      processedCustomers.push(...groupCustomers);
    }
  });
  
  return processedCustomers;
}

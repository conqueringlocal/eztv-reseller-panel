
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
  const processedGroups = new Set<string>();
  
  customers.forEach(customer => {
    // If this is a consolidated customer (has connectionDetails), add it directly
    if (customer.connectionDetails && Array.isArray(customer.connectionDetails) && customer.connectionDetails.length > 0) {
      processedCustomers.push(customer);
      return;
    }
    
    // For non-consolidated customers, check if they're part of a group
    if (customer.customer_group) {
      const groupKey = `${customer.customer_group}_${customer.resellerId}`;
      
      // If we haven't processed this group yet, add the first customer
      if (!processedGroups.has(groupKey)) {
        processedGroups.add(groupKey);
        processedCustomers.push(customer);
      }
    } else {
      // Single customer not part of a group
      processedCustomers.push(customer);
    }
  });
  
  return processedCustomers;
}

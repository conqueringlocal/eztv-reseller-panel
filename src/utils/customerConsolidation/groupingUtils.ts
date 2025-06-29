
import { Customer } from '@/contexts/AppContext';
import { getFieldValue } from './fieldHelpers';
import { getCustomerDisplayName, isConsolidatedCustomer } from './customerInfo';
import { getConnectionDetails } from './connectionUtils';
import { CustomerGroup } from './types';

// Process customers for display (handles both consolidated and legacy formats)
export function processCustomersForDisplay(customers: Customer[]): any[] {
  const processedCustomers: any[] = [];
  const processedGroups = new Set<string>();
  
  customers.forEach(customer => {
    const customerGroup = getFieldValue(customer, 'customer_group', 'customerGroup');
    const resellerId = getFieldValue(customer, 'reseller_id', 'resellerId');
    const groupKey = `${customerGroup}_${resellerId}`;
    
    // If this is a consolidated customer or we haven't processed this group yet
    if (isConsolidatedCustomer(customer) || !processedGroups.has(groupKey)) {
      processedCustomers.push({
        ...customer,
        // Ensure consistent field access
        name: getCustomerDisplayName(customer),
        totalConnections: getTotalConnections(customer),
        connectionDetails: getConnectionDetails(customer)
      });
      
      if (customerGroup) {
        processedGroups.add(groupKey);
      }
    }
  });
  
  return processedCustomers;
}

// Group customers by email and name for consolidation
export function groupCustomersForConsolidation(customers: Customer[]): Map<string, Customer[]> {
  const groups = new Map<string, Customer[]>();
  
  customers.forEach(customer => {
    const name = getCustomerDisplayName(customer);
    const email = customer.email?.toLowerCase().trim() || '';
    const resellerId = getFieldValue(customer, 'reseller_id', 'resellerId');
    
    const groupKey = `${name.toLowerCase().trim()}_${email}_${resellerId}`;
    
    if (!groups.has(groupKey)) {
      groups.set(groupKey, []);
    }
    
    groups.get(groupKey)!.push(customer);
  });
  
  return groups;
}

// Check if customers need consolidation
export function needsConsolidation(customers: Customer[]): boolean {
  const groups = groupCustomersForConsolidation(customers);
  
  for (const [, groupCustomers] of groups) {
    if (groupCustomers.length > 1) {
      // Check if any of these customers are not already consolidated
      const hasUnconsolidated = groupCustomers.some(customer => !isConsolidatedCustomer(customer));
      if (hasUnconsolidated) {
        return true;
      }
    }
  }
  
  return false;
}

// Get customers that need consolidation
export function getCustomersNeedingConsolidation(customers: Customer[]): CustomerGroup[] {
  const groups = groupCustomersForConsolidation(customers);
  const needingConsolidation: CustomerGroup[] = [];
  
  for (const [groupKey, groupCustomers] of groups) {
    if (groupCustomers.length > 1) {
      const hasUnconsolidated = groupCustomers.some(customer => !isConsolidatedCustomer(customer));
      if (hasUnconsolidated) {
        const firstCustomer = groupCustomers[0];
        needingConsolidation.push({
          groupKey,
          customers: groupCustomers,
          name: getCustomerDisplayName(firstCustomer),
          email: firstCustomer.email || '',
          resellerId: getFieldValue(firstCustomer, 'reseller_id', 'resellerId') || ''
        });
      }
    }
  }
  
  return needingConsolidation;
}

// Import getTotalConnections here to avoid circular dependency
function getTotalConnections(customer: any): number {
  const totalConnections = getFieldValue(customer, 'total_connections', 'totalConnections');
  const connectionList = getFieldValue(customer, 'connection_list', 'connectionList');
  const maxConnections = getFieldValue(customer, 'max_connections', 'maxConnections');
  
  if (totalConnections && totalConnections > 0) {
    return totalConnections;
  }
  
  if (connectionList && Array.isArray(connectionList)) {
    return connectionList.length;
  }
  
  return maxConnections || 1;
}


import { Customer } from '@/contexts/AppContext';

// Enhanced interface for consolidated customers
export interface ConsolidatedCustomer {
  id: string;
  name: string;
  email: string;
  deviceType: string;
  planDuration: number;
  expirationDate: string;
  status: 'active' | 'expired' | 'cancelled' | 'pending';
  isDeactivated: boolean;
  cancelledAt: string | null;
  highlevelContactId?: string;
  customerGroup?: string;
  macAddress?: string;
  isTrial?: boolean;
  startDate?: string;
  provider?: string;
  
  // Consolidated properties
  totalConnections: number;
  connectionEntries: Customer[];
  connectionDetails: Array<{
    connectionNumber: number;
    username?: string;
    password?: string;
    macAddress?: string;
    m3uUrl?: string;
  }>;
}

// Helper function to safely get field values from both formats
const getFieldValue = (customer: any, snakeCaseField: string, camelCaseField: string): any => {
  return customer[snakeCaseField] || customer[camelCaseField];
};

// Check if a customer is already consolidated (has connection_list or total_connections > 1)
export function isConsolidatedCustomer(customer: any): boolean {
  const connectionList = getFieldValue(customer, 'connection_list', 'connectionList');
  const totalConnections = getFieldValue(customer, 'total_connections', 'totalConnections');
  
  return (connectionList && Array.isArray(connectionList) && connectionList.length > 0) || 
         (totalConnections && totalConnections > 1);
}

// Get the display name for a customer (remove connection indicators)
export function getCustomerDisplayName(customer: any): string {
  const name = customer.name || '';
  // Remove connection indicators like "(Connection 1)", "(Connection 2)", etc.
  return name.replace(/\s*\(Connection\s+\d+\)\s*/gi, '').trim();
}

// Get total connections for a customer
export function getTotalConnections(customer: any): number {
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

// Get connection summary text
export function getConnectionSummary(customer: any): string {
  const total = getTotalConnections(customer);
  return `${total} Connection${total > 1 ? 's' : ''}`;
}

// Get connection details from a customer
export function getConnectionDetails(customer: any): Array<{
  connectionNumber: number;
  username?: string;
  password?: string;
  macAddress?: string;
  m3uUrl?: string;
}> {
  const connectionList = getFieldValue(customer, 'connection_list', 'connectionList');
  
  if (connectionList && Array.isArray(connectionList)) {
    return connectionList.map((conn: any, index: number) => ({
      connectionNumber: conn.connection_number || index + 1,
      username: conn.username,
      password: conn.password,
      macAddress: conn.mac_address,
      m3uUrl: conn.m3u_url
    }));
  }
  
  // Fallback for non-consolidated customers
  return [{
    connectionNumber: 1,
    username: customer.username,
    password: customer.password,
    macAddress: getFieldValue(customer, 'mac_address', 'macAddress'),
    m3uUrl: getFieldValue(customer, 'm3u_url', 'm3uUrl')
  }];
}

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
export function getCustomersNeedingConsolidation(customers: Customer[]): Array<{
  groupKey: string;
  customers: Customer[];
  name: string;
  email: string;
  resellerId: string;
}> {
  const groups = groupCustomersForConsolidation(customers);
  const needingConsolidation: Array<{
    groupKey: string;
    customers: Customer[];
    name: string;
    email: string;
    resellerId: string;
  }> = [];
  
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

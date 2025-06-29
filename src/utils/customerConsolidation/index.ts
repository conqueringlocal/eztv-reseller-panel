
import { Customer } from '@/contexts/AppContext';
import { ConsolidatedCustomer, CustomerGroup } from './types';

/**
 * Check if a customer is in the new consolidated format
 */
export const isConsolidatedCustomer = (customer: any): boolean => {
  return Boolean(
    customer && 
    (customer.total_connections > 1 || 
     customer.connection_details?.length > 0 || 
     customer.connection_list?.length > 0)
  );
};

/**
 * Get the display name for a customer (consolidated or legacy)
 */
export const getCustomerDisplayName = (customer: any): string => {
  if (!customer) return 'Unknown Customer';
  
  // For consolidated customers, use the clean name
  if (isConsolidatedCustomer(customer)) {
    return customer.name || 'Unknown Customer';
  }
  
  // For legacy customers, clean up connection suffixes
  const name = customer.name || 'Unknown Customer';
  return name.replace(/\s*\(Connection\s+\d+\)$/i, '').trim();
};

/**
 * Get the total number of connections for a customer
 */
export const getTotalConnections = (customer: any): number => {
  if (!customer) return 0;
  
  // For consolidated customers
  if (isConsolidatedCustomer(customer)) {
    return customer.total_connections || 
           customer.connection_details?.length || 
           customer.connection_list?.length || 
           customer.max_connections || 1;
  }
  
  // For legacy customers
  return customer.max_connections || 1;
};

/**
 * Get connection summary text for display
 */
export const getConnectionSummary = (customer: any): string => {
  const total = getTotalConnections(customer);
  return total === 1 ? '1 Connection' : `${total} Connections`;
};

/**
 * Get field value with fallback for different naming conventions
 */
export const getFieldValue = (customer: any, dbField: string, jsField: string): any => {
  if (!customer) return null;
  return customer[dbField] ?? customer[jsField] ?? null;
};

/**
 * Get all connection credentials for a customer
 */
export const getConnectionCredentials = (customer: any): Array<{
  connection_number: number;
  username: string;
  password: string;
  m3u_url?: string;
  status?: string;
}> => {
  if (!customer) return [];
  
  // For consolidated customers
  if (isConsolidatedCustomer(customer)) {
    const connectionDetails = customer.connection_details || customer.connection_list || [];
    if (Array.isArray(connectionDetails) && connectionDetails.length > 0) {
      return connectionDetails;
    }
  }
  
  // For legacy customers, return single connection
  if (customer.username && customer.password) {
    return [{
      connection_number: 1,
      username: customer.username,
      password: customer.password,
      m3u_url: customer.m3u_url || customer.m3uUrl,
      status: customer.status || 'active'
    }];
  }
  
  return [];
};

/**
 * Check if customer has credentials
 */
export const hasCredentials = (customer: any): boolean => {
  const credentials = getConnectionCredentials(customer);
  return credentials.length > 0;
};

/**
 * Group legacy customers by email and reseller for potential consolidation
 */
export const groupCustomersByEmailAndReseller = (customers: Customer[]): CustomerGroup[] => {
  const groups: { [key: string]: Customer[] } = {};
  
  customers.forEach(customer => {
    // Skip already consolidated customers
    if (isConsolidatedCustomer(customer)) {
      return;
    }
    
    const groupKey = `${customer.email}_${customer.resellerId}`;
    if (!groups[groupKey]) {
      groups[groupKey] = [];
    }
    groups[groupKey].push(customer);
  });
  
  return Object.entries(groups)
    .filter(([_, customerList]) => customerList.length > 1) // Only groups with multiple customers
    .map(([groupKey, customerList]) => ({
      groupKey,
      customers: customerList,
      name: getCustomerDisplayName(customerList[0]),
      email: customerList[0].email,
      resellerId: customerList[0].resellerId
    }));
};

/**
 * Convert legacy customer group to consolidated format
 */
export const convertToConsolidatedCustomer = (customerGroup: CustomerGroup): ConsolidatedCustomer => {
  const primaryCustomer = customerGroup.customers[0];
  
  const connectionDetails = customerGroup.customers.map((customer, index) => ({
    connection_number: index + 1,
    username: customer.username,
    password: customer.password,
    m3u_url: customer.m3uUrl,
    macAddress: customer.macAddress
  }));
  
  return {
    id: primaryCustomer.id,
    name: getCustomerDisplayName(primaryCustomer),
    email: primaryCustomer.email,
    deviceType: primaryCustomer.deviceType,
    planDuration: primaryCustomer.planDuration,
    expirationDate: primaryCustomer.expirationDate,
    status: primaryCustomer.status as 'active' | 'expired' | 'cancelled' | 'pending',
    isDeactivated: primaryCustomer.isDeactivated,
    cancelledAt: primaryCustomer.cancelledAt,
    highlevelContactId: primaryCustomer.highlevelContactId,
    customerGroup: primaryCustomer.customerGroup,
    macAddress: primaryCustomer.macAddress,
    isTrial: primaryCustomer.isTrial,
    startDate: primaryCustomer.startDate,
    provider: primaryCustomer.provider,
    totalConnections: customerGroup.customers.length,
    connectionEntries: customerGroup.customers,
    connectionDetails: connectionDetails
  };
};

/**
 * Process customers list to handle both consolidated and legacy formats
 */
export const processCustomersForDisplay = (customers: Customer[]): any[] => {
  const processedCustomers: any[] = [];
  const processedGroups = new Set<string>();
  
  customers.forEach(customer => {
    // If it's already consolidated, add it directly
    if (isConsolidatedCustomer(customer)) {
      processedCustomers.push(customer);
      return;
    }
    
    // For legacy customers, check if we should group them
    const customerGroup = customer.customerGroup;
    if (customerGroup && !processedGroups.has(customerGroup)) {
      // Find all customers in the same group
      const groupCustomers = customers.filter(c => c.customerGroup === customerGroup);
      
      if (groupCustomers.length > 1) {
        // Create a consolidated representation
        const consolidatedCustomer = {
          ...customer,
          name: getCustomerDisplayName(customer),
          total_connections: groupCustomers.length,
          connection_details: groupCustomers.map((c, index) => ({
            connection_number: index + 1,
            username: c.username,
            password: c.password,
            m3u_url: c.m3uUrl,
            status: c.status
          })),
          isConsolidated: true
        };
        
        processedCustomers.push(consolidatedCustomer);
        processedGroups.add(customerGroup);
      } else {
        // Single customer in group
        processedCustomers.push(customer);
        processedGroups.add(customerGroup);
      }
    } else if (!customerGroup) {
      // Customer without group
      processedCustomers.push(customer);
    }
    // Skip customers that are part of an already processed group
  });
  
  return processedCustomers;
};

/**
 * Extract primary credential from customer
 */
export const getPrimaryCredential = (customer: any): {
  username?: string;
  password?: string;
  m3u_url?: string;
} => {
  const credentials = getConnectionCredentials(customer);
  if (credentials.length > 0) {
    return {
      username: credentials[0].username,
      password: credentials[0].password,
      m3u_url: credentials[0].m3u_url
    };
  }
  
  return {
    username: customer.username,
    password: customer.password,
    m3u_url: customer.m3u_url || customer.m3uUrl
  };
};

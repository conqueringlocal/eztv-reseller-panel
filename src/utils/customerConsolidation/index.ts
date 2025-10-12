
import { Customer } from '@/contexts/AppContext';
import { ConsolidatedCustomer, CustomerGroup } from './types';

// Re-export types and functions from separate modules
export type { CustomerCredentials, ConsolidatedCustomer, CustomerGroup } from './types';
export { getCustomersNeedingConsolidation, processCustomersForDisplay } from './groupingUtils';
export { getFieldValue } from './fieldHelpers';
export { getConnectionDetails } from './connectionUtils';  
export { isConsolidatedCustomer, getCustomerDisplayName, getTotalConnections, getConnectionSummary } from './customerInfo';
export { getCustomerCredentials, formatCredentialsForDisplay } from './credentialsUtils';
export { 
  findPotentialDuplicates, 
  checkForExistingCustomer, 
  findAllDuplicateGroups,
  normalizeName,
  normalizeEmail 
} from './duplicateDetection';
export type { DuplicateCustomerMatch } from './duplicateDetection';

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
  const connectionList = customer.connection_list || customer.connectionList || [];
  if (Array.isArray(connectionList) && connectionList.length > 0) {
    return connectionList.map((conn: any, index: number) => ({
      connection_number: conn.connection_number || index + 1,
      username: conn.username || '',
      password: conn.password || '',
      m3u_url: conn.m3u_url,
      status: conn.status || customer.status || 'active'
    }));
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
    // Skip already consolidated customers by checking total_connections
    const totalConnections = (customer as any).total_connections || (customer as any).totalConnections;
    if (totalConnections && totalConnections > 1) {
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
      name: customerList[0].name?.replace(/\s*\(Connection\s+\d+\)\s*/gi, '').trim() || 'Unknown Customer',
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
    connectionNumber: index + 1,
    username: customer.username,
    password: customer.password,
    m3uUrl: customer.m3uUrl,
    macAddress: customer.macAddress
  }));
  
  return {
    id: primaryCustomer.id,
    name: primaryCustomer.name?.replace(/\s*\(Connection\s+\d+\)\s*/gi, '').trim() || 'Unknown Customer',
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

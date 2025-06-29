// Utility functions for handling consolidated customer records

export interface ConsolidatedCustomer {
  id: string;
  name: string;
  email: string;
  total_connections: number;
  connection_list: ConnectionDetail[];
  status: string;
  expiration_date: string;
  start_date: string;
  plan_duration: number;
  device_type: string;
  provider: string;
  customer_group: string;
  reseller_id: string;
  is_deactivated?: boolean;
  cancelled_at?: string;
  is_trial?: boolean;
  created_at: string;
  // ... other customer fields
}

export interface ConnectionDetail {
  connection_number: number;
  username: string;
  password: string;
  m3u_url?: string;
  status: string;
}

export interface LegacyCustomer {
  id: string;
  name: string;
  email: string;
  username: string;
  password: string;
  m3u_url?: string;
  max_connections: number;
  connection_sequence?: number;
  customer_group: string;
  expiration_date: string;
  start_date: string;
  plan_duration: number;
  device_type: string;
  provider: string;
  status: string;
  reseller_id: string;
  is_deactivated?: boolean;
  cancelled_at?: string;
  is_trial?: boolean;
  created_at: string;
  // ... other customer fields
}

/**
 * Check if a customer record uses the new consolidated format
 */
export const isConsolidatedCustomer = (customer: any): customer is ConsolidatedCustomer => {
  return customer.connection_list && Array.isArray(customer.connection_list) && customer.total_connections > 0;
};

/**
 * Get the display name for a customer, removing connection suffixes
 */
export const getCustomerDisplayName = (customer: any): string => {
  if (isConsolidatedCustomer(customer)) {
    return customer.name; // Already cleaned up
  }
  
  // For legacy customers, remove connection suffixes like "(Connection 1)", "(Connection 2)", etc.
  return customer.name
    .replace(/ \(Connection \d+\)$/i, '')
    .replace(/ - Connection \d+$/i, '')
    .replace(/ #\d+$/i, '')
    .trim();
};

/**
 * Get the total number of connections for a customer
 */
export const getTotalConnections = (customer: any): number => {
  if (isConsolidatedCustomer(customer)) {
    return customer.total_connections || customer.connection_list.length;
  }
  
  return customer.max_connections || 1;
};

/**
 * Get all credentials for a customer (consolidated or individual)
 */
export const getCustomerCredentials = (customer: any): ConnectionDetail[] => {
  if (isConsolidatedCustomer(customer)) {
    return customer.connection_list;
  }
  
  // For legacy customers, create a single connection detail
  return [{
    connection_number: customer.connection_sequence || 1,
    username: customer.username,
    password: customer.password,
    m3u_url: customer.m3u_url,
    status: customer.status
  }];
};

/**
 * Get a summary of connection details for display
 */
export const getConnectionSummary = (customer: any): string => {
  const totalConnections = getTotalConnections(customer);
  
  if (totalConnections === 1) {
    return '1 Connection';
  }
  
  return `${totalConnections} Connections`;
};

/**
 * Create a customer grouping key based on normalized name and email
 */
export const createCustomerGroupKey = (name: string, email: string): string => {
  const normalizedName = name
    .replace(/ \(Connection \d+\)$/i, '')
    .replace(/ - Connection \d+$/i, '')
    .replace(/ #\d+$/i, '')
    .trim()
    .toLowerCase();
  
  return `${normalizedName}_${email.toLowerCase()}`;
};

/**
 * Check if customers should be grouped together based on name and email similarity
 */
export const shouldGroupCustomers = (customer1: any, customer2: any): boolean => {
  if (customer1.reseller_id !== customer2.reseller_id) {
    return false;
  }
  
  const key1 = createCustomerGroupKey(customer1.name, customer1.email);
  const key2 = createCustomerGroupKey(customer2.name, customer2.email);
  
  return key1 === key2;
};

/**
 * Group legacy customers by similarity (name + email combination)
 */
export const groupLegacyCustomers = (customers: any[]): { [key: string]: any[] } => {
  return customers.reduce((groups, customer) => {
    // First try to use existing customer_group if it exists and is meaningful
    let groupKey = customer.customer_group;
    
    // If no customer_group or it's generic, create one based on name + email
    if (!groupKey || groupKey === 'ungrouped' || groupKey.startsWith('default_')) {
      groupKey = createCustomerGroupKey(customer.name, customer.email);
    }
    
    if (!groups[groupKey]) {
      groups[groupKey] = [];
    }
    groups[groupKey].push(customer);
    return groups;
  }, {} as { [key: string]: any[] });
};

/**
 * Create a virtual consolidated customer from legacy customer records
 */
export const createVirtualConsolidatedCustomer = (legacyCustomers: any[]): ConsolidatedCustomer => {
  if (legacyCustomers.length === 0) {
    throw new Error('Cannot create virtual consolidated customer from empty array');
  }

  // Sort by connection sequence for consistent ordering
  const sortedCustomers = legacyCustomers.sort((a, b) => 
    (a.connection_sequence || 1) - (b.connection_sequence || 1)
  );

  const primaryCustomer = sortedCustomers[0];
  
  // Create connection list from all customers
  const connectionList: ConnectionDetail[] = sortedCustomers.map((customer, index) => ({
    connection_number: customer.connection_sequence || (index + 1),
    username: customer.username,
    password: customer.password,
    m3u_url: customer.m3u_url,
    status: customer.status
  }));

  return {
    id: primaryCustomer.id,
    name: getCustomerDisplayName(primaryCustomer),
    email: primaryCustomer.email,
    total_connections: sortedCustomers.length,
    connection_list: connectionList,
    status: primaryCustomer.status,
    expiration_date: primaryCustomer.expiration_date,
    start_date: primaryCustomer.start_date,
    plan_duration: primaryCustomer.plan_duration,
    device_type: primaryCustomer.device_type,
    provider: primaryCustomer.provider,
    customer_group: primaryCustomer.customer_group,
    reseller_id: primaryCustomer.reseller_id,
    is_deactivated: primaryCustomer.is_deactivated,
    cancelled_at: primaryCustomer.cancelled_at,
    is_trial: primaryCustomer.is_trial,
    created_at: primaryCustomer.created_at,
    // Copy other fields from primary customer
    ...primaryCustomer
  };
};

/**
 * Process customers list to handle both consolidated and legacy formats
 * This function now properly consolidates customers with similar names
 */
export const processCustomersForDisplay = (customers: any[]): (ConsolidatedCustomer | any)[] => {
  const grouped = groupLegacyCustomers(customers);
  const processedCustomers: (ConsolidatedCustomer | any)[] = [];

  Object.entries(grouped).forEach(([groupKey, groupCustomers]) => {
    if (groupCustomers.length === 1) {
      // Single customer - add as-is but clean up the name
      const customer = { ...groupCustomers[0] };
      customer.name = getCustomerDisplayName(customer);
      processedCustomers.push(customer);
    } else {
      // Multiple customers - check if any is already consolidated
      const consolidatedCustomer = groupCustomers.find(isConsolidatedCustomer);
      
      if (consolidatedCustomer) {
        // Use the consolidated customer
        processedCustomers.push(consolidatedCustomer);
      } else {
        // Create virtual consolidated customer from legacy records
        const virtualConsolidated = createVirtualConsolidatedCustomer(groupCustomers);
        processedCustomers.push(virtualConsolidated);
      }
    }
  });

  return processedCustomers;
};

/**
 * Format credentials for display or export
 */
export const formatCredentialsForDisplay = (customer: any): string => {
  const credentials = getCustomerCredentials(customer);
  const totalConnections = getTotalConnections(customer);
  
  let formatted = `Customer: ${getCustomerDisplayName(customer)}\n`;
  formatted += `Email: ${customer.email}\n`;
  formatted += `Total Connections: ${totalConnections}\n\n`;
  
  credentials.forEach((conn, index) => {
    if (totalConnections > 1) {
      formatted += `Connection ${conn.connection_number}:\n`;
    }
    formatted += `Username: ${conn.username}\n`;
    formatted += `Password: ${conn.password}\n`;
    if (conn.m3u_url) {
      formatted += `M3U URL: ${conn.m3u_url}\n`;
    }
    if (index < credentials.length - 1) {
      formatted += `\n`;
    }
  });
  
  return formatted;
};

/**
 * Safe date formatting function that handles invalid dates
 */
export const formatDateSafely = (dateString: string | null | undefined): string => {
  if (!dateString) return 'Not set';
  
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) {
      return 'Invalid date';
    }
    return date.toLocaleDateString();
  } catch (error) {
    return 'Invalid date';
  }
};

/**
 * Calculate days until expiration safely
 */
export const getDaysUntilExpirationSafely = (expirationDate: string | null | undefined): number | null => {
  if (!expirationDate) return null;
  
  try {
    const expDate = new Date(expirationDate);
    if (isNaN(expDate.getTime())) {
      return null;
    }
    
    const today = new Date();
    const diffTime = expDate.getTime() - today.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  } catch (error) {
    return null;
  }
};

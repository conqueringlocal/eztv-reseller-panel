// Utility functions for handling consolidated customer records

export interface ConsolidatedCustomer {
  id: string;
  name: string;
  email: string;
  total_connections: number;
  connection_list: ConnectionDetail[];
  status: string;
  expiration_date: string;
  plan_duration: number;
  device_type: string;
  provider: string;
  customer_group: string;
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
  // ... other customer fields
}

/**
 * Check if a customer record uses the new consolidated format
 */
export const isConsolidatedCustomer = (customer: any): customer is ConsolidatedCustomer => {
  return customer.connection_list && Array.isArray(customer.connection_list);
};

/**
 * Get the display name for a customer, removing connection suffixes
 */
export const getCustomerDisplayName = (customer: any): string => {
  if (isConsolidatedCustomer(customer)) {
    return customer.name; // Already cleaned up
  }
  
  // For legacy customers, remove connection suffixes
  return customer.name.replace(/ \(Connection \d+\)$/, '').trim();
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
 * Check if customer credentials should be grouped together
 */
export const shouldGroupCredentials = (customers: any[]): boolean => {
  if (customers.length <= 1) return false;
  
  // Check if all customers belong to the same group
  const firstCustomerGroup = customers[0]?.customer_group;
  return customers.every(customer => customer.customer_group === firstCustomerGroup);
};

/**
 * Group legacy customers by customer_group for display
 */
export const groupLegacyCustomers = (customers: any[]): { [key: string]: any[] } => {
  return customers.reduce((groups, customer) => {
    const group = customer.customer_group || 'ungrouped';
    if (!groups[group]) {
      groups[group] = [];
    }
    groups[group].push(customer);
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
  const connectionList: ConnectionDetail[] = sortedCustomers.map(customer => ({
    connection_number: customer.connection_sequence || 1,
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
    plan_duration: primaryCustomer.plan_duration,
    device_type: primaryCustomer.device_type,
    provider: primaryCustomer.provider,
    customer_group: primaryCustomer.customer_group,
    // Copy other fields from primary customer
    ...primaryCustomer
  };
};

/**
 * Process customers list to handle both consolidated and legacy formats
 */
export const processCustomersForDisplay = (customers: any[]): (ConsolidatedCustomer | any)[] => {
  const grouped = groupLegacyCustomers(customers);
  const processedCustomers: (ConsolidatedCustomer | any)[] = [];

  Object.entries(grouped).forEach(([groupKey, groupCustomers]) => {
    if (groupKey === 'ungrouped' || groupCustomers.length === 1) {
      // Add individual customers as-is
      processedCustomers.push(...groupCustomers);
    } else {
      // Check if any customer in the group is already consolidated
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

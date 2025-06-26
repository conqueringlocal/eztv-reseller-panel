
import { Customer } from '@/contexts/AppContext';

export interface ConsolidatedCustomer extends Omit<Customer, 'maxConnections' | 'currentConnections'> {
  totalConnections: number;
  connectionEntries: Customer[];
  connectionDetails: Array<{
    connectionNumber: number;
    username: string;
    password: string;
    macAddress?: string;
    m3uUrl?: string;
  }>;
}

export function consolidateCustomers(customers: Customer[]): ConsolidatedCustomer[] {
  // Group customers by customer_group_id, falling back to individual customers if no group ID
  const grouped = customers.reduce((acc, customer) => {
    const groupId = customer.customerGroupId || customer.id;
    
    if (!acc[groupId]) {
      acc[groupId] = [];
    }
    acc[groupId].push(customer);
    return acc;
  }, {} as Record<string, Customer[]>);

  // Convert groups to consolidated customers
  return Object.values(grouped).map(group => {
    // Use the first customer as the base, but aggregate connection data
    const primaryCustomer = group[0];
    const totalConnections = group.reduce((sum, c) => sum + (c.maxConnections || 1), 0);
    
    // Create connection details from all customers in the group
    const connectionDetails = group.map((customer, index) => ({
      connectionNumber: index + 1,
      username: customer.username || '',
      password: customer.password || '',
      macAddress: customer.macAddress,
      m3uUrl: customer.m3uUrl,
    }));

    const consolidated: ConsolidatedCustomer = {
      ...primaryCustomer,
      totalConnections,
      connectionEntries: group,
      connectionDetails,
    };

    return consolidated;
  });
}

export function getCustomerDisplayName(customer: ConsolidatedCustomer): string {
  const connectionText = customer.totalConnections > 1 
    ? ` (${customer.totalConnections} connections)` 
    : '';
  return `${customer.name}${connectionText}`;
}

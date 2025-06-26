
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
  // Group customers by customer_group
  const grouped = customers.reduce((acc, customer) => {
    const groupId = customer.customerGroup || customer.id;
    
    if (!acc[groupId]) {
      acc[groupId] = [];
    }
    acc[groupId].push(customer);
    return acc;
  }, {} as Record<string, Customer[]>);

  // Convert groups to consolidated customers
  return Object.values(grouped).map(group => {
    // Sort by connection_sequence to maintain proper order
    const sortedGroup = group.sort((a, b) => (a.connectionSequence || 1) - (b.connectionSequence || 1));
    
    // Use the first customer as the base, but aggregate connection data
    const primaryCustomer = sortedGroup[0];
    const totalConnections = sortedGroup.length;
    
    // Create connection details from all customers in the group, ordered by sequence
    const connectionDetails = sortedGroup.map((customer) => ({
      connectionNumber: customer.connectionSequence || 1,
      username: customer.username || '',
      password: customer.password || '',
      macAddress: customer.macAddress,
      m3uUrl: customer.m3uUrl,
    }));

    const consolidated: ConsolidatedCustomer = {
      ...primaryCustomer,
      totalConnections,
      connectionEntries: sortedGroup,
      connectionDetails,
    };

    return consolidated;
  });
}

export function getCustomerDisplayName(customer: ConsolidatedCustomer): string {
  // Simply return the customer name without connection count
  return customer.name;
}

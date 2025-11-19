
import { Customer } from '@/contexts/AppContext';

export interface ConsolidatedCustomer {
  id: string;
  name: string;
  email: string;
  deviceType: string;
  planDuration: number;
  expirationDate: string;
  status: 'active' | 'expired' | 'cancelled' | 'pending'; // Fixed: use specific type instead of string
  isDeactivated: boolean;
  cancelledAt: string | null;
  highlevelContactId?: string;
  customerGroup?: string;
  macAddress?: string;
  isTrial?: boolean;
  startDate?: string;
  
  // Consolidated properties
  totalConnections: number;
  connectionEntries: Customer[];
  connectionDetails: Array<{
    connectionNumber: number;
    username?: string;
    password?: string;
    macAddress?: string;
    m3uUrl?: string;
    expirationDate?: string;
  }>;
}

export function consolidateCustomers(customers: Customer[]): ConsolidatedCustomer[] {
  const groupedCustomers = new Map<string, Customer[]>();

  // Group customers by customer_group
  customers.forEach(customer => {
    const groupKey = customer.customerGroup || customer.id;
    if (!groupedCustomers.has(groupKey)) {
      groupedCustomers.set(groupKey, []);
    }
    groupedCustomers.get(groupKey)!.push(customer);
  });

  // Convert groups to consolidated customers
  return Array.from(groupedCustomers.entries()).map(([groupKey, groupCustomers]) => {
    // Sort by connection sequence to ensure consistent ordering
    const sortedCustomers = groupCustomers.sort((a, b) => 
      (a.connectionSequence || 1) - (b.connectionSequence || 1)
    );
    
    const primaryCustomer = sortedCustomers[0];
    
    return {
      id: groupKey,
      name: primaryCustomer.name,
      email: primaryCustomer.email,
      deviceType: primaryCustomer.deviceType,
      planDuration: primaryCustomer.planDuration,
      expirationDate: primaryCustomer.expirationDate,
      status: (primaryCustomer.status as 'active' | 'expired' | 'cancelled' | 'pending') || 'active', // Fixed: cast to proper type
      isDeactivated: primaryCustomer.isDeactivated,
      cancelledAt: primaryCustomer.cancelledAt,
      highlevelContactId: primaryCustomer.highlevelContactId,
      customerGroup: primaryCustomer.customerGroup,
      macAddress: sortedCustomers.length === 1 ? primaryCustomer.macAddress : undefined,
      isTrial: primaryCustomer.isTrial,
      startDate: primaryCustomer.startDate,
      
      totalConnections: sortedCustomers.length,
      connectionEntries: sortedCustomers,
      connectionDetails: sortedCustomers.map(customer => ({
        connectionNumber: customer.connectionSequence || 1,
        username: customer.username,
        password: customer.password,
        macAddress: customer.macAddress,
        m3uUrl: customer.m3uUrl || '',
        expirationDate: customer.expirationDate
      }))
    };
  });
}

export function getCustomerDisplayName(customer: ConsolidatedCustomer): string {
  // Simply return the customer name without any connection information
  return customer.name;
}

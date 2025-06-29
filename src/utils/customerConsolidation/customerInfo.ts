
import { getFieldValue } from './fieldHelpers';

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

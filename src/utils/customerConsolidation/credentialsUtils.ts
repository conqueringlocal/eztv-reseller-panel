
import { getFieldValue } from './fieldHelpers';
import { getCustomerDisplayName, getTotalConnections } from './customerInfo';
import { CustomerCredentials } from './types';

// Get customer credentials for display
export function getCustomerCredentials(customer: any): CustomerCredentials[] {
  const connectionList = getFieldValue(customer, 'connection_list', 'connectionList');
  
  if (connectionList && Array.isArray(connectionList)) {
    return connectionList.map((conn: any, index: number) => ({
      connection_number: conn.connection_number || index + 1,
      username: conn.username || '',
      password: conn.password || '',
      m3u_url: conn.m3u_url,
      status: conn.status || customer.status || 'active'
    }));
  }
  
  // Fallback for non-consolidated customers
  return [{
    connection_number: 1,
    username: customer.username || '',
    password: customer.password || '',
    m3u_url: customer.m3u_url,
    status: customer.status || 'active'
  }];
}

// Format credentials for display/download
export function formatCredentialsForDisplay(customer: any): string {
  const displayName = getCustomerDisplayName(customer);
  const credentials = getCustomerCredentials(customer);
  const totalConnections = getTotalConnections(customer);
  
  let formatted = `Customer: ${displayName}\n`;
  formatted += `Email: ${customer.email}\n`;
  formatted += `Total Connections: ${totalConnections}\n\n`;
  
  credentials.forEach((cred, index) => {
    if (totalConnections > 1) {
      formatted += `Connection ${cred.connection_number}:\n`;
    }
    formatted += `Username: ${cred.username}\n`;
    formatted += `Password: ${cred.password}\n`;
    if (cred.m3u_url) {
      formatted += `M3U URL: ${cred.m3u_url}\n`;
    }
    formatted += `Status: ${cred.status}\n`;
    if (index < credentials.length - 1) {
      formatted += `\n`;
    }
  });
  
  return formatted;
}

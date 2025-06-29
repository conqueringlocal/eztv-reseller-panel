
import { getFieldValue } from './fieldHelpers';

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

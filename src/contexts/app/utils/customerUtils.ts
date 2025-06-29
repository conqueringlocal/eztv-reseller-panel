
import { Customer } from '../types';

// Helper function to convert database customer to interface Customer
export const convertDbCustomerToCustomer = (dbCustomer: any): Customer => {
  return {
    id: dbCustomer.id,
    createdAt: dbCustomer.created_at,
    resellerId: dbCustomer.reseller_id,
    name: dbCustomer.name,
    email: dbCustomer.email,
    username: dbCustomer.username || '',
    password: dbCustomer.password,
    macAddress: dbCustomer.mac_address,
    deviceType: dbCustomer.device_type,
    packageId: dbCustomer.customer_group_id || 'default',
    planDuration: dbCustomer.plan_duration,
    maxConnections: dbCustomer.max_connections || 1,
    currentConnections: dbCustomer.current_connections || 0,
    connectionDetails: dbCustomer.connection_details || [],
    startDate: dbCustomer.start_date,
    expirationDate: dbCustomer.expiration_date,
    status: dbCustomer.status,
    isDeactivated: dbCustomer.is_deactivated || false,
    provider: dbCustomer.provider || '8k',
    customer_group: dbCustomer.customer_group,
    customer_group_id: dbCustomer.customer_group_id,
    m3u_url: dbCustomer.m3u_url,
    connection_sequence: dbCustomer.connection_sequence,
    cancelledAt: dbCustomer.cancelled_at,
    highlevelContactId: dbCustomer.highlevel_contact_id,
    // Add compatibility properties
    customerGroup: dbCustomer.customer_group,
    connectionSequence: dbCustomer.connection_sequence,
    m3uUrl: dbCustomer.m3u_url,
    isTrial: dbCustomer.is_trial || false,
  };
};

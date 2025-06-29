
import { Customer } from '@/contexts/AppContext';

// Enhanced interface for consolidated customers
export interface ConsolidatedCustomer {
  id: string;
  name: string;
  email: string;
  deviceType: string;
  planDuration: number;
  expirationDate: string;
  status: 'active' | 'expired' | 'cancelled' | 'pending';
  isDeactivated: boolean;
  cancelledAt: string | null;
  highlevelContactId?: string;
  customerGroup?: string;
  macAddress?: string;
  isTrial?: boolean;
  startDate?: string;
  provider?: string;
  
  // Consolidated properties
  totalConnections: number;
  connectionEntries: Customer[];
  connectionDetails: Array<{
    connectionNumber: number;
    username?: string;
    password?: string;
    macAddress?: string;
    m3uUrl?: string;
  }>;
}

export interface CustomerGroup {
  groupKey: string;
  customers: Customer[];
  name: string;
  email: string;
  resellerId: string;
}

export interface CustomerCredentials {
  connection_number: number;
  username: string;
  password: string;
  m3u_url?: string;
  status: string;
}

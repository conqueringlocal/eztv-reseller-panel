
import { Session } from '@supabase/supabase-js';

export interface Customer {
  id: string;
  createdAt: string;
  resellerId: string;
  name: string;
  email: string;
  username: string;
  password?: string;
  macAddress?: string | null;
  deviceType: string;
  packageId: string;
  package_id?: string | null;
  planDuration: number;
  maxConnections: number;
  currentConnections: number;
  connectionDetails: any[];
  startDate: string;
  expirationDate: string;
  status: string;
  isDeactivated: boolean;
  provider: string;
  customer_group?: string;
  customer_group_id?: string | null;
  m3u_url?: string | null;
  connection_sequence?: number | null;
  cancelledAt?: string | null;
  highlevelContactId?: string | null;
  // Add missing properties for compatibility
  customerGroup?: string;
  connectionSequence?: number | null;
  m3uUrl?: string | null;
  isTrial?: boolean;
  connection_list?: any[];
  total_connections?: number;
}

export interface CreditLog {
  id: string;
  reseller_id: string;
  date: string;
  action: string;
  credits_used: number;
  customer_id?: string;
  connections_used?: number;
  notes?: string;
  customer_name?: string;
}

export interface Reseller {
  id: string;
  name: string;
  email: string;
  credits: number;
  provider?: string;
  logoUrl?: string;
  accentColor?: string;
}

export interface AppContextType {
  session: Session | null;
  customers: Customer[];
  resellers: Reseller[];
  creditLogs: CreditLog[];
  isLoading: boolean;
  fetchCustomers: () => Promise<void>;
  addCustomer: (customerData: Omit<Customer, 'id' | 'createdAt'>) => Promise<boolean>;
  cancelCustomer: (customerId: string) => Promise<boolean>;
  deactivateCustomer: (customerId: string) => Promise<boolean>;
  reactivateCustomer: (customerId: string) => Promise<boolean>;
  updateCustomer: (customerId: string, updates: Partial<Customer>) => Promise<boolean>;
  refreshData: () => Promise<void>;
  getReseller: (resellerId: string) => Reseller | undefined;
  addCredits: (resellerId: string, credits: number, notes?: string) => Promise<boolean>;
  removeCredits: (resellerId: string, credits: number, notes?: string) => Promise<boolean>;
}

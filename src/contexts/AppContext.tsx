
import React, { createContext, useContext, useState, useEffect } from 'react';
import { useAuth } from './AuthContext';

// Types
export interface Customer {
  id: string;
  resellerId: string;
  name: string;
  email: string;
  macAddress: string;
  deviceType: string;
  planDuration: number;
  startDate: string;
  expirationDate: string;
  createdAt: string;
}

export interface CreditLog {
  id: string;
  resellerId: string;
  date: string;
  action: 'deduction' | 'addition' | 'account_creation';
  creditsUsed: number;
  customerId?: string;
  customerName?: string;
  notes?: string;
}

export interface Reseller {
  id: string;
  name: string;
  email: string;
  credits: number;
}

interface AppContextType {
  customers: Customer[];
  creditLogs: CreditLog[];
  resellers: Reseller[];
  addCustomer: (customer: Omit<Customer, 'id' | 'createdAt' | 'startDate' | 'expirationDate'>) => Promise<boolean>;
  addCredits: (resellerId: string, amount: number, notes?: string) => Promise<boolean>;
  removeCredits: (resellerId: string, amount: number, notes?: string) => Promise<boolean>;
  isLoading: boolean;
  getReseller: (id: string) => Reseller | undefined;
}

// Create the context
const AppContext = createContext<AppContextType>({
  customers: [],
  creditLogs: [],
  resellers: [],
  addCustomer: async () => false,
  addCredits: async () => false,
  removeCredits: async () => false,
  isLoading: true,
  getReseller: () => undefined,
});

// Mock data
const MOCK_RESELLERS: Reseller[] = [
  {
    id: '2',
    name: 'Demo Reseller',
    email: 'reseller@eztv.club',
    credits: 100
  },
  {
    id: '3',
    name: 'Jane Smith',
    email: 'jane@example.com',
    credits: 50
  },
  {
    id: '4',
    name: 'Bob Johnson',
    email: 'bob@example.com',
    credits: 75
  },
];

const MOCK_CUSTOMERS: Customer[] = [
  {
    id: '1',
    resellerId: '2',
    name: 'Alice Cooper',
    email: 'alice@example.com',
    macAddress: '00:1A:2B:3C:4D:5E',
    deviceType: 'Smart TV',
    planDuration: 3,
    startDate: '2023-12-01',
    expirationDate: '2024-03-01',
    createdAt: '2023-12-01T10:30:00Z'
  },
  {
    id: '2',
    resellerId: '2',
    name: 'Bob Dylan',
    email: 'bob.dylan@example.com',
    macAddress: '11:2A:3B:4C:5D:6E',
    deviceType: 'Android Box',
    planDuration: 1,
    startDate: '2023-12-15',
    expirationDate: '2024-01-15',
    createdAt: '2023-12-15T14:45:00Z'
  },
];

const MOCK_CREDIT_LOGS: CreditLog[] = [
  {
    id: '1',
    resellerId: '2',
    date: '2023-12-01T10:30:00Z',
    action: 'deduction',
    creditsUsed: 3,
    customerId: '1',
    customerName: 'Alice Cooper',
    notes: 'Initial subscription'
  },
  {
    id: '2',
    resellerId: '2',
    date: '2023-12-15T14:45:00Z',
    action: 'deduction',
    creditsUsed: 1,
    customerId: '2',
    customerName: 'Bob Dylan',
    notes: 'Monthly subscription'
  },
  {
    id: '3',
    resellerId: '2',
    date: '2023-11-30T09:00:00Z',
    action: 'addition',
    creditsUsed: 50,
    notes: 'Initial credit allocation'
  }
];

// Create the custom hook
export const useApp = () => useContext(AppContext);

// Create the provider
export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [customers, setCustomers] = useState<Customer[]>(MOCK_CUSTOMERS);
  const [creditLogs, setCreditLogs] = useState<CreditLog[]>(MOCK_CREDIT_LOGS);
  const [resellers, setResellers] = useState<Reseller[]>(MOCK_RESELLERS);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // In a real app, we'd fetch data from API based on user role
    setIsLoading(false);
  }, [user]);

  // Helper to get current timestamp
  const getCurrentISOString = () => new Date().toISOString();

  // Helper to generate expiration date
  const getExpirationDate = (months: number): string => {
    const date = new Date();
    date.setMonth(date.getMonth() + months);
    return date.toISOString().split('T')[0];
  };

  // Add new customer
  const addCustomer = async (
    customerData: Omit<Customer, 'id' | 'createdAt' | 'startDate' | 'expirationDate'>
  ): Promise<boolean> => {
    if (!user) return false;
    
    // Check if reseller has enough credits
    const reseller = resellers.find(r => r.id === customerData.resellerId);
    if (!reseller) return false;
    
    if (reseller.credits < customerData.planDuration) {
      return false;
    }
    
    // Create a new customer
    const newCustomer: Customer = {
      ...customerData,
      id: `cust_${Math.floor(Math.random() * 10000)}`,
      createdAt: getCurrentISOString(),
      startDate: new Date().toISOString().split('T')[0],
      expirationDate: getExpirationDate(customerData.planDuration),
    };
    
    // Call IPTV API - in a real app this would be a server call
    // For now, we'll simulate success
    
    // Update state
    setCustomers(prev => [...prev, newCustomer]);
    
    // Deduct credits
    const updatedResellers = resellers.map(r => {
      if (r.id === customerData.resellerId) {
        return { ...r, credits: r.credits - customerData.planDuration };
      }
      return r;
    });
    
    setResellers(updatedResellers);
    
    // Log the credit usage
    const newLog: CreditLog = {
      id: `log_${Math.floor(Math.random() * 10000)}`,
      resellerId: customerData.resellerId,
      date: getCurrentISOString(),
      action: 'account_creation',
      creditsUsed: customerData.planDuration,
      customerId: newCustomer.id,
      customerName: customerData.name,
      notes: `${customerData.planDuration} month subscription`
    };
    
    setCreditLogs(prev => [...prev, newLog]);
    
    return true;
  };

  // Add credits to a reseller
  const addCredits = async (resellerId: string, amount: number, notes?: string): Promise<boolean> => {
    if (amount <= 0) return false;
    
    setResellers(prev => prev.map(reseller => {
      if (reseller.id === resellerId) {
        return { ...reseller, credits: reseller.credits + amount };
      }
      return reseller;
    }));
    
    const newLog: CreditLog = {
      id: `log_${Math.floor(Math.random() * 10000)}`,
      resellerId,
      date: getCurrentISOString(),
      action: 'addition',
      creditsUsed: amount,
      notes: notes || 'Manual credit addition'
    };
    
    setCreditLogs(prev => [...prev, newLog]);
    
    return true;
  };

  // Remove credits from a reseller
  const removeCredits = async (resellerId: string, amount: number, notes?: string): Promise<boolean> => {
    if (amount <= 0) return false;
    
    const reseller = resellers.find(r => r.id === resellerId);
    if (!reseller) return false;
    
    if (reseller.credits < amount) return false;
    
    setResellers(prev => prev.map(r => {
      if (r.id === resellerId) {
        return { ...r, credits: r.credits - amount };
      }
      return r;
    }));
    
    const newLog: CreditLog = {
      id: `log_${Math.floor(Math.random() * 10000)}`,
      resellerId,
      date: getCurrentISOString(),
      action: 'deduction',
      creditsUsed: amount,
      notes: notes || 'Manual credit deduction'
    };
    
    setCreditLogs(prev => [...prev, newLog]);
    
    return true;
  };

  // Get a reseller by ID
  const getReseller = (id: string): Reseller | undefined => {
    return resellers.find(r => r.id === id);
  };

  return (
    <AppContext.Provider
      value={{
        customers,
        creditLogs,
        resellers,
        addCustomer,
        addCredits,
        removeCredits,
        isLoading,
        getReseller
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

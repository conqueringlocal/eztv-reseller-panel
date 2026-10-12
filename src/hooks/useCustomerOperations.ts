
import { useState } from 'react';
import { toast } from 'sonner';
import { Customer } from '@/contexts/AppContext';

export function useCustomerOperations(cancelCustomer: (id: string) => Promise<boolean>, deactivateCustomer: (id: string) => Promise<boolean>, setIsRenewCustomerOpen?: (open: boolean) => void) {
  const [customerToRenew, setCustomerToRenew] = useState<Customer | null>(null);

  // Handle customer cancel
  const handleCancelCustomer = async (customerId: string) => {
    console.log(`🚫 ResellerCustomers: Cancel request for customer ID: ${customerId}`);
    
    try {
      const success = await cancelCustomer(customerId);
      console.log(`📊 ResellerCustomers: Cancel operation result: ${success}`);
      
      if (success) {
        console.log(`✅ ResellerCustomers: Customer ${customerId} cancelled successfully`);
        // Success toast is handled by AppContext
      } else {
        console.error(`❌ ResellerCustomers: Cancel operation failed for customer ${customerId}`);
        toast.error('Failed to cancel customer account - please check logs and try again');
      }
    } catch (error) {
      console.error('💥 ResellerCustomers: Unexpected error during customer cancellation:', error);
      toast.error('An error occurred while cancelling the customer account');
    }
  };

  // Handle customer deactivate
  const handleDeactivateCustomer = async (customerId: string) => {
    try {
      const success = await deactivateCustomer(customerId);
      if (success) {
        toast.success('Customer deactivated successfully');
      } else {
        toast.error('Failed to deactivate customer');
      }
    } catch (error) {
      toast.error('An error occurred while deactivating the customer');
      console.error(error);
    }
  };

  // Handle customer renew
  const handleRenewCustomer = (customer: Customer) => {
    console.log('🔄 handleRenewCustomer called for customer:', customer.name);
    setCustomerToRenew(customer);
    if (setIsRenewCustomerOpen) {
      setIsRenewCustomerOpen(true);
      console.log('✅ Dialog state set to open');
    } else {
      console.warn('⚠️ setIsRenewCustomerOpen not provided to useCustomerOperations');
    }
  };

  return {
    customerToRenew,
    setCustomerToRenew,
    handleCancelCustomer,
    handleDeactivateCustomer,
    handleRenewCustomer,
  };
}

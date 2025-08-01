
import { useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Customer } from '@/contexts/AppContext';

export function useCustomerOperations(user: any, cancelCustomer: any, deactivateCustomer: any, refreshData: any, setIsRenewCustomerOpen?: (open: boolean) => void, setIsCrmManagerOpen?: (open: boolean) => void) {
  const [customerToRenew, setCustomerToRenew] = useState<Customer | null>(null);
  const [selectedCustomerForCrm, setSelectedCustomerForCrm] = useState<Customer | null>(null);

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

  // Handle CRM contact management
  const handleManageCrmContact = (customer: Customer) => {
    if (!customer.highlevelContactId) {
      toast.error('This customer does not have a CRM contact ID');
      return;
    }
    
    console.log('🔧 handleManageCrmContact called for customer:', customer.name);
    setSelectedCustomerForCrm(customer);
    if (setIsCrmManagerOpen) {
      setIsCrmManagerOpen(true);
      console.log('✅ CRM dialog state set to open');
    } else {
      console.warn('⚠️ setIsCrmManagerOpen not provided to useCustomerOperations');
    }
  };

  // Handle sync to CRM
  const handleSyncToCrm = async (customer: Customer) => {
    console.log('🔄 Syncing customer to CRM:', customer.name);
    
    try {
      const { data, error } = await supabase.functions.invoke('sync-customer-to-crm', {
        body: {
          customerId: customer.id,
          resellerId: user?.id
        }
      });

      if (error) {
        console.error('❌ Error syncing customer to CRM:', error);
        toast.error('Failed to sync customer to CRM');
        return;
      }

      if (!data.success) {
        console.error('❌ CRM sync failed:', data.error);
        toast.error(data.error || 'Failed to sync customer to CRM');
        return;
      }

      if (data.skipped) {
        toast.info('Customer is already synced to CRM');
      } else {
        toast.success('Customer successfully synced to CRM');
        await refreshData();
      }
      
    } catch (error) {
      console.error('💥 Unexpected error during CRM sync:', error);
      toast.error('An error occurred while syncing to CRM');
    }
  };

  return {
    customerToRenew,
    selectedCustomerForCrm,
    setCustomerToRenew,
    setSelectedCustomerForCrm,
    handleCancelCustomer,
    handleDeactivateCustomer,
    handleRenewCustomer,
    handleManageCrmContact,
    handleSyncToCrm
  };
}

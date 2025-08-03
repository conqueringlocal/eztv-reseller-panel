
import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Customer } from '../types';
import { convertDbCustomerToCustomer } from '../utils/customerUtils';

export const useCustomers = (user: any, authLoading: boolean) => {
  const [customers, setCustomers] = useState<Customer[]>([]);

  const fetchCustomers = useCallback(async () => {
    try {
      if (!user || authLoading) {
        console.log('⚠️ User not available or auth loading, skipping fetchCustomers');
        return;
      }
      
      console.log('📊 Fetching customers for user:', user.id, 'role:', user.role);
      
      let query = supabase
        .from('customers')
        .select('*')
        .order('created_at', { ascending: false });

      // Only filter by reseller_id if user is not an admin
      if (user.role !== 'admin') {
        console.log(`🔍 Fetching customers for reseller ID: ${user.id}`);
        query = query.eq('reseller_id', user.id);
      } else {
        console.log('👑 Fetching all customers for admin user');
      }

      const { data, error } = await query;

      if (error) {
        console.error('❌ Error fetching customers:', error);
        
        // Handle specific auth-related errors - don't clear data on auth errors
        if (error.message.includes('JWT') || error.message.includes('token') || error.code === 'PGRST301') {
          console.error('🚨 Authentication error while fetching customers - keeping existing data');
          toast.error('Authentication error. Please refresh the page.');
          return; // Don't update customers state on auth errors
        }
        
        toast.error('Failed to load customer data');
        setCustomers([]);
      } else {
        const customerCount = data.length;
        console.log(`✅ Successfully fetched ${customerCount} customers`);
        const convertedCustomers = data.map(convertDbCustomerToCustomer);
        setCustomers(convertedCustomers);
        
        // Debug logging for consolidation status
        if (process.env.NODE_ENV === 'development') {
          const { logCustomerConsolidationStatus } = await import('@/utils/customerConsolidation/debugUtils');
          logCustomerConsolidationStatus(convertedCustomers, user?.id || 'unknown');
        }
      }
    } catch (error) {
      console.error('💥 Unexpected error fetching customers:', error);
      toast.error('An unexpected error occurred while loading customers');
    }
  }, [user, authLoading]);

  const addCustomer = async (customerData: Omit<Customer, 'id' | 'createdAt'>) => {
    console.log(`🚀 Adding customer with provider-specific routing`);
    console.log(`📋 Customer data:`, customerData);
    
    try {
      // Get the user's assigned provider
      const userProvider = user?.provider || '8k';
      console.log(`🏢 User provider: ${userProvider}`);
      
      // Use provider-specific edge function
      let functionName: string;
      
      switch (userProvider) {
        case 'trex':
          functionName = 'create-trex-user';
          break;
        case '8k':
          functionName = 'create-8k-user';
          break;
        default:
          // Fallback to generic function for unknown providers
          functionName = 'create-iptv-user';
      }
      
      console.log(`📞 Calling edge function: ${functionName}`);
      
      const { data, error } = await supabase.functions.invoke(functionName, {
        body: {
          resellerId: customerData.resellerId,
          customerData: {
            name: customerData.name,
            email: customerData.email,
            username: customerData.username,
            macAddress: customerData.macAddress,
            deviceType: customerData.deviceType,
            packageId: customerData.packageId,
            planDuration: customerData.planDuration,
            connections: customerData.maxConnections,
            maxConnections: customerData.maxConnections,
            startDate: customerData.startDate,
            expirationDate: customerData.expirationDate,
            status: customerData.status,
            isDeactivated: customerData.isDeactivated,
          }
        }
      });

      if (error) {
        console.error(`❌ Error calling ${functionName}:`, error);
        toast.error(`Failed to create streaming customer: ${error.message}`);
        return false;
      }

      if (!data.success) {
        console.error(`❌ ${functionName} returned failure:`, data.error);
        toast.error(data.error || `Failed to create streaming customer`);
        return false;
      }

      console.log(`✅ ${functionName} success:`, data);
      
      // Show success message
      const totalCreated = data.customers?.length || 1;
      
      if (totalCreated > 1) {
        toast.success(`EZTV streaming customer created successfully with ${totalCreated} connections!`);
      } else {
        toast.success(`EZTV streaming customer created successfully!`);
      }

      // Refresh customers to show new customer
      await fetchCustomers();
      return true;

    } catch (error) {
      console.error('💥 Unexpected error in addCustomer:', error);
      toast.error('An error occurred while creating the customer');
      return false;
    }
  };

  const cancelCustomer = async (customerId: string) => {
    console.log(`🚫 Attempting to cancel customer ID: ${customerId}`);
    try {
      const { data, error } = await supabase
        .from('customers')
        .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
        .eq('id', customerId)
        .select()
        .single();
  
      if (error) {
        console.error(`❌ Error cancelling customer ${customerId}:`, error);
        toast.error('Failed to cancel customer account');
        return false;
      }
  
      console.log(`✅ Customer ${customerId} cancelled successfully`);
      setCustomers(customers.map(c => c.id === customerId ? { ...c, status: 'cancelled', cancelledAt: new Date().toISOString() } : c));
      toast.success('Customer cancelled successfully');
      return true;
    } catch (error) {
      console.error('💥 Unexpected error during customer cancellation:', error);
      toast.error('An error occurred while cancelling the customer account');
      return false;
    }
  };

  const deactivateCustomer = async (customerId: string) => {
    try {
      const { data, error } = await supabase
        .from('customers')
        .update({ is_deactivated: true })
        .eq('id', customerId)
        .select()
        .single();

      if (error) {
        console.error('Error deactivating customer:', error);
        toast.error('Failed to deactivate customer');
        return false;
      }

      setCustomers(customers.map(c => c.id === customerId ? { ...c, isDeactivated: true } : c));
      return true;
    } catch (error) {
      console.error('Error deactivating customer:', error);
      toast.error('An error occurred while deactivating the customer');
      return false;
    }
  };

  const reactivateCustomer = async (customerId: string) => {
    try {
      const { data, error } = await supabase
        .from('customers')
        .update({ is_deactivated: false })
        .eq('id', customerId)
        .select()
        .single();

      if (error) {
        console.error('Error reactivating customer:', error);
        toast.error('Failed to reactivate customer');
        return false;
      }

      setCustomers(customers.map(c => c.id === customerId ? { ...c, isDeactivated: false } : c));
      toast.success('Customer reactivated successfully');
      return true;
    } catch (error) {
      console.error('Error reactivating customer:', error);
      toast.error('An error occurred while reactivating the customer');
      return false;
    }
  };

  const updateCustomer = async (customerId: string, updates: Partial<Customer>) => {
    try {
      const { data, error } = await supabase
        .from('customers')
        .update(updates)
        .eq('id', customerId)
        .select()
        .single();

      if (error) {
        console.error('Error updating customer:', error);
        toast.error('Failed to update customer');
        return false;
      }

      setCustomers(customers.map(c => c.id === customerId ? { ...c, ...updates } : c));
      toast.success('Customer updated successfully');
      return true;
    } catch (error) {
      console.error('Error updating customer:', error);
      toast.error('An error occurred while updating the customer');
      return false;
    }
  };

  return {
    customers,
    setCustomers,
    fetchCustomers,
    addCustomer,
    cancelCustomer,
    deactivateCustomer,
    reactivateCustomer,
    updateCustomer,
  };
};

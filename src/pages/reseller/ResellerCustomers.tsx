import React, { useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { StatCard } from '@/components/dashboard/StatCard';
import { useApp } from '@/contexts/AppContext';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { CustomerTable } from '@/components/customers/CustomerTable';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { AddCustomerForm } from '@/components/customers/AddCustomerForm';
import { Customer } from '@/contexts/AppContext';
import { toast } from 'sonner';
import { RenewCustomerForm } from '@/components/customers/RenewCustomerForm';
import { CrmContactManager } from '@/components/crm/CrmContactManager';
import { CreateTrialForm } from '@/components/customers/CreateTrialForm';
import { BulkImportForm } from '@/components/customers/BulkImportForm';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, UserCheck, Clock, AlertTriangle, UserX, Ban, Upload } from 'lucide-react';

type StatusFilter = 'all' | 'active' | 'expiring' | 'expired' | 'cancelled' | 'deactivated';

export default function ResellerCustomers() {
  const { user } = useAuth();
  const { customers, cancelCustomer, deactivateCustomer, refreshData } = useApp();
  const [isAddCustomerOpen, setIsAddCustomerOpen] = useState(false);
  const [isRenewCustomerOpen, setIsRenewCustomerOpen] = useState(false);
  const [isCrmManagerOpen, setIsCrmManagerOpen] = useState(false);
  const [isCreateTrialOpen, setIsCreateTrialOpen] = useState(false);
  const [isBulkImportOpen, setIsBulkImportOpen] = useState(false);
  const [customerToRenew, setCustomerToRenew] = useState<Customer | null>(null);
  const [selectedCustomerForCrm, setSelectedCustomerForCrm] = useState<Customer | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  
  // Filter customers for this reseller
  const resellerCustomers = customers.filter(c => c.resellerId === user?.id);

  // Check if user can create trials
  const canCreateTrials = true; // Always allow trial creation for EZTV

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

  // Handle customer renew - simplified since form handles everything now
  const handleRenewCustomer = (customer: Customer) => {
    setCustomerToRenew(customer);
    setIsRenewCustomerOpen(true);
  };

  // Handle CRM contact management
  const handleManageCrmContact = (customer: Customer) => {
    // Check if customer has highlevelContactId property
    if (!customer.highlevelContactId) {
      toast.error('This customer does not have a CRM contact ID');
      return;
    }
    
    setSelectedCustomerForCrm(customer);
    setIsCrmManagerOpen(true);
  };

  // Handle sync to CRM
  const handleSyncToCrm = async (customer: Customer) => {
    console.log('🔄 Syncing customer to CRM:', customer.name);
    
    try {
      // Call the sync-customer-to-crm edge function
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
        // Refresh data to show updated customer with CRM contact ID
        await refreshData();
      }
      
    } catch (error) {
      console.error('💥 Unexpected error during CRM sync:', error);
      toast.error('An error occurred while syncing to CRM');
    }
  };
  
  // Get customer counts by status - Fixed property names to use camelCase
  const today = new Date();
  const sevenDaysFromNow = new Date();
  sevenDaysFromNow.setDate(today.getDate() + 7);
  
  const activeCount = resellerCustomers.filter(c => 
    c.status === 'active' && !c.isDeactivated && !c.cancelledAt
  ).length;
  
  const expiringSoonCount = resellerCustomers.filter(c => {
    if (c.isDeactivated || c.cancelledAt || c.status === 'expired') return false;
    const expirationDate = new Date(c.expirationDate);
    return expirationDate > today && expirationDate <= sevenDaysFromNow;
  }).length;
  
  const expiredCount = resellerCustomers.filter(c => 
    c.status === 'expired' && !c.isDeactivated && !c.cancelledAt
  ).length;
  
  const deactivatedCount = resellerCustomers.filter(c => c.isDeactivated).length;
  const cancelledCount = resellerCustomers.filter(c => c.cancelledAt || c.status === 'cancelled').length;
  
  // Parse token from query string for HighLevel integration
  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const resellerId = params.get('reseller_id');
    const contactId = params.get('contact_id');
    
    if (resellerId || contactId) {
      console.log('Detected external embed params:', { resellerId, contactId });
      // In a real implementation, this would validate the token and set up the session
    }
  }, []);
  
  return (
    <DashboardLayout>
      <div className="mb-6 flex flex-col sm:flex-row sm:justify-between sm:items-center">
        <div>
          <h1 className="text-2xl font-bold mb-2">Customers</h1>
          <p className="text-gray-500">Manage all your EZTV streaming customers</p>
        </div>
        <div className="flex flex-wrap gap-2 mt-4 sm:mt-0">
          <Button 
            onClick={() => setIsBulkImportOpen(true)}
            variant="outline"
            className="bg-purple-50 hover:bg-purple-100 text-purple-700 border-purple-200 flex items-center gap-2"
          >
            <Upload className="h-4 w-4" />
            Bulk Import
          </Button>
          {canCreateTrials && (
            <Button 
              onClick={() => setIsCreateTrialOpen(true)}
              variant="outline"
              className="bg-blue-50 hover:bg-blue-100 text-blue-700 border-blue-200"
            >
              Create Trial
            </Button>
          )}
          <Button 
            onClick={() => setIsAddCustomerOpen(true)}
          >
            Add Customer
          </Button>
        </div>
      </div>
      
      {/* Stats Cards - Fixed grid to ensure consistent sizing */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        <div 
          className={`cursor-pointer transition-all ${statusFilter === 'active' ? 'ring-2 ring-green-500' : ''}`}
          onClick={() => setStatusFilter(statusFilter === 'active' ? 'all' : 'active')}
        >
          <StatCard
            title="Active Subscriptions"
            value={activeCount}
            icon={<UserCheck className="h-5 w-5" />}
            className="border-green-200 bg-green-50 hover:bg-green-100 h-full"
          />
        </div>
        
        <div 
          className={`cursor-pointer transition-all ${statusFilter === 'expiring' ? 'ring-2 ring-yellow-500' : ''}`}
          onClick={() => setStatusFilter(statusFilter === 'expiring' ? 'all' : 'expiring')}
        >
          <StatCard
            title="Expiring Soon"
            value={expiringSoonCount}
            icon={<Clock className="h-5 w-5" />}
            className="border-yellow-200 bg-yellow-50 hover:bg-yellow-100 h-full"
          />
        </div>
        
        <div 
          className={`cursor-pointer transition-all ${statusFilter === 'expired' ? 'ring-2 ring-red-500' : ''}`}
          onClick={() => setStatusFilter(statusFilter === 'expired' ? 'all' : 'expired')}
        >
          <StatCard
            title="Expired"
            value={expiredCount}
            icon={<AlertTriangle className="h-5 w-5" />}
            className="border-red-200 bg-red-50 hover:bg-red-100 h-full"
          />
        </div>
        
        <div 
          className={`cursor-pointer transition-all ${statusFilter === 'cancelled' ? 'ring-2 ring-orange-500' : ''}`}
          onClick={() => setStatusFilter(statusFilter === 'cancelled' ? 'all' : 'cancelled')}
        >
          <StatCard
            title="Cancelled"
            value={cancelledCount}
            icon={<Ban className="h-5 w-5" />}
            className="border-orange-200 bg-orange-50 hover:bg-orange-100 h-full"
          />
        </div>
        
        <div 
          className={`cursor-pointer transition-all ${statusFilter === 'deactivated' ? 'ring-2 ring-gray-500' : ''}`}
          onClick={() => setStatusFilter(statusFilter === 'deactivated' ? 'all' : 'deactivated')}
        >
          <StatCard
            title="Deactivated"
            value={deactivatedCount}
            icon={<UserX className="h-5 w-5" />}
            className="border-gray-200 bg-gray-50 hover:bg-gray-100 h-full"
          />
        </div>
      </div>
      
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            {statusFilter === 'all' ? 
              `All Customers (${resellerCustomers.length})` : 
              `${statusFilter.charAt(0).toUpperCase() + statusFilter.slice(1)} Customers`
            }
          </CardTitle>
          <CardDescription>
            {statusFilter === 'all' ? 
              'View and manage all your customers' : 
              `Showing ${statusFilter} customers - click any stat card to filter or click again to show all`
            }
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CustomerTable 
            customers={resellerCustomers}
            onRefresh={refreshData}
            onRenew={handleRenewCustomer}
            statusFilter={statusFilter}
            onStatusFilterChange={setStatusFilter}
          />
        </CardContent>
      </Card>
      
      {/* Bulk Import Dialog */}
      <Dialog open={isBulkImportOpen} onOpenChange={setIsBulkImportOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Bulk Import Customers</DialogTitle>
            <DialogDescription>
              Import existing customers from CSV and link them to their streaming accounts. 
              This will not create new streaming accounts, only link existing ones.
            </DialogDescription>
          </DialogHeader>
          <BulkImportForm onSuccess={() => {
            setIsBulkImportOpen(false);
            refreshData();
          }} />
        </DialogContent>
      </Dialog>

      {/* Add Customer Dialog */}
      <Dialog open={isAddCustomerOpen} onOpenChange={setIsAddCustomerOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New Customer</DialogTitle>
            <DialogDescription>
              Add a new customer and provision their EZTV streaming account. This will consume credits.
            </DialogDescription>
          </DialogHeader>
          <AddCustomerForm onSuccess={() => setIsAddCustomerOpen(false)} />
        </DialogContent>
      </Dialog>

      {/* Create Trial Dialog */}
      {canCreateTrials && (
        <Dialog open={isCreateTrialOpen} onOpenChange={setIsCreateTrialOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Trial Account</DialogTitle>
              <DialogDescription>
                Create a free 24-hour trial account for a potential customer. No credits will be consumed.
              </DialogDescription>
            </DialogHeader>
            <CreateTrialForm onSuccess={() => setIsCreateTrialOpen(false)} />
          </DialogContent>
        </Dialog>
      )}

      {/* Renew Customer Dialog */}
      {customerToRenew && (
        <Dialog open={isRenewCustomerOpen} onOpenChange={setIsRenewCustomerOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Renew Subscription</DialogTitle>
              <DialogDescription>
                Extend {customerToRenew.name}'s EZTV streaming subscription. This will consume credits based on the number of linked accounts.
              </DialogDescription>
            </DialogHeader>
            <RenewCustomerForm 
              customer={customerToRenew} 
              onSuccess={() => {
                setIsRenewCustomerOpen(false);
                setCustomerToRenew(null);
              }} 
            />
          </DialogContent>
        </Dialog>
      )}

      {/* CRM Contact Manager Dialog */}
      {selectedCustomerForCrm && (
        <Dialog open={isCrmManagerOpen} onOpenChange={setIsCrmManagerOpen}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Manage CRM Contact</DialogTitle>
              <DialogDescription>
                Update custom fields, add notes, and manage tags for {selectedCustomerForCrm.name} in your CRM system
              </DialogDescription>
            </DialogHeader>
            <CrmContactManager
              contactId={selectedCustomerForCrm.highlevelContactId || ''}
              resellerId={user?.id || ''}
              customerName={selectedCustomerForCrm.name}
              onUpdate={() => {
                setIsCrmManagerOpen(false);
                setSelectedCustomerForCrm(null);
                toast.success('CRM contact updated successfully!');
              }}
            />
          </DialogContent>
        </Dialog>
      )}
    </DashboardLayout>
  );
}


import React, { useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { DashboardCard } from '@/components/dashboard/DashboardCard';
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { RenewCustomerForm } from '@/components/customers/RenewCustomerForm';

export default function ResellerCustomers() {
  const { user } = useAuth();
  const { customers, deleteCustomer, deactivateCustomer } = useApp();
  const [isAddCustomerOpen, setIsAddCustomerOpen] = useState(false);
  const [isRenewCustomerOpen, setIsRenewCustomerOpen] = useState(false);
  const [customerToRenew, setCustomerToRenew] = useState<Customer | null>(null);
  
  // Filter customers for this reseller
  const resellerCustomers = customers.filter(c => c.resellerId === user?.id);

  // Handle customer delete
  const handleDeleteCustomer = async (customerId: string) => {
    try {
      const success = await deleteCustomer(customerId);
      if (success) {
        toast.success('Customer deleted successfully');
      } else {
        toast.error('Failed to delete customer');
      }
    } catch (error) {
      toast.error('An error occurred while deleting the customer');
      console.error(error);
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
    setCustomerToRenew(customer);
    setIsRenewCustomerOpen(true);
  };
  
  // Get customer counts by status
  const activeCount = resellerCustomers.filter(c => c.status === 'active' && !c.isDeactivated).length;
  const expiringSoonCount = resellerCustomers.filter(c => c.status === 'expiring_soon' && !c.isDeactivated).length;
  const expiredCount = resellerCustomers.filter(c => c.status === 'expired' && !c.isDeactivated).length;
  const deactivatedCount = resellerCustomers.filter(c => c.isDeactivated).length;
  const totalActiveConnections = resellerCustomers.filter(c => c.status === 'active' && !c.isDeactivated).length;
  
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
          <p className="text-gray-500">Manage all your IPTV customers</p>
        </div>
        <Button 
          onClick={() => setIsAddCustomerOpen(true)}
          className="mt-4 sm:mt-0"
        >
          Add Customer
        </Button>
      </div>
      
      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <DashboardCard title="Active Connections">
          <div className="p-4">
            <div className="text-sm font-medium text-gray-500">Active Connections</div>
            <div className="text-2xl font-bold text-green-600">{totalActiveConnections}</div>
          </div>
        </DashboardCard>
        
        <DashboardCard title="Expiring Soon">
          <div className="p-4">
            <div className="text-sm font-medium text-gray-500">Expiring Soon</div>
            <div className="text-2xl font-bold text-yellow-600">{expiringSoonCount}</div>
          </div>
        </DashboardCard>
        
        <DashboardCard title="Expired">
          <div className="p-4">
            <div className="text-sm font-medium text-gray-500">Expired</div>
            <div className="text-2xl font-bold text-red-600">{expiredCount}</div>
          </div>
        </DashboardCard>
        
        <DashboardCard title="Deactivated">
          <div className="p-4">
            <div className="text-sm font-medium text-gray-500">Deactivated</div>
            <div className="text-2xl font-bold text-gray-600">{deactivatedCount}</div>
          </div>
        </DashboardCard>
      </div>
      
      <DashboardCard
        title={`All Customers (${resellerCustomers.length})`}
        description="View and manage all your customers"
      >
        <CustomerTable 
          customers={resellerCustomers}
          onAddClick={() => setIsAddCustomerOpen(true)}
          onDelete={handleDeleteCustomer}
          onRenew={handleRenewCustomer}
          onDeactivate={handleDeactivateCustomer}
        />
      </DashboardCard>
      
      {/* Add Customer Dialog */}
      <Dialog open={isAddCustomerOpen} onOpenChange={setIsAddCustomerOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New Customer</DialogTitle>
            <DialogDescription>
              Add a new customer and provision their IPTV account. This will consume credits.
            </DialogDescription>
          </DialogHeader>
          <AddCustomerForm onSuccess={() => setIsAddCustomerOpen(false)} />
        </DialogContent>
      </Dialog>

      {/* Renew Customer Dialog */}
      {customerToRenew && (
        <Dialog open={isRenewCustomerOpen} onOpenChange={setIsRenewCustomerOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Renew Subscription</DialogTitle>
              <DialogDescription>
                Extend {customerToRenew.name}'s IPTV subscription. This will consume credits.
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
    </DashboardLayout>
  );
}

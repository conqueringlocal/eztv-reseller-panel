
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
  const { customers, deleteCustomer } = useApp();
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

  // Handle customer renew
  const handleRenewCustomer = (customer: Customer) => {
    setCustomerToRenew(customer);
    setIsRenewCustomerOpen(true);
  };
  
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
      
      <DashboardCard
        title={`All Customers (${resellerCustomers.length})`}
        description="View and manage all your customers"
      >
        <CustomerTable 
          customers={resellerCustomers}
          onAddClick={() => setIsAddCustomerOpen(true)}
          onDelete={handleDeleteCustomer}
          onRenew={handleRenewCustomer}
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


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

export default function ResellerCustomers() {
  const { user } = useAuth();
  const { customers } = useApp();
  const [isAddCustomerOpen, setIsAddCustomerOpen] = useState(false);
  
  // Filter customers for this reseller
  const resellerCustomers = customers.filter(c => c.resellerId === user?.id);
  
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
    </DashboardLayout>
  );
}

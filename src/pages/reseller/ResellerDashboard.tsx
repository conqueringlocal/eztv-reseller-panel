
import React, { useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { DashboardCard } from '@/components/dashboard/DashboardCard';
import { StatCard } from '@/components/dashboard/StatCard';
import { useApp } from '@/contexts/AppContext';
import { useAuth } from '@/contexts/AuthContext';
import { CreditCard, Users, CalendarCheck, Plus } from 'lucide-react';
import { CreditsBadge } from '@/components/dashboard/CreditsBadge';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { CustomerTable } from '@/components/customers/CustomerTable';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { AddCustomerForm } from '@/components/customers/AddCustomerForm';

export default function ResellerDashboard() {
  const { user } = useAuth();
  const { customers } = useApp();
  const navigate = useNavigate();
  const [isAddCustomerOpen, setIsAddCustomerOpen] = useState(false);
  
  // Filter customers for this reseller
  const resellerCustomers = customers.filter(c => c.resellerId === user?.id);
  
  // Calculate expiring soon (next 7 days)
  const today = new Date();
  const nextWeek = new Date();
  nextWeek.setDate(today.getDate() + 7);
  
  const expiringSoon = resellerCustomers.filter(customer => {
    const expiryDate = new Date(customer.expirationDate);
    return expiryDate >= today && expiryDate <= nextWeek;
  }).length;
  
  return (
    <DashboardLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-2">Reseller Dashboard</h1>
        <p className="text-gray-500">Welcome back, {user?.name}</p>
      </div>
      
      {/* Credit Balance */}
      <div className="bg-gradient-to-r from-eztv-600 to-eztv-800 rounded-lg p-6 mb-6 text-white shadow-lg">
        <div className="flex flex-col md:flex-row md:justify-between md:items-center">
          <div>
            <h2 className="text-lg font-medium opacity-90">Your Credit Balance</h2>
            <p className="text-3xl font-bold mt-2">{user?.credits} Credits</p>
          </div>
          <div className="mt-4 md:mt-0">
            <Button 
              variant="secondary"
              className="bg-white text-eztv-800 hover:bg-gray-100"
              onClick={() => navigate('/reseller/customers')}
            >
              <Plus className="mr-2 h-4 w-4" />
              Add Customer
            </Button>
          </div>
        </div>
      </div>
      
      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <StatCard
          title="Total Customers"
          value={resellerCustomers.length}
          icon={<Users className="h-5 w-5" />}
        />
        <StatCard
          title="Expiring Soon"
          value={expiringSoon}
          icon={<CalendarCheck className="h-5 w-5" />}
          description="Subscriptions expiring in the next 7 days"
        />
        <StatCard
          title="Available Credits"
          value={user?.credits || 0}
          icon={<CreditCard className="h-5 w-5" />}
          description="1 credit = 1 month of service"
        />
      </div>
      
      {/* Recent Customers */}
      <DashboardCard
        title="Recent Customers"
        description="Your most recently added customers"
        footer={
          <Button 
            variant="ghost" 
            onClick={() => navigate('/reseller/customers')}
            className="w-full justify-center"
          >
            View All Customers
          </Button>
        }
      >
        <CustomerTable 
          customers={resellerCustomers.slice(0, 5)}
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


import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { DashboardCard } from '@/components/dashboard/DashboardCard';
import { Button } from '@/components/ui/button';
import { useApp } from '@/contexts/AppContext';
import { CreditsBadge } from '@/components/dashboard/CreditsBadge';
import { CustomerTable } from '@/components/customers/CustomerTable';
import { CreditLogTable } from '@/components/credits/CreditLogTable';
import { CreditManageForm } from '@/components/credits/CreditManageForm';
import { HighLevelSettings } from '@/components/resellers/HighLevelSettings';
import { SsoTokenManager } from '@/components/sso/SsoTokenManager';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export default function AdminResellerDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { getReseller, customers, creditLogs } = useApp();
  const [activeTab, setActiveTab] = useState('customers');
  const [isAddCreditsOpen, setIsAddCreditsOpen] = useState(false);
  const [isRemoveCreditsOpen, setIsRemoveCreditsOpen] = useState(false);
  
  // Get reseller data
  const reseller = getReseller(id || '');
  
  // Handle reseller not found
  if (!reseller) {
    return (
      <DashboardLayout>
        <div className="text-center py-12">
          <h1 className="text-2xl font-bold mb-2">Reseller Not Found</h1>
          <p className="text-gray-500 mb-6">The reseller you're looking for doesn't exist.</p>
          <Button onClick={() => navigate('/admin/resellers')}>
            Back to Resellers
          </Button>
        </div>
      </DashboardLayout>
    );
  }
  
  // Filter customers and logs for this reseller
  const resellerCustomers = customers.filter(c => c.resellerId === reseller.id);
  const resellerLogs = creditLogs.filter(l => l.resellerId === reseller.id);
  
  return (
    <DashboardLayout>
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-4">
          <Button variant="ghost" size="sm" onClick={() => navigate('/admin/resellers')}>
            Back to Resellers
          </Button>
        </div>
        
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-end">
          <div>
            <h1 className="text-2xl font-bold mb-1">{reseller.name}</h1>
            <p className="text-gray-500">{reseller.email}</p>
          </div>
          <div className="mt-4 sm:mt-0 flex gap-2 flex-col sm:flex-row">
            <div className="mb-2 sm:mb-0">
              <CreditsBadge credits={reseller.credits} size="lg" />
            </div>
            <Button 
              variant="outline" 
              onClick={() => setIsAddCreditsOpen(true)}
              className="bg-green-50 border-green-200 text-green-700 hover:bg-green-100"
            >
              Add Credits
            </Button>
            <Button 
              variant="outline" 
              onClick={() => setIsRemoveCreditsOpen(true)}
              className="bg-red-50 border-red-200 text-red-700 hover:bg-red-100"
            >
              Remove Credits
            </Button>
          </div>
        </div>
      </div>
      
      <Tabs defaultValue="customers" value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-6">
          <TabsTrigger value="customers">Customers</TabsTrigger>
          <TabsTrigger value="credits">Credit History</TabsTrigger>
          <TabsTrigger value="highlevel">HighLevel Integration</TabsTrigger>
          <TabsTrigger value="sso">SSO Tokens</TabsTrigger>
        </TabsList>
        <TabsContent value="customers">
          <DashboardCard
            title={`Customers (${resellerCustomers.length})`}
            description="All customers created by this reseller"
          >
            <CustomerTable customers={resellerCustomers} />
          </DashboardCard>
        </TabsContent>
        <TabsContent value="credits">
          <DashboardCard
            title="Credit History"
            description="All credit transactions for this reseller"
          >
            <CreditLogTable logs={resellerLogs} />
          </DashboardCard>
        </TabsContent>
        <TabsContent value="highlevel">
          <HighLevelSettings resellerId={reseller.id} isAdminView={true} />
        </TabsContent>
        <TabsContent value="sso">
          <SsoTokenManager />
        </TabsContent>
      </Tabs>
      
      {/* Add Credits Dialog */}
      <Dialog open={isAddCreditsOpen} onOpenChange={setIsAddCreditsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Credits to {reseller.name}</DialogTitle>
            <DialogDescription>
              Add credits to this reseller's account. They'll be available for use immediately.
            </DialogDescription>
          </DialogHeader>
          <CreditManageForm 
            resellerId={reseller.id} 
            type="add" 
            onSuccess={() => setIsAddCreditsOpen(false)} 
          />
        </DialogContent>
      </Dialog>
      
      {/* Remove Credits Dialog */}
      <Dialog open={isRemoveCreditsOpen} onOpenChange={setIsRemoveCreditsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove Credits from {reseller.name}</DialogTitle>
            <DialogDescription>
              Remove credits from this reseller's account. Current balance: {reseller.credits} credits.
            </DialogDescription>
          </DialogHeader>
          <CreditManageForm 
            resellerId={reseller.id} 
            type="remove" 
            onSuccess={() => setIsRemoveCreditsOpen(false)} 
          />
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}

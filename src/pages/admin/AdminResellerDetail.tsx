
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
import { AdminApiKeyManager } from '@/components/api-keys/AdminApiKeyManager';
import { SsoTokenManager } from '@/components/sso/SsoTokenManager';
import { ChangeProviderDialog } from '@/components/resellers/ChangeProviderDialog';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { CrmContactManager } from '@/components/crm/CrmContactManager';

export default function AdminResellerDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { getReseller, customers, creditLogs, refreshData } = useApp();
  const [activeTab, setActiveTab] = useState('customers');
  const [isAddCreditsOpen, setIsAddCreditsOpen] = useState(false);
  const [isRemoveCreditsOpen, setIsRemoveCreditsOpen] = useState(false);
  const [isCrmManagerOpen, setIsCrmManagerOpen] = useState(false);
  const [isChangeProviderOpen, setIsChangeProviderOpen] = useState(false);
  const [selectedCustomerForCrm, setSelectedCustomerForCrm] = useState<any>(null);
  
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

  // Handle CRM contact management
  const handleManageCrmContact = (customer: any) => {
    // Check if customer has highlevelContactId property
    if (!customer.highlevelContactId) {
      toast.error('This customer does not have a CRM contact ID');
      return;
    }
    
    setSelectedCustomerForCrm(customer);
    setIsCrmManagerOpen(true);
  };

  // Handle sync to CRM
  const handleSyncToCrm = async (customer: any) => {
    console.log('🔄 Admin syncing customer to CRM:', customer.name);
    
    try {
      // Call the sync-customer-to-crm edge function
      const { data, error } = await supabase.functions.invoke('sync-customer-to-crm', {
        body: {
          customerId: customer.id,
          resellerId: reseller.id,
          forceSync: true // Admin can force sync even if already has ID
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

      toast.success(data.skipped ? 'Customer already synced to CRM' : 'Customer successfully synced to CRM');
      // Refresh data to show updated customer with CRM contact ID
      await refreshData();
      
    } catch (error) {
      console.error('💥 Unexpected error during CRM sync:', error);
      toast.error('An error occurred while syncing to CRM');
    }
  };

  // Handle change provider success
  const handleChangeProviderSuccess = () => {
    setIsChangeProviderOpen(false);
    refreshData();
  };

  // Format provider display
  const formatProvider = (provider: string) => {
    return provider === '8k' ? '8K' : provider === 'trex' ? 'Trex' : provider;
  };
  
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
            <div className="mt-2">
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                Provider: {formatProvider(reseller.provider || '8k')}
              </span>
            </div>
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
          <TabsTrigger value="settings">Settings</TabsTrigger>
          <TabsTrigger value="sso">SSO Tokens</TabsTrigger>
        </TabsList>
        <TabsContent value="customers">
          <DashboardCard
            title={`Customers (${resellerCustomers.length})`}
            description="All customers created by this reseller"
          >
            <CustomerTable 
              customers={resellerCustomers}
              onAddClick={() => {}} // Admin view doesn't need add functionality
              onCancel={() => {}} // Admin view doesn't need cancel functionality  
              onRenew={() => {}} // Admin view doesn't need renew functionality
              onDeactivate={() => {}} // Admin view doesn't need deactivate functionality
              onManageCrm={handleManageCrmContact}
              onSyncToCrm={handleSyncToCrm}
            />
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
        <TabsContent value="settings">
          <div className="space-y-6">
            <DashboardCard
              title="Provider Management"
              description="Manage the IPTV provider for this reseller"
            >
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 bg-blue-50 rounded-lg border border-blue-200">
                  <div>
                    <p className="text-sm font-medium text-blue-900">
                      Current Provider: <span className="font-bold">{formatProvider(reseller.provider || '8k')}</span>
                    </p>
                    <p className="text-xs text-blue-700 mt-1">
                      This affects all IPTV operations for this reseller and their customers.
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    onClick={() => setIsChangeProviderOpen(true)}
                    className="bg-blue-100 border-blue-300 text-blue-700 hover:bg-blue-200"
                  >
                    Change Provider
                  </Button>
                </div>
              </div>
            </DashboardCard>
            
            <Separator />
            
            <HighLevelSettings resellerId={reseller.id} isAdminView={true} />
            
            <Separator />
            
            <AdminApiKeyManager resellerId={reseller.id} resellerName={reseller.name} />
          </div>
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

      {/* Change Provider Dialog */}
      <ChangeProviderDialog
        open={isChangeProviderOpen}
        onOpenChange={setIsChangeProviderOpen}
        reseller={reseller}
        onSuccess={handleChangeProviderSuccess}
      />

      {/* CRM Contact Manager Dialog */}
      {selectedCustomerForCrm && (
        <Dialog open={isCrmManagerOpen} onOpenChange={setIsCrmManagerOpen}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Manage CRM Contact</DialogTitle>
              <DialogDescription>
                Update custom fields, add notes, and manage tags for {selectedCustomerForCrm.name} in the CRM system
              </DialogDescription>
            </DialogHeader>
            <CrmContactManager
              contactId={selectedCustomerForCrm.highlevelContactId || ''}
              resellerId={reseller.id}
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

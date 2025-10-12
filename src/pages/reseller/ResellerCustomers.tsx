
import React, { useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { useApp } from '@/contexts/AppContext';
import { useAuth } from '@/contexts/AuthContext';
import { CustomerTable } from '@/components/customers/CustomerTable';
import { CustomerStatsHeader } from '@/components/customers/CustomerStatsHeader';
import { CustomerActions } from '@/components/customers/CustomerActions';
import { CustomerDialogsManager } from '@/components/customers/CustomerDialogsManager';
import { ConsolidationManager } from '@/components/customers/ConsolidationManager';
import { findAllDuplicateGroups } from '@/utils/customerConsolidation/duplicateDetection';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertTriangle } from 'lucide-react';

import { useCustomerOperations } from '@/hooks/useCustomerOperations';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Users } from 'lucide-react';

type StatusFilter = 'all' | 'active' | 'expiring' | 'expired' | 'cancelled' | 'deactivated';

export default function ResellerCustomers() {
  const { user } = useAuth();
  const { customers, cancelCustomer, deactivateCustomer, refreshData } = useApp();
  
  // Dialog states
  const [isAddCustomerOpen, setIsAddCustomerOpen] = useState(false);
  const [isRenewCustomerOpen, setIsRenewCustomerOpen] = useState(false);
  const [isCrmManagerOpen, setIsCrmManagerOpen] = useState(false);
  const [isCreateTrialOpen, setIsCreateTrialOpen] = useState(false);
  const [isBulkImportOpen, setIsBulkImportOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  
  // Filter customers for this reseller
  const resellerCustomers = customers.filter(c => c.resellerId === user?.id);
  
  // Find duplicate groups
  const duplicateGroups = findAllDuplicateGroups(resellerCustomers);
  const hasDuplicates = duplicateGroups.length > 0;

  // Check if user can create trials
  const canCreateTrials = true; // Always allow trial creation for EZTV

  // Use custom hook for customer operations
  const {
    customerToRenew,
    selectedCustomerForCrm,
    setCustomerToRenew,
    setSelectedCustomerForCrm,
    handleCancelCustomer,
    handleDeactivateCustomer,
    handleRenewCustomer,
    handleManageCrmContact,
    handleSyncToCrm
  } = useCustomerOperations(user, cancelCustomer, deactivateCustomer, refreshData, setIsRenewCustomerOpen, setIsCrmManagerOpen);

  // Handle status filter change
  const handleStatusFilterChange = (filter: string) => {
    setStatusFilter(filter as StatusFilter);
  };
  
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
        <CustomerActions
          canCreateTrials={canCreateTrials}
          onBulkImportClick={() => setIsBulkImportOpen(true)}
          onCreateTrialClick={() => setIsCreateTrialOpen(true)}
          onAddCustomerClick={() => setIsAddCustomerOpen(true)}
        />
      </div>

      {/* Duplicate warning alert */}
      {hasDuplicates && (
        <Alert variant="destructive" className="mb-6">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>⚠️ Duplicate Customers Detected</AlertTitle>
          <AlertDescription>
            <p className="mb-2">
              Found <strong>{duplicateGroups.length}</strong> group{duplicateGroups.length > 1 ? 's' : ''} of potential duplicate customers. 
              This can cause double charges during renewals.
            </p>
            <ul className="list-disc list-inside space-y-1 text-sm">
              {duplicateGroups.slice(0, 3).map((group, idx) => (
                <li key={idx}>
                  <strong>{group.customer.name}</strong> has {group.matchingCustomers.length} potential duplicate{group.matchingCustomers.length > 1 ? 's' : ''}
                </li>
              ))}
              {duplicateGroups.length > 3 && (
                <li>...and {duplicateGroups.length - 3} more</li>
              )}
            </ul>
            <p className="mt-2 text-sm font-semibold">
              Please use the Consolidation Manager below to merge these records.
            </p>
          </AlertDescription>
        </Alert>
      )}

      {/* Add ConsolidationManager component */}
      <ConsolidationManager
        customers={resellerCustomers}
        resellerId={user?.id || ''}
        onConsolidationComplete={refreshData}
      />

      
      <CustomerStatsHeader
        customers={resellerCustomers}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
      />
      
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
            onStatusFilterChange={handleStatusFilterChange}
          />
        </CardContent>
      </Card>
      
      <CustomerDialogsManager
        isAddCustomerOpen={isAddCustomerOpen}
        isRenewCustomerOpen={isRenewCustomerOpen}
        isCrmManagerOpen={isCrmManagerOpen}
        isCreateTrialOpen={isCreateTrialOpen}
        isBulkImportOpen={isBulkImportOpen}
        onAddCustomerClose={() => setIsAddCustomerOpen(false)}
        onRenewCustomerClose={() => {
          setIsRenewCustomerOpen(false);
          setCustomerToRenew(null);
        }}
        onCrmManagerClose={() => {
          setIsCrmManagerOpen(false);
          setSelectedCustomerForCrm(null);
        }}
        onCreateTrialClose={() => setIsCreateTrialOpen(false)}
        onBulkImportClose={() => setIsBulkImportOpen(false)}
        customerToRenew={customerToRenew}
        selectedCustomerForCrm={selectedCustomerForCrm}
        canCreateTrials={canCreateTrials}
        userId={user?.id || ''}
        onRefreshData={refreshData}
      />
    </DashboardLayout>
  );
}

import React, { useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { useApp } from '@/contexts/AppContext';
import { useAuth } from '@/contexts/AuthContext';
import { CustomerTable } from '@/components/customers/CustomerTable';
import { CustomerStatsHeader } from '@/components/customers/CustomerStatsHeader';
import { CustomerDialogsManager } from '@/components/customers/CustomerDialogsManager';
import { ConsolidationManager } from '@/components/customers/ConsolidationManager';
import { findAllDuplicateGroups } from '@/utils/customerConsolidation/duplicateDetection';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertTriangle, Users } from 'lucide-react';
import { useCustomerOperations } from '@/hooks/useCustomerOperations';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type StatusFilter = 'all' | 'active' | 'expiring' | 'expired' | 'cancelled' | 'deactivated';

export default function AdminCustomers() {
  const { user } = useAuth();
  const { customers, resellers, cancelCustomer, deactivateCustomer, refreshData } = useApp();
  
  const [isRenewCustomerOpen, setIsRenewCustomerOpen] = useState(false);
  const [isCrmManagerOpen, setIsCrmManagerOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [selectedResellerId, setSelectedResellerId] = useState<string>('all');
  
  // Filter customers by selected reseller
  const filteredCustomers = selectedResellerId === 'all' 
    ? customers 
    : customers.filter(c => c.resellerId === selectedResellerId);
  
  // Find duplicate groups for the filtered customers
  const duplicateGroups = findAllDuplicateGroups(filteredCustomers);
  const hasDuplicates = duplicateGroups.length > 0;

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
  } = useCustomerOperations(
    user, 
    cancelCustomer, 
    deactivateCustomer, 
    refreshData, 
    setIsRenewCustomerOpen, 
    setIsCrmManagerOpen
  );

  const handleStatusFilterChange = (filter: string) => {
    setStatusFilter(filter as StatusFilter);
  };
  
  return (
    <DashboardLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-2">All Customers</h1>
        <p className="text-muted-foreground">Manage customers across all resellers</p>
      </div>

      {/* Reseller filter */}
      <div className="mb-6">
        <Select value={selectedResellerId} onValueChange={setSelectedResellerId}>
          <SelectTrigger className="w-[280px]">
            <SelectValue placeholder="Filter by reseller" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Resellers ({customers.length} customers)</SelectItem>
            {resellers.map((reseller) => {
              const count = customers.filter(c => c.resellerId === reseller.id).length;
              return (
                <SelectItem key={reseller.id} value={reseller.id}>
                  {reseller.name} ({count} customers)
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
      </div>

      {/* Duplicate warning alert */}
      {hasDuplicates && (
        <Alert variant="destructive" className="mb-6">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>⚠️ Duplicate Customers Detected</AlertTitle>
          <AlertDescription>
            <p className="mb-2">
              Found <strong>{duplicateGroups.length}</strong> group{duplicateGroups.length > 1 ? 's' : ''} of potential duplicate customers
              {selectedResellerId !== 'all' && ' for this reseller'}.
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
              Use the Consolidation Manager below to merge these records.
            </p>
          </AlertDescription>
        </Alert>
      )}

      {/* Consolidation Manager - only show for specific reseller */}
      {selectedResellerId !== 'all' && (
        <ConsolidationManager
          customers={filteredCustomers}
          resellerId={selectedResellerId}
          onConsolidationComplete={refreshData}
        />
      )}
      
      <CustomerStatsHeader
        customers={filteredCustomers}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
      />
      
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            {statusFilter === 'all' ? 
              `All Customers (${filteredCustomers.length})` : 
              `${statusFilter.charAt(0).toUpperCase() + statusFilter.slice(1)} Customers`
            }
          </CardTitle>
          <CardDescription>
            {selectedResellerId === 'all' 
              ? 'Viewing customers from all resellers' 
              : `Viewing customers for ${resellers.find(r => r.id === selectedResellerId)?.name}`
            }
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CustomerTable 
            customers={filteredCustomers}
            onRefresh={refreshData}
            onRenew={handleRenewCustomer}
            statusFilter={statusFilter}
            onStatusFilterChange={handleStatusFilterChange}
          />
        </CardContent>
      </Card>
      
      <CustomerDialogsManager
        isAddCustomerOpen={false}
        isRenewCustomerOpen={isRenewCustomerOpen}
        isCrmManagerOpen={isCrmManagerOpen}
        isCreateTrialOpen={false}
        isBulkImportOpen={false}
        onAddCustomerClose={() => {}}
        onRenewCustomerClose={() => {
          setIsRenewCustomerOpen(false);
          setCustomerToRenew(null);
        }}
        onCrmManagerClose={() => {
          setIsCrmManagerOpen(false);
          setSelectedCustomerForCrm(null);
        }}
        onCreateTrialClose={() => {}}
        onBulkImportClose={() => {}}
        customerToRenew={customerToRenew}
        selectedCustomerForCrm={selectedCustomerForCrm}
        canCreateTrials={false}
        userId={user?.id || ''}
        onRefreshData={refreshData}
      />
    </DashboardLayout>
  );
}

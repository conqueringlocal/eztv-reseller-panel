
import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { AddCustomerForm } from '@/components/customers/AddCustomerForm';
import { RenewCustomerForm } from '@/components/customers/RenewCustomerForm';
import { CreateTrialForm } from '@/components/customers/CreateTrialForm';
import { BulkImportForm } from '@/components/customers/BulkImportForm';
import { Customer } from '@/contexts/AppContext';

interface CustomerDialogsManagerProps {
  // Dialog states
  isAddCustomerOpen: boolean;
  isRenewCustomerOpen: boolean;
  isCreateTrialOpen: boolean;
  isBulkImportOpen: boolean;
  
  // Dialog handlers
  onAddCustomerClose: () => void;
  onRenewCustomerClose: () => void;
  onCreateTrialClose: () => void;
  onBulkImportClose: () => void;
  
  // Data
  customerToRenew: Customer | null;
  canCreateTrials: boolean;
  userId: string;
  
  // Success handlers
  onRefreshData: () => void;
}

export function CustomerDialogsManager({
  isAddCustomerOpen,
  isRenewCustomerOpen,
  isCreateTrialOpen,
  isBulkImportOpen,
  onAddCustomerClose,
  onRenewCustomerClose,
  onCreateTrialClose,
  onBulkImportClose,
  customerToRenew,
  canCreateTrials,
  userId,
  onRefreshData
}: CustomerDialogsManagerProps) {
  return (
    <>
      <Dialog open={isBulkImportOpen} onOpenChange={onBulkImportClose}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Bulk Import Customers</DialogTitle>
            <DialogDescription>
              Import existing customers from CSV and link them to their streaming accounts. 
              This will not create new streaming accounts, only link existing ones.
            </DialogDescription>
          </DialogHeader>
          <BulkImportForm onSuccess={() => {
            onBulkImportClose();
            onRefreshData();
          }} />
        </DialogContent>
      </Dialog>

      <Dialog open={isAddCustomerOpen} onOpenChange={onAddCustomerClose}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add New Customer</DialogTitle>
            <DialogDescription>
              Add a new customer and provision their EZTV streaming account. This will consume credits.
            </DialogDescription>
          </DialogHeader>
          <AddCustomerForm onSuccess={onAddCustomerClose} />
        </DialogContent>
      </Dialog>

      {canCreateTrials && (
        <Dialog open={isCreateTrialOpen} onOpenChange={onCreateTrialClose}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Trial Account</DialogTitle>
              <DialogDescription>
                Create a free 24-hour trial account for a potential customer. No credits will be consumed.
              </DialogDescription>
            </DialogHeader>
            <CreateTrialForm onSuccess={onCreateTrialClose} />
          </DialogContent>
        </Dialog>
      )}

      {customerToRenew && (
        <Dialog open={isRenewCustomerOpen} onOpenChange={onRenewCustomerClose}>
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
                onRenewCustomerClose();
                onRefreshData();
              }} 
            />
          </DialogContent>
        </Dialog>
      )}

    </>
  );
}

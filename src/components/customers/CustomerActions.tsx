
import React from 'react';
import { Button } from '@/components/ui/button';
import { Upload } from 'lucide-react';

interface CustomerActionsProps {
  canCreateTrials: boolean;
  onBulkImportClick: () => void;
  onCreateTrialClick: () => void;
  onAddCustomerClick: () => void;
}

export function CustomerActions({
  canCreateTrials,
  onBulkImportClick,
  onCreateTrialClick,
  onAddCustomerClick
}: CustomerActionsProps) {
  return (
    <div className="flex flex-wrap gap-2 mt-4 sm:mt-0">
      <Button 
        onClick={onBulkImportClick}
        variant="outline"
        className="bg-purple-50 hover:bg-purple-100 text-purple-700 border-purple-200 flex items-center gap-2"
      >
        <Upload className="h-4 w-4" />
        Bulk Import
      </Button>
      {canCreateTrials && (
        <Button 
          onClick={onCreateTrialClick}
          variant="outline"
          className="bg-blue-50 hover:bg-blue-100 text-blue-700 border-blue-200"
        >
          Create Trial
        </Button>
      )}
      <Button onClick={onAddCustomerClick}>
        Add Customer
      </Button>
    </div>
  );
}

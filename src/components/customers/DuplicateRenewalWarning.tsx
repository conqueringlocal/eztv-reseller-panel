import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Customer } from '@/contexts/AppContext';

interface DuplicateRenewalWarningProps {
  customer: Customer;
  duplicates: Customer[];
}

export function DuplicateRenewalWarning({ customer, duplicates }: DuplicateRenewalWarningProps) {
  return (
    <Alert variant="destructive" className="mb-4">
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle>Potential Duplicate Customer Detected</AlertTitle>
      <AlertDescription className="mt-2 space-y-2">
        <p>
          This customer appears to have {duplicates.length} duplicate record{duplicates.length > 1 ? 's' : ''} in your system:
        </p>
        <ul className="list-disc list-inside space-y-1 text-sm">
          {duplicates.map((dup) => (
            <li key={dup.id}>
              <strong>{dup.name}</strong> ({dup.email}) - Status: {dup.status}
            </li>
          ))}
        </ul>
        <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded">
          <p className="font-semibold text-yellow-900 text-sm">⚠️ Warning:</p>
          <p className="text-sm text-yellow-800 mt-1">
            Renewing this account may result in duplicate charges if the other record(s) are also renewed. 
            Consider using the <strong>Consolidation Manager</strong> to merge these records before proceeding.
          </p>
        </div>
      </AlertDescription>
    </Alert>
  );
}

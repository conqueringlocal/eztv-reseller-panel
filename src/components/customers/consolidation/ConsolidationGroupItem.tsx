
import React from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Users } from 'lucide-react';
import { Customer } from '@/contexts/AppContext';

interface ConsolidationResult {
  groupKey: string;
  success: boolean;
  message: string;
}

interface ConsolidationGroupItemProps {
  groupKey: string;
  name: string;
  email: string;
  customerCount: number;
  isConsolidating: boolean;
  result?: ConsolidationResult;
  onConsolidate: (groupKey: string, customers: Customer[], name: string, email: string) => void;
  customers: Customer[];
}

export function ConsolidationGroupItem({
  groupKey,
  name,
  email,
  customerCount,
  isConsolidating,
  result,
  onConsolidate,
  customers
}: ConsolidationGroupItemProps) {
  return (
    <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
      <div className="flex items-center gap-3">
        <Users className="h-4 w-4 text-gray-500" />
        <div>
          <p className="font-medium">{name}</p>
          <p className="text-sm text-gray-600">{email}</p>
          <p className="text-xs text-gray-500">
            {customerCount} duplicate records found
          </p>
        </div>
      </div>
      
      <div className="flex items-center gap-2">
        {result ? (
          <Badge variant={result.success ? "default" : "destructive"}>
            {result.success ? "Consolidated" : "Failed"}
          </Badge>
        ) : (
          <Button
            size="sm"
            variant="outline"
            onClick={() => onConsolidate(groupKey, customers, name, email)}
            disabled={isConsolidating}
          >
            {isConsolidating ? 'Processing...' : 'Consolidate'}
          </Button>
        )}
      </div>
    </div>
  );
}

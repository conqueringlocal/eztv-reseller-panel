
import React from 'react';
import { Button } from '@/components/ui/button';

interface ConsolidationActionsProps {
  groupCount: number;
  isConsolidating: boolean;
  onConsolidateAll: () => void;
}

export function ConsolidationActions({ 
  groupCount, 
  isConsolidating, 
  onConsolidateAll 
}: ConsolidationActionsProps) {
  return (
    <div className="pt-4 border-t">
      <Button
        onClick={onConsolidateAll}
        disabled={isConsolidating}
        className="w-full"
      >
        {isConsolidating ? 'Consolidating All Groups...' : `Consolidate All ${groupCount} Groups`}
      </Button>
    </div>
  );
}

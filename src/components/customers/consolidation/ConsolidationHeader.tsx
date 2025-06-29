
import React from 'react';
import { CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle } from 'lucide-react';

interface ConsolidationHeaderProps {
  groupCount: number;
}

export function ConsolidationHeader({ groupCount }: ConsolidationHeaderProps) {
  return (
    <CardHeader>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-yellow-500" />
          <CardTitle className="text-lg">Customer Consolidation Required</CardTitle>
        </div>
        <Badge variant="destructive">
          {groupCount} groups need consolidation
        </Badge>
      </div>
    </CardHeader>
  );
}

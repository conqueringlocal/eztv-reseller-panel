import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface DuplicateWarningBadgeProps {
  matchCount: number;
  matchReason: string[];
}

export function DuplicateWarningBadge({ matchCount, matchReason }: DuplicateWarningBadgeProps) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="destructive" className="gap-1 cursor-help">
            <AlertTriangle className="h-3 w-3" />
            Duplicate ({matchCount})
          </Badge>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">
          <p className="font-semibold mb-1">Potential duplicate customer detected</p>
          <ul className="text-xs space-y-1">
            {matchReason.map((reason, idx) => (
              <li key={idx}>• {reason}</li>
            ))}
          </ul>
          <p className="text-xs mt-2 text-muted-foreground">
            Consider consolidating these records to avoid double charges
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

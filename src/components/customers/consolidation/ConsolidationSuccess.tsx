
import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { CheckCircle } from 'lucide-react';

export function ConsolidationSuccess() {
  return (
    <Card className="mb-4">
      <CardContent className="flex items-center gap-3 py-4">
        <CheckCircle className="h-5 w-5 text-green-500" />
        <div>
          <p className="font-medium text-green-700">All customers are properly consolidated</p>
          <p className="text-sm text-gray-600">No duplicate records found</p>
        </div>
      </CardContent>
    </Card>
  );
}

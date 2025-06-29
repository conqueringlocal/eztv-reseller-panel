
import React from 'react';

interface ConsolidationResult {
  groupKey: string;
  name: string;
  email: string;
  success: boolean;
  message: string;
}

interface ConsolidationResultsProps {
  results: ConsolidationResult[];
}

export function ConsolidationResults({ results }: ConsolidationResultsProps) {
  if (results.length === 0) {
    return null;
  }

  return (
    <div className="mt-4 space-y-2">
      <h4 className="font-medium text-sm">Consolidation Results:</h4>
      {results.map((result, index) => (
        <div 
          key={index} 
          className={`p-2 rounded text-sm ${
            result.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
          }`}
        >
          {result.message}
        </div>
      ))}
    </div>
  );
}


import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { getCustomersNeedingConsolidation } from '@/utils/customerConsolidation';
import { Customer } from '@/contexts/AppContext';
import { ConsolidationHeader } from './consolidation/ConsolidationHeader';
import { ConsolidationGroupItem } from './consolidation/ConsolidationGroupItem';
import { ConsolidationResults } from './consolidation/ConsolidationResults';
import { ConsolidationActions } from './consolidation/ConsolidationActions';
import { ConsolidationSuccess } from './consolidation/ConsolidationSuccess';
import { useConsolidation } from '@/hooks/useConsolidation';

interface ConsolidationManagerProps {
  customers: Customer[];
  resellerId: string;
  onConsolidationComplete?: () => void;
}

export function ConsolidationManager({ 
  customers, 
  resellerId, 
  onConsolidationComplete 
}: ConsolidationManagerProps) {
  const customersNeedingConsolidation = getCustomersNeedingConsolidation(customers);
  
  const {
    isConsolidating,
    consolidationResults,
    handleConsolidateGroup,
    handleConsolidateAll
  } = useConsolidation(resellerId, onConsolidationComplete);
  
  if (customersNeedingConsolidation.length === 0) {
    return null;
  }
  
  return (
    <Card className="mb-6">
      <ConsolidationHeader groupCount={customersNeedingConsolidation.length} />
      
      <CardContent className="space-y-4">
        <div className="text-sm text-gray-600 mb-4">
          The following customers have duplicate records that should be consolidated:
        </div>
        
        <div className="space-y-3">
          {customersNeedingConsolidation.map((group) => (
            <ConsolidationGroupItem
              key={group.groupKey}
              groupKey={group.groupKey}
              name={group.name}
              email={group.email}
              customerCount={group.customers.length}
              customers={group.customers}
              isConsolidating={isConsolidating}
              result={consolidationResults.find(r => r.groupKey === group.groupKey)}
              onConsolidate={handleConsolidateGroup}
            />
          ))}
        </div>
        
        <ConsolidationResults results={consolidationResults} />
        
        <ConsolidationActions 
          groupCount={customersNeedingConsolidation.length}
          isConsolidating={isConsolidating}
          onConsolidateAll={() => handleConsolidateAll(customersNeedingConsolidation)}
        />
      </CardContent>
    </Card>
  );
}

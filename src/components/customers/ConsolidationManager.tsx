
import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { getCustomersNeedingConsolidation } from '@/utils/customerConsolidation';
import { Customer } from '@/contexts/AppContext';
import { ConsolidationHeader } from './consolidation/ConsolidationHeader';
import { ConsolidationGroupItem } from './consolidation/ConsolidationGroupItem';
import { ConsolidationResults } from './consolidation/ConsolidationResults';
import { ConsolidationActions } from './consolidation/ConsolidationActions';
import { ConsolidationSuccess } from './consolidation/ConsolidationSuccess';

interface ConsolidationManagerProps {
  customers: Customer[];
  resellerId: string;
  onConsolidationComplete?: () => void;
}

interface ConsolidationResult {
  groupKey: string;
  name: string;
  email: string;
  success: boolean;
  consolidatedId?: string;
  totalConnections?: number;
  error?: string;
  message: string;
}

export function ConsolidationManager({ 
  customers, 
  resellerId, 
  onConsolidationComplete 
}: ConsolidationManagerProps) {
  const [isConsolidating, setIsConsolidating] = useState(false);
  const [consolidationResults, setConsolidationResults] = useState<ConsolidationResult[]>([]);
  
  const customersNeedingConsolidation = getCustomersNeedingConsolidation(customers);
  
  const handleConsolidateGroup = async (groupKey: string, groupCustomers: Customer[], name: string, email: string) => {
    setIsConsolidating(true);
    
    try {
      console.log(`🔄 Consolidating group: ${groupKey}`, { name, email, count: groupCustomers.length });
      
      // Use the existing consolidate_customer_connections function with customer_group from first customer
      const firstCustomer = groupCustomers[0];
      const customerGroup = firstCustomer.customer_group || `${name.toLowerCase().replace(/\s+/g, '_')}_${resellerId}`;
      
      const { data, error } = await supabase.rpc('consolidate_customer_connections', {
        customer_group_name: customerGroup,
        reseller_id_param: resellerId
      });
      
      if (error) {
        throw error;
      }
      
      // Handle the response properly - data should be an array
      const result = Array.isArray(data) && data.length > 0 ? data[0] : null;
      
      if (result) {
        setConsolidationResults(prev => [...prev, {
          groupKey,
          name,
          email,
          success: true,
          consolidatedId: result.consolidated_customer_id,
          totalConnections: result.total_connections,
          message: `Successfully consolidated ${groupCustomers.length} records into 1 customer with ${result.total_connections} connections`
        }]);
        
        toast.success(`Successfully consolidated ${name}'s records`);
      } else {
        throw new Error('No consolidation result returned');
      }
      
    } catch (error: any) {
      console.error('❌ Consolidation failed:', error);
      setConsolidationResults(prev => [...prev, {
        groupKey,
        name,
        email,
        success: false,
        error: error.message,
        message: `Failed to consolidate ${name}'s records: ${error.message}`
      }]);
      
      toast.error(`Failed to consolidate ${name}'s records`);
    } finally {
      setIsConsolidating(false);
    }
  };
  
  const handleConsolidateAll = async () => {
    setIsConsolidating(true);
    setConsolidationResults([]);
    
    for (const group of customersNeedingConsolidation) {
      await handleConsolidateGroup(
        group.groupKey,
        group.customers,
        group.name,
        group.email
      );
      
      // Small delay between consolidations
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    toast.success(`Completed consolidation of ${customersNeedingConsolidation.length} customer groups`);
    
    if (onConsolidationComplete) {
      onConsolidationComplete();
    }
  };
  
  if (customersNeedingConsolidation.length === 0) {
    return <ConsolidationSuccess />;
  }
  
  return (
    <Card className="mb-6">
      <ConsolidationHeader groupCount={customersNeedingConsolidation.length} />
      
      <CardContent className="space-y-4">
        <div className="text-sm text-gray-600 mb-4">
          The following customers have duplicate records that should be consolidated:
        </div>
        
        {/* Individual Groups */}
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
          onConsolidateAll={handleConsolidateAll}
        />
      </CardContent>
    </Card>
  );
}

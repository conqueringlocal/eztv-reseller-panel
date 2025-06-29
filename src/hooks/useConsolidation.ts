
import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Customer } from '@/contexts/AppContext';

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

export function useConsolidation(resellerId: string, onComplete?: () => void) {
  const [isConsolidating, setIsConsolidating] = useState(false);
  const [consolidationResults, setConsolidationResults] = useState<ConsolidationResult[]>([]);

  const handleConsolidateGroup = async (
    groupKey: string, 
    groupCustomers: Customer[], 
    name: string, 
    email: string
  ) => {
    setIsConsolidating(true);
    
    try {
      console.log(`🔄 Consolidating group: ${groupKey}`, { name, email, count: groupCustomers.length });
      
      const firstCustomer = groupCustomers[0];
      const customerGroup = firstCustomer.customer_group || `${name.toLowerCase().replace(/\s+/g, '_')}_${resellerId}`;
      
      const { data, error } = await supabase.rpc('consolidate_customer_connections', {
        customer_group_name: customerGroup,
        reseller_id_param: resellerId
      });
      
      if (error) {
        throw error;
      }
      
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

  const handleConsolidateAll = async (groups: Array<{
    groupKey: string;
    customers: Customer[];
    name: string;
    email: string;
  }>) => {
    setIsConsolidating(true);
    setConsolidationResults([]);
    
    for (const group of groups) {
      await handleConsolidateGroup(
        group.groupKey,
        group.customers,
        group.name,
        group.email
      );
      
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    toast.success(`Completed consolidation of ${groups.length} customer groups`);
    
    if (onComplete) {
      onComplete();
    }
  };

  return {
    isConsolidating,
    consolidationResults,
    handleConsolidateGroup,
    handleConsolidateAll
  };
}


import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { 
  getCustomersNeedingConsolidation,
  getCustomerDisplayName 
} from '@/utils/customerConsolidation';
import { Customer } from '@/contexts/AppContext';
import { Users, AlertTriangle, CheckCircle } from 'lucide-react';

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
  const [isConsolidating, setIsConsolidating] = useState(false);
  const [consolidationResults, setConsolidationResults] = useState<any[]>([]);
  
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
  
  return (
    <Card className="mb-6">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-yellow-500" />
            <CardTitle className="text-lg">Customer Consolidation Required</CardTitle>
          </div>
          <Badge variant="destructive">
            {customersNeedingConsolidation.length} groups need consolidation
          </Badge>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        <div className="text-sm text-gray-600 mb-4">
          The following customers have duplicate records that should be consolidated:
        </div>
        
        {/* Individual Groups */}
        <div className="space-y-3">
          {customersNeedingConsolidation.map((group) => (
            <div key={group.groupKey} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div className="flex items-center gap-3">
                <Users className="h-4 w-4 text-gray-500" />
                <div>
                  <p className="font-medium">{group.name}</p>
                  <p className="text-sm text-gray-600">{group.email}</p>
                  <p className="text-xs text-gray-500">
                    {group.customers.length} duplicate records found
                  </p>
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                {consolidationResults.find(r => r.groupKey === group.groupKey) ? (
                  <Badge variant={consolidationResults.find(r => r.groupKey === group.groupKey)?.success ? "default" : "destructive"}>
                    {consolidationResults.find(r => r.groupKey === group.groupKey)?.success ? "Consolidated" : "Failed"}
                  </Badge>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleConsolidateGroup(group.groupKey, group.customers, group.name, group.email)}
                    disabled={isConsolidating}
                  >
                    {isConsolidating ? 'Processing...' : 'Consolidate'}
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
        
        {/* Consolidation Results */}
        {consolidationResults.length > 0 && (
          <div className="mt-4 space-y-2">
            <h4 className="font-medium text-sm">Consolidation Results:</h4>
            {consolidationResults.map((result, index) => (
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
        )}
        
        {/* Consolidate All Button */}
        <div className="pt-4 border-t">
          <Button
            onClick={handleConsolidateAll}
            disabled={isConsolidating}
            className="w-full"
          >
            {isConsolidating ? 'Consolidating All Groups...' : `Consolidate All ${customersNeedingConsolidation.length} Groups`}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { AlertTriangle, RefreshCw, DollarSign } from 'lucide-react';

interface DuplicateRenewal {
  customer_id: string;
  customer_name: string;
  reseller_id: string;
  duplicate_count: number;
  total_excess_credits: number;
  log_ids: string[];
}

export function RenewalAuditTool() {
  const [duplicates, setDuplicates] = useState<DuplicateRenewal[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [isRefunding, setIsRefunding] = useState(false);
  const [scanHours, setScanHours] = useState(24);

  const scanForDuplicates = async () => {
    setIsScanning(true);
    try {
      const { data, error } = await supabase.rpc('detect_duplicate_renewals', {
        p_hours_back: scanHours
      });

      if (error) {
        console.error('Failed to scan for duplicates:', error);
        toast.error('Failed to scan for duplicate renewals');
        return;
      }

      setDuplicates(data || []);
      toast.success(`Scan completed. Found ${data?.length || 0} customers with duplicate charges.`);
    } catch (error) {
      console.error('Error scanning for duplicates:', error);
      toast.error('An error occurred while scanning');
    } finally {
      setIsScanning(false);
    }
  };

  const refundDuplicateCharges = async (duplicate: DuplicateRenewal) => {
    setIsRefunding(true);
    try {
      const { error } = await supabase.rpc('refund_duplicate_charges', {
        p_reseller_id: duplicate.reseller_id,
        p_credits_to_refund: duplicate.total_excess_credits,
        p_reason: `Duplicate renewal charges for customer ${duplicate.customer_name} (${duplicate.duplicate_count} duplicates)`
      });

      if (error) {
        console.error('Failed to refund duplicate charges:', error);
        toast.error('Failed to refund duplicate charges');
        return;
      }

      toast.success(`Refunded ${duplicate.total_excess_credits} credits to reseller`);
      
      // Remove this duplicate from the list
      setDuplicates(prev => prev.filter(d => d.customer_id !== duplicate.customer_id));
    } catch (error) {
      console.error('Error refunding duplicate charges:', error);
      toast.error('An error occurred while processing refund');
    } finally {
      setIsRefunding(false);
    }
  };

  const refundAllDuplicates = async () => {
    setIsRefunding(true);
    try {
      for (const duplicate of duplicates) {
        await refundDuplicateCharges(duplicate);
        // Small delay to avoid overwhelming the system
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      toast.success('All duplicate charges have been refunded');
    } catch (error) {
      console.error('Error refunding all duplicates:', error);
      toast.error('An error occurred while processing refunds');
    } finally {
      setIsRefunding(false);
    }
  };

  const totalExcessCredits = duplicates.reduce((sum, d) => sum + d.total_excess_credits, 0);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Renewal Audit Tool
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <label htmlFor="scan-hours" className="text-sm font-medium">
                Scan last:
              </label>
              <select 
                id="scan-hours"
                value={scanHours} 
                onChange={(e) => setScanHours(Number(e.target.value))}
                className="px-3 py-1 border rounded-md"
              >
                <option value={6}>6 hours</option>
                <option value={12}>12 hours</option>
                <option value={24}>24 hours</option>
                <option value={48}>48 hours</option>
                <option value={168}>1 week</option>
              </select>
            </div>
            
            <Button 
              onClick={scanForDuplicates} 
              disabled={isScanning}
              className="flex items-center gap-2"
            >
              <RefreshCw className={`h-4 w-4 ${isScanning ? 'animate-spin' : ''}`} />
              {isScanning ? 'Scanning...' : 'Scan for Duplicates'}
            </Button>
          </div>

          {duplicates.length > 0 && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Found {duplicates.length} customers with duplicate charges totaling {totalExcessCredits} excess credits.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {duplicates.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Duplicate Charges Found</span>
              <Button 
                onClick={refundAllDuplicates} 
                disabled={isRefunding}
                variant="outline"
                className="flex items-center gap-2"
              >
                <DollarSign className="h-4 w-4" />
                Refund All ({totalExcessCredits} credits)
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {duplicates.map((duplicate) => (
                <div key={duplicate.customer_id} className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="space-y-1">
                    <div className="font-medium">{duplicate.customer_name}</div>
                    <div className="text-sm text-muted-foreground">
                      Customer ID: {duplicate.customer_id}
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="destructive">
                        {duplicate.duplicate_count} duplicates
                      </Badge>
                      <Badge variant="outline">
                        {duplicate.total_excess_credits} excess credits
                      </Badge>
                    </div>
                  </div>
                  
                  <Button
                    onClick={() => refundDuplicateCharges(duplicate)}
                    disabled={isRefunding}
                    size="sm"
                    className="flex items-center gap-2"
                  >
                    <DollarSign className="h-4 w-4" />
                    Refund {duplicate.total_excess_credits} credits
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {duplicates.length === 0 && !isScanning && (
        <Card>
          <CardContent className="text-center py-8">
            <div className="text-muted-foreground">
              No duplicate renewal charges found in the selected time period.
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
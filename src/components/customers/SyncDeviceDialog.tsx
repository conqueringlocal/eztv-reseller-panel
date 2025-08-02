import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Loader2, RefreshCw, CheckCircle, XCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { getCustomerDisplayName, getFieldValue } from '@/utils/customerConsolidation';

interface SyncDeviceDialogProps {
  customer: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

interface SyncResult {
  success: boolean;
  message: string;
  updates?: any;
  panelData?: any;
  error?: string;
}

export function SyncDeviceDialog({ customer, open, onOpenChange, onSuccess }: SyncDeviceDialogProps) {
  const [syncing, setSyncing] = useState(false);
  const [result, setResult] = useState<SyncResult | null>(null);

  const handleSync = async () => {
    setSyncing(true);
    setResult(null);

    try {
      const { data, error } = await supabase.functions.invoke('sync-device-info', {
        body: { customerId: customer.id }
      });

      if (error) {
        throw error;
      }

      const syncResult: SyncResult = {
        success: true,
        message: data.message,
        updates: data.updates,
        panelData: data.panelData
      };

      setResult(syncResult);
      toast.success('Device info synced successfully');
      onSuccess?.();
    } catch (error: any) {
      console.error('Sync error:', error);
      const syncResult: SyncResult = {
        success: false,
        message: 'Sync failed',
        error: error.message || 'Unknown error occurred'
      };
      setResult(syncResult);
      toast.error(`Sync failed: ${error.message}`);
    } finally {
      setSyncing(false);
    }
  };

  const deviceType = getFieldValue(customer, 'device_type', 'deviceType');
  const provider = getFieldValue(customer, 'provider', 'provider');
  const hasUsername = !!getFieldValue(customer, 'username', 'username');
  const hasMacAddress = !!getFieldValue(customer, 'mac_address', 'macAddress');

  const canSync = (deviceType === 'M3U' && hasUsername) || 
                  ((deviceType === 'MAC' || deviceType === 'MAG') && hasMacAddress);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5" />
            Sync Device Info
          </DialogTitle>
          <DialogDescription>
            Sync expiration date and URL from the IPTV panel for {getCustomerDisplayName(customer)}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Customer Info */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Device Type:</span>
              <Badge variant="outline">{deviceType}</Badge>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Provider:</span>
              <span>{provider || 'Default'}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Has Username:</span>
              <span>{hasUsername ? '✓' : '✗'}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Has MAC Address:</span>
              <span>{hasMacAddress ? '✓' : '✗'}</span>
            </div>
          </div>

          {/* Sync Status */}
          {!canSync && (
            <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
              <p className="text-sm text-yellow-800">
                Cannot sync: Missing required information for {deviceType} device type.
                {deviceType === 'M3U' && !hasUsername && ' Username is required.'}
                {(deviceType === 'MAC' || deviceType === 'MAG') && !hasMacAddress && ' MAC address is required.'}
              </p>
            </div>
          )}

          {/* Sync Result */}
          {result && (
            <div className={`p-3 rounded-lg border ${
              result.success 
                ? 'bg-green-50 border-green-200' 
                : 'bg-red-50 border-red-200'
            }`}>
              <div className="flex items-center gap-2 mb-2">
                {result.success ? (
                  <CheckCircle className="h-4 w-4 text-green-600" />
                ) : (
                  <XCircle className="h-4 w-4 text-red-600" />
                )}
                <span className={`text-sm font-medium ${
                  result.success ? 'text-green-800' : 'text-red-800'
                }`}>
                  {result.message}
                </span>
              </div>

              {result.success && result.updates && (
                <div className="text-sm space-y-1">
                  {result.updates.expiration_date && (
                    <div>
                      <span className="text-muted-foreground">New expiration: </span>
                      <span className="font-medium">{result.updates.expiration_date}</span>
                    </div>
                  )}
                  {result.updates.m3u_url && (
                    <div>
                      <span className="text-muted-foreground">URL updated</span>
                    </div>
                  )}
                </div>
              )}

              {result.error && (
                <p className="text-sm text-red-700 mt-1">{result.error}</p>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-2">
            <Button 
              onClick={handleSync}
              disabled={!canSync || syncing}
              className="flex-1"
            >
              {syncing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {syncing ? 'Syncing...' : 'Sync Now'}
            </Button>
            <Button 
              variant="outline" 
              onClick={() => onOpenChange(false)}
              disabled={syncing}
            >
              {result ? 'Close' : 'Cancel'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
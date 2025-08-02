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
  debugInfo?: any;
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
      
      // Parse error response for better user feedback
      let errorMessage = 'Unknown error occurred';
      let debugInfo = null;
      
      if (error.message) {
        try {
          const errorData = JSON.parse(error.message);
          errorMessage = errorData.error || error.message;
          debugInfo = errorData.availableCredentials || errorData.deviceType;
        } catch {
          errorMessage = error.message;
        }
      }
      
      const syncResult: SyncResult = {
        success: false,
        message: 'Sync failed',
        error: errorMessage,
        debugInfo
      };
      setResult(syncResult);
      toast.error(`Sync failed: ${errorMessage}`);
    } finally {
      setSyncing(false);
    }
  };

  const deviceType = getFieldValue(customer, 'device_type', 'deviceType');
  const provider = getFieldValue(customer, 'provider', 'provider');
  const hasUsername = !!getFieldValue(customer, 'username', 'username');
  const hasPassword = !!getFieldValue(customer, 'password', 'password');
  const hasMacAddress = !!getFieldValue(customer, 'mac_address', 'macAddress');

  // Device can sync if it has either username/password credentials OR MAC address
  const canSync = (hasUsername && hasPassword) || hasMacAddress;
  
  // Determine device category for display purposes
  const deviceCategory = (hasUsername && hasPassword) ? 'M3U-based' : 
                        hasMacAddress ? 'MAC-based' : 'Unknown';

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
              <span className="text-muted-foreground">Sync Category:</span>
              <Badge variant={deviceCategory === 'Unknown' ? 'destructive' : 'secondary'}>
                {deviceCategory}
              </Badge>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Has Credentials:</span>
              <span>{hasUsername && hasPassword ? '✓ Username/Password' : ''}{hasMacAddress ? '✓ MAC Address' : ''}{!canSync ? '✗ None' : ''}</span>
            </div>
          </div>

          {/* Sync Status */}
          {!canSync && (
            <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
              <p className="text-sm text-yellow-800">
                Cannot sync: Device requires either username/password credentials or MAC address to sync with the panel.
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
                <div className="mt-2">
                  <p className="text-sm text-red-700">{result.error}</p>
                  {result.debugInfo && (
                    <div className="mt-2 p-2 bg-gray-100 rounded text-xs">
                      <strong>Debug info:</strong> {JSON.stringify(result.debugInfo, null, 2)}
                    </div>
                  )}
                </div>
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
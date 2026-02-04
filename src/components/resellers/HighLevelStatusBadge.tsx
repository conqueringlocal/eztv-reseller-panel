import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, XCircle, Info } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface HighLevelStatusBadgeProps {
  resellerId: string;
}

// READ-ONLY component for resellers to see their HighLevel connection status
// Uses get_highlevel_status() function - does not expose token
export function HighLevelStatusBadge({ resellerId }: HighLevelStatusBadgeProps) {
  const [status, setStatus] = useState<{
    isConnected: boolean;
    isActive: boolean;
    loading: boolean;
  }>({ isConnected: false, isActive: false, loading: true });

  useEffect(() => {
    const loadStatus = async () => {
      try {
        // Use security definer function to get status
        const { data, error } = await supabase
          .rpc('get_highlevel_status', { p_reseller_id: resellerId });

        if (error) {
          console.error('Error loading HighLevel status:', error);
          setStatus({ isConnected: false, isActive: false, loading: false });
          return;
        }

        if (data && data.length > 0) {
          setStatus({
            isConnected: data[0].is_connected,
            isActive: data[0].is_active,
            loading: false
          });
        } else {
          setStatus({ isConnected: false, isActive: false, loading: false });
        }
      } catch (error) {
        console.error('Error loading HighLevel status:', error);
        setStatus({ isConnected: false, isActive: false, loading: false });
      }
    };

    loadStatus();
  }, [resellerId]);

  if (status.loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>CRM Integration</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse h-6 bg-gray-200 rounded w-32"></div>
        </CardContent>
      </Card>
    );
  }

  const isFullyConnected = status.isConnected && status.isActive;

  return (
    <Card>
      <CardHeader>
        <CardTitle>CRM Integration</CardTitle>
        <CardDescription>
          HighLevel integration status for automatic customer syncing
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-3 mb-4">
          {isFullyConnected ? (
            <>
              <CheckCircle className="h-5 w-5 text-green-600" />
              <Badge variant="default" className="bg-green-100 text-green-800">
                Connected
              </Badge>
            </>
          ) : (
            <>
              <XCircle className="h-5 w-5 text-gray-400" />
              <Badge variant="secondary">
                Not Connected
              </Badge>
            </>
          )}
        </div>

        <Alert className="border-blue-200 bg-blue-50">
          <Info className="h-4 w-4 text-blue-600" />
          <AlertDescription className="text-blue-800">
            {isFullyConnected ? (
              <>
                Your CRM integration is active. Customer credentials and status will be 
                automatically synced to HighLevel contacts when accounts are created or renewed.
              </>
            ) : (
              <>
                CRM integration is managed by your administrator. Contact your admin to 
                enable HighLevel integration for automatic customer syncing.
              </>
            )}
          </AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  );
}

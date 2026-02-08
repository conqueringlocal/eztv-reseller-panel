import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { Eye, EyeOff, Save, Loader2, CheckCircle, XCircle, Play, Info, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

interface AdminHLSettings {
  id: string;
  private_integration_token: string | null;
  location_id: string | null;
  is_active: boolean;
  custom_field_mappings: Record<string, string>;
  created_at: string;
  updated_at: string;
}

interface MonitorStats {
  scanned: number;
  eligible: number;
  alerted: number;
  skippedCooldown: number;
  skippedNoEmail: number;
  skippedNoCredits: number;
  skippedAboveThreshold: number;
  hlFailed: number;
  contactsCreated: number;
  contactsUpdated: number;
}

export function AdminHighLevelAlertSettings() {
  const [settings, setSettings] = useState<AdminHLSettings | null>(null);
  const [token, setToken] = useState('');
  const [locationId, setLocationId] = useState('');
  const [isActive, setIsActive] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; fieldCount?: number; error?: string } | null>(null);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('admin_highlevel_settings')
        .select('*')
        .eq('id', 'admin')
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setSettings(data as AdminHLSettings);
        setToken(data.private_integration_token || '');
        setLocationId(data.location_id || '');
        setIsActive(data.is_active);
      }
    } catch (error) {
      console.error('Error fetching admin HL settings:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      // Use UPSERT on id='admin'
      const { error } = await supabase
        .from('admin_highlevel_settings')
        .upsert({
          id: 'admin',
          private_integration_token: token || null,
          location_id: locationId || null,
          is_active: isActive,
          updated_at: new Date().toISOString()
        }, { onConflict: 'id' });

      if (error) throw error;

      toast.success('Admin HighLevel settings saved');
      await fetchSettings();
    } catch (error) {
      console.error('Error saving settings:', error);
      toast.error('Failed to save settings');
    } finally {
      setIsSaving(false);
    }
  };

  const handleTestConnection = async () => {
    if (!token || !locationId) {
      toast.error('Please enter both token and location ID');
      return;
    }

    setIsTesting(true);
    setTestResult(null);

    try {
      // Test by fetching custom fields
      const response = await fetch(
        `https://services.leadconnectorhq.com/locations/${locationId}/customFields`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Version': '2021-07-28',
            'Content-Type': 'application/json'
          }
        }
      );

      if (!response.ok) {
        setTestResult({ success: false, error: `HTTP ${response.status}` });
        toast.error(`Connection failed: HTTP ${response.status}`);
        return;
      }

      const data = await response.json();
      const fieldCount = (data.customFields || []).length;
      
      setTestResult({ success: true, fieldCount });
      toast.success(`Connection successful! Found ${fieldCount} custom fields`);
    } catch (error) {
      setTestResult({ success: false, error: String(error) });
      toast.error('Connection test failed');
    } finally {
      setIsTesting(false);
    }
  };

  const handleRunMonitorNow = async () => {
    setIsRunning(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        toast.error('Not authenticated');
        return;
      }

      const response = await supabase.functions.invoke('reseller-credit-monitor', {
        body: { dry_run: false }
      });

      if (response.error) {
        throw response.error;
      }

      const result = response.data;

      if (result.disabled) {
        toast.warning('Credit monitor is disabled. Configure and activate settings first.');
        return;
      }

      const stats = result.stats as MonitorStats;
      
      toast.success(
        `Credit monitor complete! ` +
        `Scanned: ${stats.scanned}, ` +
        `Eligible: ${stats.eligible}, ` +
        `Alerted: ${stats.alerted}, ` +
        `Failed: ${stats.hlFailed}`
      );

    } catch (error: any) {
      console.error('Error running credit monitor:', error);
      toast.error(error.message || 'Failed to run credit monitor');
    } finally {
      setIsRunning(false);
    }
  };

  const maskedToken = token ? `${token.slice(0, 8)}...${token.slice(-4)}` : '';

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Admin HighLevel Alert Settings</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Admin HighLevel Alert Configuration</CardTitle>
          <CardDescription>
            Configure the admin HighLevel subaccount for automated low credit alerts.
            This is separate from per-reseller HighLevel integrations.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Status Badge */}
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Status:</span>
          {isActive && token && locationId ? (
              <Badge variant="default" className="bg-primary">
                <CheckCircle className="h-3 w-3 mr-1" />
                Active
              </Badge>
            ) : (
              <Badge variant="secondary">
                <XCircle className="h-3 w-3 mr-1" />
                Inactive
              </Badge>
            )}
          </div>

          <Separator />

          {/* Token Input */}
          <div className="space-y-2">
            <Label htmlFor="token">Private Integration Token</Label>
            <div className="flex gap-2">
              <Input
                id="token"
                type={showToken ? 'text' : 'password'}
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="Enter your HighLevel Private Integration Token"
                className="flex-1"
              />
              <Button
                variant="outline"
                size="icon"
                onClick={() => setShowToken(!showToken)}
              >
                {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
            {settings?.private_integration_token && !showToken && (
              <p className="text-xs text-muted-foreground">
                Current: {maskedToken}
              </p>
            )}
          </div>

          {/* Location ID Input */}
          <div className="space-y-2">
            <Label htmlFor="locationId">Location ID</Label>
            <Input
              id="locationId"
              value={locationId}
              onChange={(e) => setLocationId(e.target.value)}
              placeholder="Enter your HighLevel Location ID"
            />
          </div>

          {/* Active Toggle */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Enable Low Credit Alerts</Label>
              <p className="text-xs text-muted-foreground">
                When enabled, resellers with low credits will be synced to HighLevel
              </p>
            </div>
            <Switch
              checked={isActive}
              onCheckedChange={setIsActive}
            />
          </div>

          <Separator />

          {/* Action Buttons */}
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={handleSave}
              disabled={isSaving}
            >
              {isSaving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  Save Settings
                </>
              )}
            </Button>

            <Button
              variant="outline"
              onClick={handleTestConnection}
              disabled={isTesting || !token || !locationId}
            >
              {isTesting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Testing...
                </>
              ) : (
                <>
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Test Connection
                </>
              )}
            </Button>

            <Button
              variant="secondary"
              onClick={handleRunMonitorNow}
              disabled={isRunning || !isActive || !token || !locationId}
            >
              {isRunning ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Running...
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 mr-2" />
                  Run Credit Monitor Now
                </>
              )}
            </Button>
          </div>

          {/* Test Result */}
          {testResult && (
            <Alert variant={testResult.success ? 'default' : 'destructive'}>
              {testResult.success ? (
                <CheckCircle className="h-4 w-4" />
              ) : (
                <XCircle className="h-4 w-4" />
              )}
              <AlertTitle>
                {testResult.success ? 'Connection Successful' : 'Connection Failed'}
              </AlertTitle>
              <AlertDescription>
                {testResult.success
                  ? `Found ${testResult.fieldCount} custom fields in your HighLevel location.`
                  : testResult.error}
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Required Custom Fields Info */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Info className="h-5 w-5" />
            Required HighLevel Custom Fields
          </CardTitle>
          <CardDescription>
            Create these custom fields in your Admin HighLevel location for the alerts to work
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm">
            <li className="flex items-center gap-2">
              <Badge variant="outline">reseller_credit_balance</Badge>
              <span className="text-muted-foreground">Current credit count (text/number)</span>
            </li>
            <li className="flex items-center gap-2">
              <Badge variant="outline">reseller_low_credit_threshold</Badge>
              <span className="text-muted-foreground">Threshold that triggered alert (text/number)</span>
            </li>
            <li className="flex items-center gap-2">
              <Badge variant="outline">reseller_credit_alert_reason</Badge>
              <span className="text-muted-foreground">"low_credit" (text)</span>
            </li>
            <li className="flex items-center gap-2">
              <Badge variant="outline">reseller_credit_alert_triggered_at</Badge>
              <span className="text-muted-foreground">ISO timestamp (text) - Use for workflow trigger</span>
            </li>
            <li className="flex items-center gap-2">
              <Badge variant="outline">reseller_name</Badge>
              <span className="text-muted-foreground">Reseller's business name (text, optional)</span>
            </li>
          </ul>
        </CardContent>
      </Card>

      {/* Cron Setup Info */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Cron Job Setup
          </CardTitle>
          <CardDescription>
            After adding CRON_SECRET to edge function secrets, run this SQL in Supabase SQL Editor
          </CardDescription>
        </CardHeader>
        <CardContent>
          <pre className="bg-muted p-4 rounded-md text-xs overflow-x-auto">
{`SELECT cron.schedule(
  'reseller-credit-monitor',
  '*/15 * * * *', -- Every 15 minutes
  $$
  SELECT net.http_post(
    url := 'https://hddnqgggjjlildufirof.supabase.co/functions/v1/reseller-credit-monitor',
    headers := '{"Content-Type": "application/json", "X-CRON-SECRET": "YOUR_CRON_SECRET_HERE"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);`}
          </pre>
          <p className="text-xs text-muted-foreground mt-2">
            Replace YOUR_CRON_SECRET_HERE with your actual CRON_SECRET value.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

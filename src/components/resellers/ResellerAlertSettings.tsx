import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Bell, Save, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';

interface ResellerAlertSettingsProps {
  resellerId: string;
  currentCredits: number;
}

interface AlertSettings {
  low_credit_threshold: number;
  low_credit_alert_cooldown_hours: number;
  last_low_credit_alert_at: string | null;
}

export function ResellerAlertSettings({ resellerId, currentCredits }: ResellerAlertSettingsProps) {
  const [settings, setSettings] = useState<AlertSettings | null>(null);
  const [threshold, setThreshold] = useState(10);
  const [cooldownHours, setCooldownHours] = useState(24);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    fetchSettings();
  }, [resellerId]);

  const fetchSettings = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('low_credit_threshold, low_credit_alert_cooldown_hours, last_low_credit_alert_at')
        .eq('id', resellerId)
        .single();

      if (error) throw error;

      if (data) {
        setSettings(data);
        setThreshold(data.low_credit_threshold ?? 10);
        setCooldownHours(data.low_credit_alert_cooldown_hours ?? 24);
      }
    } catch (error) {
      console.error('Error fetching alert settings:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          low_credit_threshold: threshold,
          low_credit_alert_cooldown_hours: cooldownHours
        })
        .eq('id', resellerId);

      if (error) throw error;

      toast.success('Alert settings saved');
      await fetchSettings();
    } catch (error) {
      console.error('Error saving alert settings:', error);
      toast.error('Failed to save alert settings');
    } finally {
      setIsSaving(false);
    }
  };

  const isLowCredit = currentCredits <= threshold;
  const lastAlertDate = settings?.last_low_credit_alert_at 
    ? format(new Date(settings.last_low_credit_alert_at), 'MMM d, yyyy h:mm a')
    : null;

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Low Credit Alert Settings
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="h-5 w-5" />
          Low Credit Alert Settings
        </CardTitle>
        <CardDescription>
          Configure when this reseller receives low credit alerts via the Admin HighLevel integration
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Current Status */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Current Credits</p>
            <p className="text-2xl font-bold">{currentCredits}</p>
          </div>
          <Badge variant={isLowCredit ? 'destructive' : 'secondary'}>
            {isLowCredit ? 'Below Threshold' : 'Above Threshold'}
          </Badge>
        </div>

        <Separator />

        {/* Threshold Setting */}
        <div className="space-y-2">
          <Label htmlFor="threshold">Low Credit Threshold</Label>
          <Input
            id="threshold"
            type="number"
            min={0}
            value={threshold}
            onChange={(e) => setThreshold(parseInt(e.target.value) || 0)}
            placeholder="10"
          />
          <p className="text-xs text-muted-foreground">
            Alert is triggered when credits drop to or below this number
          </p>
        </div>

        {/* Cooldown Setting */}
        <div className="space-y-2">
          <Label htmlFor="cooldown">Cooldown Period (hours)</Label>
          <Input
            id="cooldown"
            type="number"
            min={1}
            value={cooldownHours}
            onChange={(e) => setCooldownHours(parseInt(e.target.value) || 24)}
            placeholder="24"
          />
          <p className="text-xs text-muted-foreground">
            Minimum hours between alerts for this reseller
          </p>
        </div>

        <Separator />

        {/* Last Alert Info */}
        <div className="space-y-1">
          <p className="text-sm font-medium">Last Alert Sent</p>
          <p className="text-sm text-muted-foreground">
            {lastAlertDate || 'Never'}
          </p>
        </div>

        {/* Save Button */}
        <Button
          onClick={handleSave}
          disabled={isSaving}
          className="w-full"
        >
          {isSaving ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="h-4 w-4 mr-2" />
              Save Alert Settings
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}

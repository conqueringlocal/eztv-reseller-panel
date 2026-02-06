import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Globe, Save, X, Loader2 } from 'lucide-react';

interface M3UDomainSettingsProps {
  resellerId: string;
}

export function M3UDomainSettings({ resellerId }: M3UDomainSettingsProps) {
  const [domain, setDomain] = useState('');
  const [originalDomain, setOriginalDomain] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isBackfilling, setIsBackfilling] = useState(false);

  useEffect(() => {
    const loadSettings = async () => {
      setIsLoading(true);
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', resellerId)
          .single();

        if (error) throw error;

        const currentDomain = (data as Record<string, unknown>)?.m3u_domain_override as string || '';
        setDomain(currentDomain);
        setOriginalDomain(currentDomain);
      } catch (error) {
        console.error('Error loading M3U domain settings:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadSettings();
  }, [resellerId]);

  const runBackfill = async () => {
    setIsBackfilling(true);
    try {
      const { data, error } = await supabase.functions.invoke('backfill-m3u-domains', {
        body: { reseller_id: resellerId }
      });

      if (error) throw error;

      if (data?.success) {
        toast.success(
          `Updated ${data.customersUpdated} customer(s). HighLevel: ${data.highLevelUpdated} synced, ${data.highLevelFailed} failed, ${data.highLevelSkipped} skipped.`
        );
      } else {
        toast.error(data?.error || 'Backfill failed');
      }
    } catch (error) {
      console.error('Backfill error:', error);
      toast.error('Failed to update existing customers');
    } finally {
      setIsBackfilling(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ m3u_domain_override: domain.trim() || null } as Record<string, unknown>)
        .eq('id', resellerId);

      if (error) throw error;

      setOriginalDomain(domain.trim());
      toast.success('M3U domain settings saved');
      
      // Trigger backfill after successful save
      await runBackfill();
    } catch (error) {
      console.error('Error saving M3U domain settings:', error);
      toast.error('Failed to save M3U domain settings');
    } finally {
      setIsSaving(false);
    }
  };

  const handleClear = async () => {
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ m3u_domain_override: null } as Record<string, unknown>)
        .eq('id', resellerId);

      if (error) throw error;

      setDomain('');
      setOriginalDomain('');
      toast.success('M3U domain override cleared');
      
      // Trigger backfill after successful clear
      await runBackfill();
    } catch (error) {
      console.error('Error clearing M3U domain:', error);
      toast.error('Failed to clear M3U domain');
    } finally {
      setIsSaving(false);
    }
  };

  const hasChanges = domain.trim() !== originalDomain;
  const isDisabled = isLoading || isSaving || isBackfilling;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Globe className="h-5 w-5" />
          M3U Domain Override
        </CardTitle>
        <CardDescription>
          Configure a custom domain for this reseller's M3U URLs and streaming links.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="m3u-domain">Custom M3U Domain (optional)</Label>
          <Input
            id="m3u-domain"
            placeholder="custom.domain.com"
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            disabled={isLoading || isSaving}
          />
          <p className="text-sm text-muted-foreground">
            Used for M3U URLs and customer streaming links. Leave empty to use the default 
            platform domain (vpn.eztvclub.online). Supports formats like: custom.domain.com, 
            https://custom.domain.com, or custom.domain.com:8443
          </p>
        </div>

        <div className="flex gap-2">
          <Button
            onClick={handleSave}
            disabled={isDisabled || !hasChanges}
            className="bg-eztv-700 hover:bg-eztv-800"
          >
            {isBackfilling ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Updating customers...
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" />
                {isSaving ? 'Saving...' : 'Save Settings'}
              </>
            )}
          </Button>

          {originalDomain && (
            <Button
              variant="outline"
              onClick={handleClear}
              disabled={isDisabled}
            >
              {isBackfilling ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Updating...
                </>
              ) : (
                <>
                  <X className="h-4 w-4 mr-2" />
                  Clear Override
                </>
              )}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

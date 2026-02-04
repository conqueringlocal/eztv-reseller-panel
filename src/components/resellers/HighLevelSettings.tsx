import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle, Eye, EyeOff, Info, Shield } from 'lucide-react';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from '@/components/ui/form';

const highLevelSettingsSchema = z.object({
  locationId: z.string().min(1, 'HighLevel Location ID is required'),
  privateIntegrationToken: z.string().min(1, 'Private Integration Token is required'),
});

type HighLevelSettingsFormData = z.infer<typeof highLevelSettingsSchema>;

interface HighLevelSettingsProps {
  resellerId: string;
}

// ADMIN-ONLY COMPONENT
// Resellers cannot view or edit these settings
export function HighLevelSettings({ resellerId }: HighLevelSettingsProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [hasSettings, setHasSettings] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [originalLocationId, setOriginalLocationId] = useState('');
  const [originalToken, setOriginalToken] = useState('');

  const form = useForm<HighLevelSettingsFormData>({
    resolver: zodResolver(highLevelSettingsSchema),
    defaultValues: {
      locationId: '',
      privateIntegrationToken: '',
    },
  });

  // Load existing settings (admin-only via RLS)
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const { data, error } = await supabase
          .from('reseller_highlevel_settings')
          .select('location_id, private_integration_token, is_active')
          .eq('reseller_id', resellerId)
          .single();

        if (data && !error) {
          setHasSettings(true);
          setOriginalLocationId(data.location_id);
          setOriginalToken(data.private_integration_token || '');
          form.setValue('locationId', data.location_id);
          form.setValue('privateIntegrationToken', data.private_integration_token || '');
        }
      } catch (error) {
        console.error('Error loading HighLevel settings:', error);
      }
    };

    loadSettings();
  }, [resellerId, form]);

  const onSubmit = async (data: HighLevelSettingsFormData) => {
    setIsLoading(true);
    try {
      // Check if location_id or token changed -> clear cached mappings
      const locationChanged = data.locationId !== originalLocationId;
      const tokenChanged = data.privateIntegrationToken !== originalToken;
      const shouldClearCache = locationChanged || tokenChanged;

      const updateData: Record<string, unknown> = {
        location_id: data.locationId,
        private_integration_token: data.privateIntegrationToken,
        is_active: true,
      };

      // Clear custom_field_mappings if token or location changed
      if (shouldClearCache) {
        updateData.custom_field_mappings = {};
        console.log('🔄 Clearing cached custom field mappings due to config change');
      }

      if (hasSettings) {
        const { error } = await supabase
          .from('reseller_highlevel_settings')
          .update(updateData)
          .eq('reseller_id', resellerId);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('reseller_highlevel_settings')
          .insert({
            reseller_id: resellerId,
            location_id: data.locationId,
            private_integration_token: data.privateIntegrationToken,
            is_active: true,
            custom_field_mappings: {}
          });

        if (error) throw error;
        setHasSettings(true);
      }

      // Update original values for next comparison
      setOriginalLocationId(data.locationId);
      setOriginalToken(data.privateIntegrationToken);

      toast.success('HighLevel settings saved successfully');
    } catch (error) {
      console.error('Error saving HighLevel settings:', error);
      toast.error('Failed to save HighLevel settings');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDisableIntegration = async () => {
    if (!hasSettings) return;

    setIsLoading(true);
    try {
      const { error } = await supabase
        .from('reseller_highlevel_settings')
        .update({ is_active: false })
        .eq('reseller_id', resellerId);

      if (error) throw error;

      toast.success('HighLevel integration disabled');
      form.reset();
      setHasSettings(false);
    } catch (error) {
      console.error('Error disabling HighLevel integration:', error);
      toast.error('Failed to disable HighLevel integration');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5" />
          CRM Integration Settings
        </CardTitle>
        <CardDescription>
          Configure HighLevel Private Integration Token for this reseller. 
          These settings are admin-managed and not visible to resellers.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Alert className="mb-4">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            <strong>Admin Only:</strong> Enter the reseller's HighLevel Location ID and 
            Private Integration Token. Create the token in HighLevel under 
            Settings → Integrations → Private Integrations.
          </AlertDescription>
        </Alert>

        <Alert className="mb-4 border-blue-200 bg-blue-50">
          <Info className="h-4 w-4 text-blue-600" />
          <AlertDescription className="text-blue-800">
            <strong>Required Custom Fields in HighLevel:</strong>
            <ul className="mt-2 ml-4 list-disc text-sm">
              <li><code>provision_status</code> - Success or failed status</li>
              <li><code>service_username</code> - IPTV username</li>
              <li><code>service_password</code> - IPTV password</li>
              <li><code>service_m3u_url</code> - M3U streaming URL</li>
              <li><code>service_expiration</code> - Expiration date (YYYY-MM-DD)</li>
              <li><code>provision_error</code> - Error message if failed</li>
            </ul>
          </AlertDescription>
        </Alert>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="locationId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>HighLevel Location ID</FormLabel>
                  <FormControl>
                    <Input placeholder="Enter HighLevel Location ID" {...field} />
                  </FormControl>
                  <FormDescription>
                    The Location ID from the reseller's HighLevel sub-account
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="privateIntegrationToken"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Private Integration Token</FormLabel>
                  <FormControl>
                    <div className="flex gap-2">
                      <Input 
                        type={showToken ? "text" : "password"}
                        placeholder="Enter Private Integration Token" 
                        className="flex-1"
                        {...field} 
                      />
                      <Button 
                        type="button"
                        variant="outline" 
                        onClick={() => setShowToken(!showToken)}
                      >
                        {showToken ? <EyeOff size={16} /> : <Eye size={16} />}
                      </Button>
                    </div>
                  </FormControl>
                  <FormDescription>
                    Private Integration Token from HighLevel Settings → Integrations
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex gap-2">
              <Button 
                type="submit" 
                disabled={isLoading}
                className="bg-eztv-700 hover:bg-eztv-800"
              >
                {isLoading ? 'Saving...' : hasSettings ? 'Update Settings' : 'Save Settings'}
              </Button>
              
              {hasSettings && (
                <Button 
                  type="button"
                  variant="outline"
                  onClick={handleDisableIntegration}
                  disabled={isLoading}
                >
                  Disable Integration
                </Button>
              )}
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}

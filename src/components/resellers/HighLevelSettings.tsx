
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
import { CheckCircle, AlertCircle, Eye, EyeOff, Info } from 'lucide-react';
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
  locationApiKey: z.string().min(1, 'HighLevel Location API Key is required'),
});

type HighLevelSettingsFormData = z.infer<typeof highLevelSettingsSchema>;

interface HighLevelSettingsProps {
  resellerId: string;
  isAdminView?: boolean;
}

export function HighLevelSettings({ resellerId, isAdminView = false }: HighLevelSettingsProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [hasSettings, setHasSettings] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<{ valid: boolean; error?: string } | null>(null);
  const [showApiKey, setShowApiKey] = useState(false);

  const form = useForm<HighLevelSettingsFormData>({
    resolver: zodResolver(highLevelSettingsSchema),
    defaultValues: {
      locationId: '',
      locationApiKey: '',
    },
  });

  // Load existing settings
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const { data, error } = await supabase
          .from('reseller_highlevel_settings')
          .select('location_id, location_api_key, is_active')
          .eq('reseller_id', resellerId)
          .single();

        if (data && !error) {
          setHasSettings(true);
          form.setValue('locationId', data.location_id);
          form.setValue('locationApiKey', data.location_api_key || '');
        }
      } catch (error) {
        console.error('Error loading HighLevel settings:', error);
      }
    };

    loadSettings();
  }, [resellerId, form]);

  const validateSettings = async () => {
    const { locationId, locationApiKey } = form.getValues();

    if (!locationId || !locationApiKey) {
      toast.error('Please enter both Location ID and API Key before validating');
      return;
    }

    setIsValidating(true);
    setValidationResult(null);

    try {
      // Test the API key by making a request to HighLevel API
      const testResponse = await fetch('https://rest.gohighlevel.com/v1/contacts/', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${locationApiKey}`,
          'Content-Type': 'application/json'
        }
      });

      if (testResponse.status === 401) {
        setValidationResult({
          valid: false,
          error: 'Invalid Location API Key - authentication failed'
        });
        toast.error('Location API Key validation failed');
        return;
      }

      if (!testResponse.ok) {
        const errorText = await testResponse.text();
        setValidationResult({
          valid: false,
          error: `API validation failed: ${testResponse.status} - ${errorText}`
        });
        toast.error('API validation failed');
        return;
      }

      setValidationResult({ valid: true });
      toast.success('HighLevel settings validated successfully!');

    } catch (error) {
      console.error('Error validating HighLevel settings:', error);
      setValidationResult({
        valid: false,
        error: error instanceof Error ? error.message : 'Unknown validation error'
      });
      toast.error('HighLevel settings validation failed');
    } finally {
      setIsValidating(false);
    }
  };

  const onSubmit = async (data: HighLevelSettingsFormData) => {
    setIsLoading(true);
    try {
      if (hasSettings) {
        // Update existing settings
        const { error } = await supabase
          .from('reseller_highlevel_settings')
          .update({
            location_id: data.locationId,
            location_api_key: data.locationApiKey,
            is_active: true,
          })
          .eq('reseller_id', resellerId);

        if (error) throw error;
      } else {
        // Insert new settings
        const { error } = await supabase
          .from('reseller_highlevel_settings')
          .insert({
            reseller_id: resellerId,
            location_id: data.locationId,
            location_api_key: data.locationApiKey,
            is_active: true,
          });

        if (error) throw error;
        setHasSettings(true);
      }

      toast.success('HighLevel settings saved successfully');
      setValidationResult(null);
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
      setValidationResult(null);
    } catch (error) {
      console.error('Error disabling HighLevel integration:', error);
      toast.error('Failed to disable HighLevel integration');
    } finally {
      setIsLoading(false);
    }
  };

  const getCardTitle = () => {
    return isAdminView ? 'CRM Location Settings' : 'HighLevel Integration';
  };

  const getCardDescription = () => {
    if (isAdminView) {
      return 'Configure the HighLevel Location ID and Location API Key for this reseller.';
    }
    return 'Configure your HighLevel Location ID and Location API Key for customer integration.';
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{getCardTitle()}</CardTitle>
        <CardDescription>
          {getCardDescription()}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Alert className="mb-4">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            <strong>Important:</strong> You need both your HighLevel Location ID and Location API Key. 
            The Location API Key is specific to each location and provides the necessary authentication for creating contacts.
          </AlertDescription>
        </Alert>

        <Alert className="mb-4 border-blue-200 bg-blue-50">
          <Info className="h-4 w-4 text-blue-600" />
          <AlertDescription className="text-blue-800">
            <strong>IPTV Credentials Integration:</strong> When customers are created or synced to HighLevel, their IPTV username, password, and M3U URL will be automatically added as custom fields to their contact record. Make sure your HighLevel location has the following custom fields configured:
            <ul className="mt-2 ml-4 list-disc text-sm">
              <li><code>iptv_username</code> - For storing the IPTV username</li>
              <li><code>iptv_password</code> - For storing the IPTV password</li>
              <li><code>iptv_m3u_url</code> - For storing the M3U URL</li>
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
                    The Location ID from your HighLevel sub-account
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="locationApiKey"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>HighLevel Location API Key</FormLabel>
                  <FormControl>
                    <div className="flex gap-2">
                      <Input 
                        type={showApiKey ? "text" : "password"}
                        placeholder="Enter HighLevel Location API Key" 
                        className="flex-1"
                        {...field} 
                      />
                      <Button 
                        type="button"
                        variant="outline" 
                        onClick={() => setShowApiKey(!showApiKey)}
                      >
                        {showApiKey ? <EyeOff size={16} /> : <Eye size={16} />}
                      </Button>
                    </div>
                  </FormControl>
                  <FormDescription>
                    The Location-specific API Key from your HighLevel location settings
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {validationResult && (
              <Alert className={validationResult.valid ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"}>
                {validationResult.valid ? (
                  <CheckCircle className="h-4 w-4 text-green-600" />
                ) : (
                  <AlertCircle className="h-4 w-4 text-red-600" />
                )}
                <AlertDescription className={validationResult.valid ? "text-green-800" : "text-red-800"}>
                  {validationResult.valid 
                    ? "✅ HighLevel settings validated successfully!"
                    : `❌ Validation failed: ${validationResult.error}`
                  }
                </AlertDescription>
              </Alert>
            )}

            <div className="flex gap-2">
              <Button 
                type="button"
                variant="outline"
                onClick={validateSettings}
                disabled={isValidating || isLoading}
              >
                {isValidating ? 'Validating...' : 'Test Connection'}
              </Button>
              
              <Button 
                type="submit" 
                disabled={isLoading || isValidating}
                className="bg-eztv-700 hover:bg-eztv-800"
              >
                {isLoading ? 'Saving...' : hasSettings ? 'Update Settings' : 'Save Settings'}
              </Button>
              
              {hasSettings && (
                <Button 
                  type="button"
                  variant="outline"
                  onClick={handleDisableIntegration}
                  disabled={isLoading || isValidating}
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

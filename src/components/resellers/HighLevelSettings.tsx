
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
import { CheckCircle, AlertCircle, Info } from 'lucide-react';
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
  apiKey: z.string().min(1, 'HighLevel Agency API key is required'),
  locationId: z.string().min(1, 'HighLevel Location ID is required'),
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

  const form = useForm<HighLevelSettingsFormData>({
    resolver: zodResolver(highLevelSettingsSchema),
    defaultValues: {
      apiKey: '',
      locationId: '',
    },
  });

  // Load existing settings
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const { data, error } = await supabase
          .from('reseller_highlevel_settings')
          .select('api_key, location_id, is_active')
          .eq('reseller_id', resellerId)
          .single();

        if (data && !error) {
          setHasSettings(true);
          form.setValue('apiKey', data.api_key);
          form.setValue('locationId', data.location_id);
        }
      } catch (error) {
        console.error('Error loading HighLevel settings:', error);
      }
    };

    loadSettings();
  }, [resellerId, form]);

  const validateApiKey = async () => {
    const apiKey = form.getValues('apiKey');
    const locationId = form.getValues('locationId');

    if (!apiKey || !locationId) {
      toast.error('Please enter both API Key and Location ID before validating');
      return;
    }

    setIsValidating(true);
    setValidationResult(null);

    try {
      // Test the API key using the HighLevel API service
      const testResponse = await fetch('https://rest.gohighlevel.com/v1/locations/', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        }
      });

      if (testResponse.status === 401) {
        setValidationResult({
          valid: false,
          error: 'Invalid Agency API Key - authentication failed'
        });
        toast.error('API Key validation failed: Invalid credentials');
        return;
      }

      if (!testResponse.ok) {
        const errorText = await testResponse.text();
        setValidationResult({
          valid: false,
          error: `API validation failed: ${testResponse.status} - ${errorText}`
        });
        toast.error('API Key validation failed');
        return;
      }

      const result = await testResponse.json();
      const locations = result.locations || [];
      const locationExists = locations.some((loc: any) => loc.id === locationId);
      
      if (!locationExists) {
        setValidationResult({
          valid: false,
          error: `Location ID ${locationId} not accessible with this Agency API Key`
        });
        toast.error('Location ID not found or not accessible');
        return;
      }

      setValidationResult({ valid: true });
      toast.success('API Key and Location ID validated successfully!');

    } catch (error) {
      console.error('Error validating API key:', error);
      setValidationResult({
        valid: false,
        error: error instanceof Error ? error.message : 'Unknown validation error'
      });
      toast.error('API Key validation failed');
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
            api_key: data.apiKey,
            location_id: data.locationId,
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
            api_key: data.apiKey,
            location_id: data.locationId,
            is_active: true,
          });

        if (error) throw error;
        setHasSettings(true);
      }

      toast.success('HighLevel settings saved successfully');
      setValidationResult(null); // Reset validation after save
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
    return isAdminView ? 'SMS Integration Settings' : 'HighLevel Integration';
  };

  const getCardDescription = () => {
    if (isAdminView) {
      return 'Configure SMS delivery credentials for this reseller. Customer credentials will be automatically sent via SMS when accounts are created.';
    }
    return 'Configure your HighLevel Agency API credentials to automatically send customer credentials via SMS. This integration requires an Agency API Key from your HighLevel account.';
  };

  const getApiKeyLabel = () => {
    return isAdminView ? 'SMS Service API Key' : 'HighLevel Agency API Key';
  };

  const getLocationIdLabel = () => {
    return isAdminView ? 'SMS Service Location ID' : 'HighLevel Location ID';
  };

  const getApiKeyDescription = () => {
    if (isAdminView) {
      return 'Agency API key for the SMS service integration';
    }
    return 'Your HighLevel Agency API Key (not a Location API Key). This should be obtained from your HighLevel Agency settings.';
  };

  const getLocationIdDescription = () => {
    if (isAdminView) {
      return 'Location identifier for the SMS service';
    }
    return 'The Location ID from your HighLevel sub-account that will be used for customer messaging';
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
        {!isAdminView && (
          <Alert className="mb-4">
            <Info className="h-4 w-4" />
            <AlertDescription>
              <strong>Important:</strong> You must use an <strong>Agency API Key</strong> (not a Location API Key). 
              Agency API Keys can be found in your HighLevel Agency settings and provide access to multiple locations.
            </AlertDescription>
          </Alert>
        )}

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="apiKey"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{getApiKeyLabel()}</FormLabel>
                  <FormControl>
                    <Input 
                      type="password" 
                      placeholder={`Enter ${isAdminView ? 'SMS service' : 'HighLevel Agency'} API key`}
                      {...field} 
                    />
                  </FormControl>
                  <FormDescription>
                    {getApiKeyDescription()}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="locationId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{getLocationIdLabel()}</FormLabel>
                  <FormControl>
                    <Input placeholder={`Enter ${isAdminView ? 'SMS service' : 'HighLevel'} Location ID`} {...field} />
                  </FormControl>
                  <FormDescription>
                    {getLocationIdDescription()}
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
                    ? "✅ API Key and Location ID validated successfully!"
                    : `❌ Validation failed: ${validationResult.error}`
                  }
                </AlertDescription>
              </Alert>
            )}

            <div className="flex gap-2">
              <Button 
                type="button"
                variant="outline"
                onClick={validateApiKey}
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

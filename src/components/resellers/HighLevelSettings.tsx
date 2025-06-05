
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
  const [hasGlobalApiKey, setHasGlobalApiKey] = useState(false);

  const form = useForm<HighLevelSettingsFormData>({
    resolver: zodResolver(highLevelSettingsSchema),
    defaultValues: {
      locationId: '',
    },
  });

  // Check if global API key is configured
  useEffect(() => {
    const checkGlobalApiKey = async () => {
      try {
        const { data, error } = await supabase
          .from('system_settings')
          .select('value')
          .eq('id', 'highlevel_agency_api_key')
          .single();

        setHasGlobalApiKey(!error && !!data?.value);
      } catch (error) {
        console.error('Error checking global API key:', error);
        setHasGlobalApiKey(false);
      }
    };

    checkGlobalApiKey();
  }, []);

  // Load existing settings
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const { data, error } = await supabase
          .from('reseller_highlevel_settings')
          .select('location_id, is_active')
          .eq('reseller_id', resellerId)
          .single();

        if (data && !error) {
          setHasSettings(true);
          form.setValue('locationId', data.location_id);
        }
      } catch (error) {
        console.error('Error loading HighLevel settings:', error);
      }
    };

    loadSettings();
  }, [resellerId, form]);

  const validateLocationId = async () => {
    const locationId = form.getValues('locationId');

    if (!locationId) {
      toast.error('Please enter a Location ID before validating');
      return;
    }

    if (!hasGlobalApiKey) {
      toast.error('Global Agency API Key is not configured. Please contact your administrator.');
      return;
    }

    setIsValidating(true);
    setValidationResult(null);

    try {
      // Get the global API key from system settings
      const { data: systemSettings, error: systemError } = await supabase
        .from('system_settings')
        .select('value')
        .eq('id', 'highlevel_agency_api_key')
        .single();

      if (systemError || !systemSettings?.value) {
        setValidationResult({
          valid: false,
          error: 'Global Agency API Key not found'
        });
        toast.error('Global Agency API Key not configured');
        return;
      }

      // Test the location access with the API key
      const testResponse = await fetch('https://rest.gohighlevel.com/v1/locations/', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${systemSettings.value}`,
          'Content-Type': 'application/json'
        }
      });

      if (testResponse.status === 401) {
        setValidationResult({
          valid: false,
          error: 'Invalid Agency API Key - authentication failed'
        });
        toast.error('Global Agency API Key validation failed');
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

      const result = await testResponse.json();
      const locations = result.locations || [];
      const locationExists = locations.some((loc: any) => loc.id === locationId);
      
      if (!locationExists) {
        setValidationResult({
          valid: false,
          error: `Location ID ${locationId} not accessible with the configured Agency API Key`
        });
        toast.error('Location ID not found or not accessible');
        return;
      }

      setValidationResult({ valid: true });
      toast.success('Location ID validated successfully!');

    } catch (error) {
      console.error('Error validating location ID:', error);
      setValidationResult({
        valid: false,
        error: error instanceof Error ? error.message : 'Unknown validation error'
      });
      toast.error('Location ID validation failed');
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
      return 'Configure the HighLevel Location ID for this reseller. The global Agency API Key is managed at the system level.';
    }
    return 'Configure your HighLevel Location ID. Your admin has already configured the global Agency API Key.';
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
        {!hasGlobalApiKey && (
          <Alert className="mb-4 border-orange-200 bg-orange-50">
            <AlertCircle className="h-4 w-4 text-orange-600" />
            <AlertDescription className="text-orange-800">
              <strong>Global Agency API Key Required:</strong> The system administrator needs to configure the global HighLevel Agency API Key before Location IDs can be validated.
              {isAdminView && ' Please configure this in the Admin Settings.'}
            </AlertDescription>
          </Alert>
        )}

        <Alert className="mb-4">
          <Info className="h-4 w-4" />
          <AlertDescription>
            <strong>Note:</strong> Only the Location ID needs to be configured here. 
            The Agency API Key is managed globally by your system administrator for security purposes.
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
                    The Location ID from your HighLevel sub-account that will be used for customer messaging
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
                    ? "✅ Location ID validated successfully!"
                    : `❌ Validation failed: ${validationResult.error}`
                  }
                </AlertDescription>
              </Alert>
            )}

            <div className="flex gap-2">
              <Button 
                type="button"
                variant="outline"
                onClick={validateLocationId}
                disabled={isValidating || isLoading || !hasGlobalApiKey}
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

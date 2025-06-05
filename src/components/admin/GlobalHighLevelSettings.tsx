
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
import { CheckCircle, AlertCircle, Info, Key } from 'lucide-react';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from '@/components/ui/form';

const globalApiKeySchema = z.object({
  apiKey: z.string().min(1, 'HighLevel Agency API key is required'),
});

type GlobalApiKeyFormData = z.infer<typeof globalApiKeySchema>;

export function GlobalHighLevelSettings() {
  const [isLoading, setIsLoading] = useState(false);
  const [hasApiKey, setHasApiKey] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<{ valid: boolean; error?: string } | null>(null);

  const form = useForm<GlobalApiKeyFormData>({
    resolver: zodResolver(globalApiKeySchema),
    defaultValues: {
      apiKey: '',
    },
  });

  // Load existing API key
  useEffect(() => {
    const loadApiKey = async () => {
      try {
        const { data, error } = await supabase
          .from('system_settings')
          .select('value')
          .eq('id', 'highlevel_agency_api_key')
          .single();

        if (data && !error && data.value) {
          setHasApiKey(true);
          // Show masked version for security
          form.setValue('apiKey', '••••••••••••••••••••••••••••••••');
        }
      } catch (error) {
        console.error('Error loading global API key:', error);
      }
    };

    loadApiKey();
  }, [form]);

  const validateApiKey = async () => {
    const apiKey = form.getValues('apiKey');

    if (!apiKey || apiKey.includes('•')) {
      toast.error('Please enter a valid Agency API Key');
      return;
    }

    setIsValidating(true);
    setValidationResult(null);

    try {
      // Test the API key by attempting to fetch locations
      const response = await fetch('https://rest.gohighlevel.com/v1/locations/', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.status === 401) {
        setValidationResult({
          valid: false,
          error: 'Invalid Agency API Key - authentication failed'
        });
        toast.error('API Key validation failed: Invalid credentials');
        return;
      }

      if (!response.ok) {
        const errorText = await response.text();
        setValidationResult({
          valid: false,
          error: `API validation failed: ${response.status} - ${errorText}`
        });
        toast.error('API Key validation failed');
        return;
      }

      const result = await response.json();
      const locations = result.locations || [];
      
      setValidationResult({ 
        valid: true,
        error: `API Key is valid and provides access to ${locations.length} location(s)`
      });
      toast.success(`API Key validated successfully! Access to ${locations.length} location(s) confirmed.`);

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

  const onSubmit = async (data: GlobalApiKeyFormData) => {
    // Don't save if it's the masked version
    if (data.apiKey.includes('•')) {
      toast.error('Please enter a new API key to update');
      return;
    }

    setIsLoading(true);
    try {
      // Update or insert the global API key
      const { error: upsertError } = await supabase
        .from('system_settings')
        .upsert({
          id: 'highlevel_agency_api_key',
          value: data.apiKey,
          description: 'Global HighLevel Agency API Key used for all CRM integrations'
        });

      if (upsertError) throw upsertError;

      setHasApiKey(true);
      toast.success('Global Agency API Key saved successfully');
      setValidationResult(null);
      
      // Mask the field again for security
      form.setValue('apiKey', '••••••••••••••••••••••••••••••••');
    } catch (error) {
      console.error('Error saving global API key:', error);
      toast.error('Failed to save global API key');
    } finally {
      setIsLoading(false);
    }
  };

  const handleClearApiKey = async () => {
    setIsLoading(true);
    try {
      const { error } = await supabase
        .from('system_settings')
        .delete()
        .eq('id', 'highlevel_agency_api_key');

      if (error) throw error;

      toast.success('Global Agency API Key removed');
      form.reset();
      setHasApiKey(false);
      setValidationResult(null);
    } catch (error) {
      console.error('Error removing global API key:', error);
      toast.error('Failed to remove global API key');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Key className="h-5 w-5" />
          Global HighLevel Agency API Key
        </CardTitle>
        <CardDescription>
          Configure the global HighLevel Agency API Key that will be used by all resellers for CRM integration. 
          This centralizes API key management for security and simplicity.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Alert className="mb-4">
          <Info className="h-4 w-4" />
          <AlertDescription>
            <strong>Security Note:</strong> The Agency API Key is stored securely and will be used by all resellers. 
            Individual resellers only need to configure their Location IDs.
          </AlertDescription>
        </Alert>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="apiKey"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>HighLevel Agency API Key</FormLabel>
                  <FormControl>
                    <Input 
                      type="password" 
                      placeholder="Enter HighLevel Agency API key"
                      {...field}
                      onFocus={() => {
                        // Clear the masked value when focused
                        if (field.value.includes('•')) {
                          field.onChange('');
                        }
                      }}
                    />
                  </FormControl>
                  <FormDescription>
                    Your HighLevel Agency API Key (not a Location API Key). This should be obtained from your HighLevel Agency settings 
                    and will provide access to all locations under your agency.
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
                    ? `✅ ${validationResult.error}`
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
                {isValidating ? 'Validating...' : 'Test API Key'}
              </Button>
              
              <Button 
                type="submit" 
                disabled={isLoading || isValidating}
                className="bg-eztv-700 hover:bg-eztv-800"
              >
                {isLoading ? 'Saving...' : hasApiKey ? 'Update API Key' : 'Save API Key'}
              </Button>
              
              {hasApiKey && (
                <Button 
                  type="button"
                  variant="outline"
                  onClick={handleClearApiKey}
                  disabled={isLoading || isValidating}
                  className="text-red-600 hover:text-red-700"
                >
                  Remove API Key
                </Button>
              )}
            </div>
          </form>
        </Form>

        {hasApiKey && (
          <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-md">
            <p className="text-sm text-green-800">
              ✅ Global Agency API Key is configured and ready for use by all resellers.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

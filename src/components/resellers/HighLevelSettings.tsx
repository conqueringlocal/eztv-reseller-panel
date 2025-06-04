
import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
  apiKey: z.string().min(1, 'HighLevel API key is required'),
  locationId: z.string().min(1, 'HighLevel Location ID is required'),
});

type HighLevelSettingsFormData = z.infer<typeof highLevelSettingsSchema>;

interface HighLevelSettingsProps {
  resellerId: string;
}

export function HighLevelSettings({ resellerId }: HighLevelSettingsProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [hasSettings, setHasSettings] = useState(false);

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
        <CardTitle>HighLevel Integration</CardTitle>
        <CardDescription>
          Configure your HighLevel API credentials to automatically send customer credentials via SMS.
          Each reseller can have their own HighLevel sub-account.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="apiKey"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>HighLevel API Key</FormLabel>
                  <FormControl>
                    <Input 
                      type="password" 
                      placeholder="Enter your HighLevel API key" 
                      {...field} 
                    />
                  </FormControl>
                  <FormDescription>
                    Your HighLevel API key from your sub-account settings
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
                  <FormLabel>HighLevel Location ID</FormLabel>
                  <FormControl>
                    <Input placeholder="Enter your HighLevel Location ID" {...field} />
                  </FormControl>
                  <FormDescription>
                    The Location ID from your HighLevel sub-account
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

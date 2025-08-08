import React, { useEffect, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const schema = z.object({
  apiKey: z.string().min(1, 'API key is required'),
  panelUrl: z.string().url('Enter a valid URL'),
});

type FormData = z.infer<typeof schema>;

interface ResellerApiCredentialsFormProps {
  userId: string;
  onSaved?: () => void;
}

export function ResellerApiCredentialsForm({ userId, onSaved }: ResellerApiCredentialsFormProps) {
  const [loading, setLoading] = useState(false);
  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { apiKey: '', panelUrl: '' },
  });

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('api_key, panel_url')
        .eq('id', userId)
        .single();
      if (error) {
        console.error('Failed to load API credentials', error);
        return;
      }
      if (mounted && data) {
        form.reset({ apiKey: data.api_key || '', panelUrl: data.panel_url || '' });
      }
    })();
    return () => { mounted = false; };
  }, [userId, form]);

  const onSubmit = async (values: FormData) => {
    setLoading(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ api_key: values.apiKey, panel_url: values.panelUrl })
        .eq('id', userId);

      if (error) {
        console.error('Error saving API credentials', error);
        toast.error('Failed to save API credentials');
        return;
      }

      toast.success('API credentials saved');
      onSaved?.();
    } catch (e) {
      console.error(e);
      toast.error('Unexpected error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="apiKey"
          render={({ field }) => (
            <FormItem>
              <FormLabel>API Key</FormLabel>
              <FormControl>
                <Input type="password" placeholder="Enter your provider API key" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="panelUrl"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Panel URL</FormLabel>
              <FormControl>
                <Input placeholder="https://panel.example.com/api/api.php" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex justify-end">
          <Button type="submit" disabled={loading} className="bg-eztv-700 hover:bg-eztv-800">
            {loading ? 'Saving...' : 'Save Credentials'}
          </Button>
        </div>
      </form>
    </Form>
  );
}

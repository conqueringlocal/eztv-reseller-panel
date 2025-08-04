import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface FunnelTemplate {
  id: string;
  name: string;
  description: string;
  template_type: string;
  preview_image_url?: string;
  html_content: string;
  css_content?: string;
  js_content?: string;
  form_fields: any;
  integrations: any;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  created_by?: string;
}

export interface Funnel {
  id: string;
  reseller_id: string;
  template_id: string;
  name: string;
  subdomain: string;
  custom_domain?: string;
  is_published: boolean;
  html_content: string;
  css_content?: string;
  js_content?: string;
  form_fields: any;
  integrations: any;
  analytics: any;
  created_at: string;
  updated_at: string;
  template?: FunnelTemplate;
}

export const useFunnels = () => {
  const [funnels, setFunnels] = useState<Funnel[]>([]);
  const [templates, setTemplates] = useState<FunnelTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  const fetchTemplates = async () => {
    try {
      const { data, error } = await supabase
        .from('funnel_templates')
        .select('*')
        .eq('is_active', true)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setTemplates(data || []);
    } catch (error) {
      console.error('Error fetching funnel templates:', error);
      toast({
        title: 'Error',
        description: 'Failed to load funnel templates',
        variant: 'destructive',
      });
    }
  };

  const fetchFunnels = async () => {
    try {
      const { data, error } = await supabase
        .from('funnels')
        .select(`
          *,
          template:funnel_templates(*)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setFunnels(data || []);
    } catch (error) {
      console.error('Error fetching funnels:', error);
      toast({
        title: 'Error',
        description: 'Failed to load funnels',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const createFunnel = async (funnelData: {
    template_id: string;
    name: string;
    subdomain: string;
    custom_domain?: string;
  }) => {
    try {
      const template = templates.find(t => t.id === funnelData.template_id);
      if (!template) throw new Error('Template not found');

      const { data, error } = await supabase
        .from('funnels')
        .insert([{
          ...funnelData,
          html_content: template.html_content,
          css_content: template.css_content,
          js_content: template.js_content,
          form_fields: template.form_fields,
          integrations: template.integrations,
          reseller_id: (await supabase.auth.getUser()).data.user?.id,
        }])
        .select()
        .single();

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Funnel created successfully',
      });

      fetchFunnels();
      return data;
    } catch (error) {
      console.error('Error creating funnel:', error);
      toast({
        title: 'Error',
        description: 'Failed to create funnel',
        variant: 'destructive',
      });
      return null;
    }
  };

  const updateFunnel = async (funnelId: string, updates: Partial<Funnel>) => {
    try {
      const { error } = await supabase
        .from('funnels')
        .update(updates)
        .eq('id', funnelId);

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Funnel updated successfully',
      });

      fetchFunnels();
      return true;
    } catch (error) {
      console.error('Error updating funnel:', error);
      toast({
        title: 'Error',
        description: 'Failed to update funnel',
        variant: 'destructive',
      });
      return false;
    }
  };

  const deleteFunnel = async (funnelId: string) => {
    try {
      const { error } = await supabase
        .from('funnels')
        .delete()
        .eq('id', funnelId);

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Funnel deleted successfully',
      });

      fetchFunnels();
      return true;
    } catch (error) {
      console.error('Error deleting funnel:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete funnel',
        variant: 'destructive',
      });
      return false;
    }
  };

  const publishFunnel = async (funnelId: string, isPublished: boolean) => {
    return updateFunnel(funnelId, { is_published: isPublished });
  };

  useEffect(() => {
    fetchTemplates();
    fetchFunnels();
  }, []);

  return {
    funnels,
    templates,
    isLoading,
    createFunnel,
    updateFunnel,
    deleteFunnel,
    publishFunnel,
    refreshFunnels: fetchFunnels,
    refreshTemplates: fetchTemplates,
  };
};
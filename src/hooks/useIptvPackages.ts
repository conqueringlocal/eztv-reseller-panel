
import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface IptvPackage {
  id: string;
  name: string;
  description?: string;
}

interface PackageResponse {
  success: boolean;
  packages?: IptvPackage[];
  source?: 'api' | 'default';
  endpoint_used?: string;
  panel_url?: string;
  debug_info?: {
    total_endpoints_tried: number;
    last_error: string;
    auth_format: string;
  };
  error?: string;
}

export const useIptvPackages = () => {
  const [packages, setPackages] = useState<IptvPackage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<'api' | 'default'>('api');
  const [debugInfo, setDebugInfo] = useState<PackageResponse['debug_info'] | null>(null);

  const fetchPackages = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      console.log('🚀 Fetching IPTV packages...');
      
      const { data, error } = await supabase.functions.invoke('get-iptv-packages');
      
      console.log('📡 Packages response:', { data, error });
      
      if (error) {
        console.error('❌ Error fetching packages:', error);
        const errorMsg = `Failed to fetch packages: ${error.message}`;
        setError(errorMsg);
        toast.error(errorMsg);
        return;
      }
      
      const response = data as PackageResponse;
      
      if (!response?.success) {
        const errorMsg = response?.error || 'Unknown error occurred';
        console.error('❌ Packages API error:', errorMsg);
        setError(errorMsg);
        
        // Show different messages based on error type
        if (errorMsg.includes('IPTV_PANEL_URL')) {
          toast.error('IPTV Panel URL not configured. Please configure it in your project settings.');
        } else if (errorMsg.includes('IPTV_API_KEY')) {
          toast.error('IPTV API key not configured. Please configure it in your project settings.');
        } else {
          toast.error(`Failed to fetch packages: ${errorMsg}`);
        }
        return;
      }
      
      setPackages(response.packages || []);
      setSource(response.source || 'api');
      setDebugInfo(response.debug_info || null);
      
      const packageCount = response.packages?.length || 0;
      console.log(`✅ Successfully loaded ${packageCount} packages from ${response.source || 'api'}`);
      
      // Show different messages based on source and results
      if (response.source === 'default') {
        console.log('⚠️ Using default packages - API endpoints may need configuration');
        toast.warning('Using default packages. Check your IPTV panel URL and credentials configuration.');
        
        // Log debugging information
        if (response.debug_info) {
          console.log('🔍 Debug Info:', {
            panel_url: response.panel_url,
            endpoints_tried: response.debug_info.total_endpoints_tried,
            auth_format: response.debug_info.auth_format,
            last_error: response.debug_info.last_error
          });
        }
      } else {
        console.log('🎉 Successfully connected to IPTV API');
        console.log(`🔗 Using endpoint: ${response.endpoint_used}`);
        console.log(`🌐 Panel URL: ${response.panel_url}`);
        toast.success(`Successfully loaded ${packageCount} packages from your IPTV panel`);
      }
      
    } catch (error) {
      console.error('💥 Unexpected error fetching packages:', error);
      const errorMsg = 'An unexpected error occurred while fetching packages';
      setError(errorMsg);
      toast.error(errorMsg);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchPackages();
  }, []);

  return {
    packages,
    isLoading,
    error,
    source,
    debugInfo,
    refetch: fetchPackages
  };
};

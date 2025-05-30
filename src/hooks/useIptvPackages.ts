
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
      console.log('🚀 Testing IPTV packages connection...');
      
      const { data, error } = await supabase.functions.invoke('get-iptv-packages');
      
      console.log('📡 Raw response data:', data);
      console.log('📡 Raw response error:', error);
      
      if (error) {
        console.error('❌ Edge function invocation error:', error);
        const errorMsg = `Connection failed: ${error.message}`;
        setError(errorMsg);
        toast.error(`🔌 ${errorMsg}`);
        return;
      }
      
      const response = data as PackageResponse;
      console.log('📋 Parsed response:', response);
      
      if (!response?.success) {
        const errorMsg = response?.error || 'Unknown error occurred';
        console.error('❌ API response error:', errorMsg);
        setError(errorMsg);
        
        // Enhanced error messaging with testing context
        if (errorMsg.includes('IPTV_PANEL_URL')) {
          toast.error('🔧 Configuration Issue: IPTV Panel URL not found. Please check your Supabase secrets.');
        } else if (errorMsg.includes('IPTV_API_KEY')) {
          toast.error('🔑 Configuration Issue: IPTV API key not found. Please check your Supabase secrets.');
        } else if (errorMsg.includes('HTTP')) {
          toast.error(`🌐 Connection Issue: ${errorMsg}. Check if your panel URL and credentials are correct.`);
        } else {
          toast.error(`⚠️ API Error: ${errorMsg}`);
        }
        return;
      }
      
      setPackages(response.packages || []);
      setSource(response.source || 'api');
      setDebugInfo(response.debug_info || null);
      
      const packageCount = response.packages?.length || 0;
      console.log(`✅ Test Result: ${packageCount} packages loaded from ${response.source || 'api'}`);
      
      // Enhanced success/warning messages for testing
      if (response.source === 'default') {
        console.log('⚠️ TEST RESULT: Using fallback packages - API connection failed');
        console.log('🔍 Debug Details:', {
          panel_url: response.panel_url,
          endpoints_tried: response.debug_info?.total_endpoints_tried,
          auth_format: response.debug_info?.auth_format,
          last_error: response.debug_info?.last_error
        });
        
        toast.warning(`🔄 Test Result: Using fallback packages (${packageCount}). API connection needs troubleshooting.`, {
          duration: 8000,
        });
      } else {
        console.log('🎉 TEST SUCCESS: Connected to live IPTV API!');
        console.log(`🔗 Active endpoint: ${response.endpoint_used}`);
        console.log(`🌐 Panel URL: ${response.panel_url}`);
        
        toast.success(`🎯 Test Success! Connected to your IPTV panel and loaded ${packageCount} live packages.`, {
          duration: 6000,
        });
      }
      
    } catch (error) {
      console.error('💥 Unexpected test error:', error);
      const errorMsg = 'Test failed with unexpected error';
      setError(errorMsg);
      toast.error(`💥 ${errorMsg}: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Auto-run test on mount
  useEffect(() => {
    console.log('🔄 Initializing IPTV packages test...');
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

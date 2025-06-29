
import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';

export interface IptvPackage {
  id: string;
  name: string;
  description?: string;
}

interface PackageResponse {
  success: boolean;
  packages?: IptvPackage[];
  source?: 'api' | 'default';
  provider?: string;
  endpoint_used?: string;
  panel_url?: string;
  debug_info?: {
    total_actions_tried: number;
    last_error: string;
    auth_format: string;
    provider_used?: string;
  };
  error?: string;
}

export const useIptvPackages = () => {
  const { user } = useAuth();
  const [packages, setPackages] = useState<IptvPackage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<'api' | 'default'>('api');
  const [provider, setProvider] = useState<string>('8k');
  const [debugInfo, setDebugInfo] = useState<PackageResponse['debug_info'] | null>(null);
  
  // Use ref to track if we're already fetching to prevent concurrent requests
  const isFetchingRef = useRef(false);
  
  // Memoize the fetchPackages function to prevent unnecessary re-renders
  const fetchPackages = useCallback(async () => {
    // Prevent concurrent requests
    if (isFetchingRef.current) {
      console.log('🔄 Fetch already in progress, skipping...');
      return;
    }
    
    isFetchingRef.current = true;
    setIsLoading(true);
    setError(null);
    
    try {
      console.log('🚀 Fetching IPTV packages...');
      
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
        
        // Enhanced error messaging with provider context
        const currentProvider = response?.debug_info?.provider_used || user?.provider || '8k';
        if (errorMsg.includes('API key')) {
          toast.error(`🔑 Configuration Issue: ${currentProvider.toUpperCase()} API key not found. Please check your Supabase secrets.`);
        } else if (errorMsg.includes('Panel URL')) {
          toast.error(`🔧 Configuration Issue: ${currentProvider.toUpperCase()} Panel URL not found. Please check your Supabase secrets.`);
        } else if (errorMsg.includes('HTTP')) {
          toast.error(`🌐 Connection Issue: ${errorMsg}. Check if your ${currentProvider.toUpperCase()} panel URL and credentials are correct.`);
        } else {
          toast.error(`⚠️ ${currentProvider.toUpperCase()} API Error: ${errorMsg}`);
        }
        return;
      }
      
      setPackages(response.packages || []);
      setSource(response.source || 'api');
      setProvider(response.provider || user?.provider || '8k');
      setDebugInfo(response.debug_info || null);
      
      const packageCount = response.packages?.length || 0;
      console.log(`✅ Loading Result: ${packageCount} packages loaded from ${response.provider?.toUpperCase() || 'Unknown'} provider`);
      
      // Enhanced success/warning messages with provider context
      if (response.source === 'default') {
        console.log(`⚠️ RESULT: Using fallback packages - ${response.provider?.toUpperCase() || 'Unknown'} API connection failed`);
        console.log('🔍 Debug Details:', {
          panel_url: response.panel_url,
          actions_tried: response.debug_info?.total_actions_tried,
          auth_format: response.debug_info?.auth_format,
          last_error: response.debug_info?.last_error,
          provider_used: response.debug_info?.provider_used
        });
        
        toast.warning(`🔄 Result: Using fallback packages (${packageCount}) for ${response.provider?.toUpperCase() || 'Unknown'}. API connection needs troubleshooting.`, {
          duration: 8000,
        });
      } else {
        console.log(`🎉 SUCCESS: Connected to live ${response.provider?.toUpperCase() || 'Unknown'} IPTV API!`);
        console.log(`🔗 Active endpoint: ${response.endpoint_used}`);
        console.log(`🌐 Panel URL: ${response.panel_url}`);
        
        toast.success(`🎯 Success! Connected to your ${response.provider?.toUpperCase() || 'Unknown'} panel and loaded ${packageCount} live packages.`, {
          duration: 6000,
        });
      }
      
    } catch (error) {
      console.error('💥 Unexpected error:', error);
      const errorMsg = 'Failed with unexpected error';
      setError(errorMsg);
      toast.error(`💥 ${errorMsg}: ${error.message}`);
    } finally {
      setIsLoading(false);
      isFetchingRef.current = false;
    }
  }, [user?.provider]); // Only depend on user.provider, not the entire user object

  // Use specific user properties as dependencies instead of the entire user object
  useEffect(() => {
    // Only fetch if we have a user and haven't fetched yet
    if (user?.id && packages.length === 0 && !isFetchingRef.current) {
      console.log('🔄 Initializing IPTV packages fetch for user:', user.id, 'provider:', user.provider);
      fetchPackages();
    }
  }, [user?.id, user?.provider, fetchPackages]); // Depend on specific user properties

  return {
    packages,
    isLoading,
    error,
    source,
    provider,
    debugInfo,
    refetch: fetchPackages
  };
};

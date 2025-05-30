
import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface IptvPackage {
  id: string;
  name: string;
  description?: string;
}

export const useIptvPackages = () => {
  const [packages, setPackages] = useState<IptvPackage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<'api' | 'default'>('api');

  const fetchPackages = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      console.log('Fetching IPTV packages...');
      
      const { data, error } = await supabase.functions.invoke('get-iptv-packages');
      
      console.log('Packages response:', { data, error });
      
      if (error) {
        console.error('Error fetching packages:', error);
        setError(`Failed to fetch packages: ${error.message}`);
        toast.error(`Failed to fetch packages: ${error.message}`);
        return;
      }
      
      if (!data?.success) {
        const errorMsg = data?.error || 'Unknown error occurred';
        console.error('Packages API error:', errorMsg);
        setError(errorMsg);
        toast.error(`Failed to fetch packages: ${errorMsg}`);
        return;
      }
      
      setPackages(data.packages || []);
      setSource(data.source || 'api');
      
      const packageCount = data.packages?.length || 0;
      console.log(`Successfully loaded ${packageCount} packages from ${data.source || 'api'}`);
      
      // Show different messages based on source
      if (data.source === 'default') {
        console.log('Using default packages - API endpoints may need configuration');
        // Don't show error toast for default packages, just log it
      } else {
        console.log('Successfully connected to IPTV API');
      }
      
    } catch (error) {
      console.error('Unexpected error fetching packages:', error);
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
    refetch: fetchPackages
  };
};

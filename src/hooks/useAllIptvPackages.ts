import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface IptvPackage {
  id: string;
  name: string;
  description?: string;
}

interface PackageResponse {
  success: boolean;
  packages: IptvPackage[];
  source?: string;
  provider?: string;
  debugInfo?: any;
}

interface AllPackagesState {
  packages: IptvPackage[];
  packageMap: Map<string, string>; // packageId -> packageName
  isLoading: boolean;
  error: string | null;
}

export function useAllIptvPackages() {
  const [state, setState] = useState<AllPackagesState>({
    packages: [],
    packageMap: new Map(),
    isLoading: true,
    error: null,
  });

  const fetchAllPackages = useCallback(async () => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));
    
    try {
      // Fetch packages for both major providers
      const providers = ['trex']; // Trex-only mode
      const allPackages: IptvPackage[] = [];
      const packageMap = new Map<string, string>();
      
      for (const provider of providers) {
        try {
          const { data, error } = await supabase.functions.invoke('get-iptv-packages', {
            body: { providerOverride: provider }
          });

          if (error) {
            console.error(`Error fetching ${provider} packages:`, error);
            continue;
          }

          if (data?.success && Array.isArray(data.packages)) {
            // Add packages to the combined list
            allPackages.push(...data.packages);
            
            // Build package lookup map
            data.packages.forEach((pkg: IptvPackage) => {
              packageMap.set(pkg.id, pkg.name);
            });
          }
        } catch (providerError) {
          console.error(`Failed to fetch packages for ${provider}:`, providerError);
          // Continue with other providers
        }
      }

      setState({
        packages: allPackages,
        packageMap,
        isLoading: false,
        error: null,
      });
    } catch (error: any) {
      console.error('Error fetching packages for all providers:', error);
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: error.message || 'Failed to fetch packages',
      }));
    }
  }, []);

  useEffect(() => {
    fetchAllPackages();
  }, [fetchAllPackages]);

  const getPackageName = useCallback((packageId: string): string => {
    return state.packageMap.get(packageId) || `Package: ${packageId}`;
  }, [state.packageMap]);

  return {
    packages: state.packages,
    packageMap: state.packageMap,
    getPackageName,
    isLoading: state.isLoading,
    error: state.error,
    refetch: fetchAllPackages,
  };
}
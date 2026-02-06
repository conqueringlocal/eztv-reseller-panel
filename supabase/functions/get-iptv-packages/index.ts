
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface PackageInfo {
  id: string;
  name: string;
  description?: string;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Check for provider override in request body
    let requestBody = null;
    try {
      const bodyText = await req.text();
      if (bodyText) {
        requestBody = JSON.parse(bodyText);
      }
    } catch (e) {
      // Body is empty or not JSON, continue with default behavior
    }

    // Get the authorization header to identify the reseller
    const authHeader = req.headers.get('Authorization');
    let userProvider = 'trex'; // Trex-only mode
    
    if (authHeader) {
      try {
        const token = authHeader.replace('Bearer ', '');
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);
        
        if (!authError && user) {
          // Get reseller's provider from profile
          const { data: profile } = await supabase
            .from('profiles')
            .select('provider')
            .eq('id', user.id)
            .single();
          
          if (profile?.provider) {
            userProvider = profile.provider;
          }
        }
      } catch (error) {
        console.log('Could not determine provider from auth, using default trex');
      }
    }

    // Use provider override if provided, otherwise use user's provider
    const effectiveProvider = requestBody?.providerOverride || userProvider;
    console.log(`🔍 Loading packages for provider: ${effectiveProvider}`, requestBody?.providerOverride ? '(overridden)' : '(from user)');

    // Get API credentials based on effective provider
    let API_KEY: string | undefined;
    let PANEL_URL: string | undefined;

    if (effectiveProvider === 'trex') {
      API_KEY = Deno.env.get('TREX_API_KEY');
      PANEL_URL = Deno.env.get('TREX_PANEL_URL');
    } else {
      API_KEY = Deno.env.get('8K_API_KEY') || Deno.env.get('IPTV_API_KEY');
      PANEL_URL = Deno.env.get('8K_PANEL_URL') || Deno.env.get('IPTV_PANEL_URL');
    }
    
    if (!API_KEY) {
      console.error(`${effectiveProvider.toUpperCase()} API key not configured`);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: `${effectiveProvider.toUpperCase()} API key not configured`
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500,
        },
      )
    }

    if (!PANEL_URL) {
      console.error(`${effectiveProvider.toUpperCase()} Panel URL not configured`);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: `${effectiveProvider.toUpperCase()} Panel URL not configured`
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500,
        },
      )
    }

    console.log(`Fetching packages from ${effectiveProvider.toUpperCase()} provider:`, PANEL_URL)

    let packages: PackageInfo[] = [];
    let lastError = '';
    let successfulEndpoint = '';

    // Provider-specific API actions
    const actions = effectiveProvider === 'trex' ? ['bouquet', 'packages'] : ['bouquet', 'packages', 'categories'];

    for (const action of actions) {
      try {
        console.log(`Trying ${effectiveProvider} action: ${action}`)
        
        let apiUrl: URL;
        
        if (effectiveProvider === 'trex') {
          // Trex uses a different API structure
          apiUrl = new URL(PANEL_URL.replace('/api/api.php', '').replace('/player_api.php', '') + '/api/api.php');
          apiUrl.searchParams.append('action', action);
          apiUrl.searchParams.append('api_key', API_KEY);
        } else {
          // 8K uses the standard structure
          apiUrl = new URL(PANEL_URL);
          apiUrl.searchParams.append('action', action);
          apiUrl.searchParams.append('api_key', API_KEY);
        }
        
        console.log(`🔗 ${effectiveProvider.toUpperCase()} API URL: ${apiUrl.toString().replace(API_KEY, '[REDACTED]')}`);
        
        const response = await fetch(apiUrl.toString(), {
          method: 'GET',
          headers: {
            'User-Agent': 'IPTV-Management-System/1.0',
            'Accept': 'application/json, text/plain, */*',
            'Cache-Control': 'no-cache',
          },
          signal: AbortSignal.timeout(10000), // 10 second timeout
        });
        
        const responseText = await response.text();
        console.log(`📡 ${effectiveProvider.toUpperCase()} Response Status: ${response.status}`);
        console.log(`📡 ${effectiveProvider.toUpperCase()} Response preview: ${responseText.substring(0, 200)}...`);

        if (!response.ok) {
          lastError = `HTTP ${response.status}: ${response.statusText}`;
          console.log(`Failed with: ${lastError}`);
          continue;
        }

        // Check if it's an HTML error page
        if (responseText.includes('<html') || responseText.includes('<!DOCTYPE')) {
          lastError = 'Received HTML error page instead of API response';
          console.log(`Failed with: ${lastError}`);
          continue;
        }

        // Check for common error responses
        if (responseText.toLowerCase().includes('not found') || 
            responseText.toLowerCase().includes('404') || 
            responseText.toLowerCase().includes('error') || 
            responseText.toLowerCase().includes('forbidden')) {
          lastError = `Error response: ${responseText.substring(0, 100)}`;
          console.log(`Failed with: ${lastError}`);
          continue;
        }

        // Try to parse as JSON
        let data;
        try {
          data = JSON.parse(responseText);
          console.log(`📋 Parsed JSON data keys:`, Object.keys(data));
        } catch (parseError) {
          lastError = `JSON parse error: ${parseError.message}`;
          console.log(`Failed with: ${lastError}`);
          continue;
        }

        // Check for API errors in the response
        if (data.error || data.status === 'error' || data.result === 'error') {
          lastError = data.error || data.message || data.result || 'API returned error status';
          console.log(`Failed with: ${lastError}`);
          continue;
        }

        // Try to extract packages from different response formats
        let extractedPackages: PackageInfo[] = [];
        
        if (Array.isArray(data)) {
          // Direct array response
          extractedPackages = data.map((item: any, index: number) => ({
            id: item.category_id || item.bouquet_id || item.id || item.package_id || (index + 1).toString(),
            name: item.category_name || item.bouquet_name || item.name || item.title || `Package ${index + 1}`,
            description: item.description || item.details || item.info || undefined
          })).filter(pkg => pkg.id && pkg.name);
        } else if (data.categories && Array.isArray(data.categories)) {
          // Categories format
          extractedPackages = data.categories.map((cat: any) => ({
            id: cat.category_id || cat.id,
            name: cat.category_name || cat.name,
            description: cat.description
          })).filter(pkg => pkg.id && pkg.name);
        } else if (data.bouquets && Array.isArray(data.bouquets)) {
          // Bouquets format
          extractedPackages = data.bouquets.map((bouquet: any) => ({
            id: bouquet.bouquet_id || bouquet.id,
            name: bouquet.bouquet_name || bouquet.name,
            description: bouquet.description
          })).filter(pkg => pkg.id && pkg.name);
        } else if (data.packages && Array.isArray(data.packages)) {
          // Packages format
          extractedPackages = data.packages.map((pkg: any) => ({
            id: pkg.package_id || pkg.id,
            name: pkg.package_name || pkg.name,
            description: pkg.description
          })).filter(pkg => pkg.id && pkg.name);
        } else if (data.result && Array.isArray(data.result)) {
          // Result wrapper format
          extractedPackages = data.result.map((item: any, index: number) => ({
            id: item.category_id || item.bouquet_id || item.id || item.package_id || (index + 1).toString(),
            name: item.category_name || item.bouquet_name || item.name || item.title || `Package ${index + 1}`,
            description: item.description
          })).filter(pkg => pkg.id && pkg.name);
        } else if (data.data && Array.isArray(data.data)) {
          // Data wrapper format
          extractedPackages = data.data.map((item: any, index: number) => ({
            id: item.category_id || item.bouquet_id || item.id || item.package_id || (index + 1).toString(),
            name: item.category_name || item.bouquet_name || item.name || item.title || `Package ${index + 1}`,
            description: item.description
          })).filter(pkg => pkg.id && pkg.name);
        }
        
        if (extractedPackages.length > 0) {
          packages = extractedPackages;
          successfulEndpoint = `${action} action`;
          console.log(`✅ SUCCESS: Found ${packages.length} packages using ${successfulEndpoint} for ${effectiveProvider}`);
          break;
        } else {
          lastError = `No packages found in ${action} response`;
          console.log(`Failed with: ${lastError}`);
        }
        
      } catch (error) {
        console.error(`Error with ${action} action:`, error);
        lastError = error.message;
        continue;
      }
    }

    // If no packages found from any action, provide provider-specific default packages
    if (packages.length === 0) {
      console.log(`❌ No packages found from any ${effectiveProvider.toUpperCase()} API action.`);
      console.log(`Last error: ${lastError}`);
      console.log(`Panel URL used: ${PANEL_URL}`);
      console.log(`Using default ${effectiveProvider} package options`);
      
      if (effectiveProvider === 'trex') {
        packages = [
          { id: '14826', name: 'Trex Premium Package', description: 'Premium IPTV channels with HD quality' },
          { id: '14827', name: 'Trex Sports Package', description: 'Sports channels and live events' },
          { id: '14828', name: 'Trex Entertainment', description: 'Movies and entertainment content' },
          { id: '14829', name: 'Trex International', description: 'Global channels and content' },
          { id: '14830', name: 'Trex Basic Package', description: 'Standard channels package' }
        ];
      } else {
        packages = [
          { id: 'basic', name: '8K Basic IPTV Package', description: 'Standard channels and content' },
          { id: 'premium', name: '8K Premium IPTV Package', description: 'Premium channels with HD quality' },
          { id: 'sports', name: '8K Sports Package', description: 'Sports channels and events' },
          { id: 'movies', name: '8K Movies & Entertainment', description: 'Movie channels and on-demand content' },
          { id: 'international', name: '8K International Package', description: 'Global channels and content' }
        ];
      }
    }

    console.log(`📦 Returning ${packages.length} packages for ${effectiveProvider.toUpperCase()}`);
    console.log(`Source: ${successfulEndpoint || 'default'}`);
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        packages: packages,
        message: `Found ${packages.length} available packages for ${effectiveProvider.toUpperCase()}`,
        source: packages.length === 5 && !successfulEndpoint ? 'default' : 'api',
        provider: effectiveProvider,
        endpoint_used: successfulEndpoint || 'none',
        panel_url: PANEL_URL,
        debug_info: {
          total_actions_tried: actions.length,
          last_error: lastError,
          auth_format: 'api_key',
          provider_used: effectiveProvider
        }
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      },
    )
  } catch (error) {
    console.error('❌ Unexpected error in get-iptv-packages function:', error)
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message,
        stack: error.stack
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      },
    )
  }
})

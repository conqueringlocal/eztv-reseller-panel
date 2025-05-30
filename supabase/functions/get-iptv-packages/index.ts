
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

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
    // Get configuration from environment
    const API_KEY = Deno.env.get('IPTV_API_KEY')
    const PANEL_URL = Deno.env.get('IPTV_PANEL_URL')
    
    if (!API_KEY) {
      console.error('IPTV API key not configured')
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'IPTV API key not configured'
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500,
        },
      )
    }

    if (!PANEL_URL) {
      console.error('IPTV Panel URL not configured')
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'IPTV Panel URL not configured. Please set IPTV_PANEL_URL in your project secrets.'
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500,
        },
      )
    }

    console.log('Fetching available IPTV packages from panel:', PANEL_URL)

    // Parse API credentials - support multiple formats
    let username, password;
    if (API_KEY.includes(':')) {
      [username, password] = API_KEY.split(':');
    } else {
      // Single token format - try as both username and password
      username = API_KEY;
      password = API_KEY;
    }

    console.log('Using credentials format:', API_KEY.includes(':') ? 'username:password' : 'single_token')

    // Normalize panel URL
    const baseUrl = PANEL_URL.endsWith('/') ? PANEL_URL.slice(0, -1) : PANEL_URL;
    
    // Comprehensive list of API endpoints to try
    const endpoints = [
      // XUI/Xtream Codes standard endpoints
      {
        url: `${baseUrl}/player_api.php`,
        params: { action: "get_live_categories" },
        description: "Live categories endpoint"
      },
      {
        url: `${baseUrl}/player_api.php`,
        params: { action: "get_vod_categories" },
        description: "VOD categories endpoint"
      },
      {
        url: `${baseUrl}/player_api.php`,
        params: { action: "get_series_categories" },
        description: "Series categories endpoint"
      },
      // Package/Bouquet specific endpoints
      {
        url: `${baseUrl}/player_api.php`,
        params: { action: "get_bouquets" },
        description: "Bouquets endpoint"
      },
      {
        url: `${baseUrl}/panel_api.php`,
        params: { action: "get_bouquets" },
        description: "Panel bouquets endpoint"
      },
      // Generic API endpoints
      {
        url: `${baseUrl}/api/api.php`,
        params: { action: "bouquets" },
        description: "API bouquets endpoint"
      },
      {
        url: `${baseUrl}/api/api.php`,
        params: { action: "packages" },
        description: "API packages endpoint"
      },
      {
        url: `${baseUrl}/api/api.php`,
        params: { action: "categories" },
        description: "API categories endpoint"
      },
      // Admin panel endpoints
      {
        url: `${baseUrl}/admin_api.php`,
        params: { action: "get_bouquets" },
        description: "Admin bouquets endpoint"
      },
      {
        url: `${baseUrl}/admin_api.php`,
        params: { action: "get_packages" },
        description: "Admin packages endpoint"
      },
      // Alternative authentication methods
      {
        url: `${baseUrl}/get.php`,
        params: { type: "bouquets" },
        description: "Alternative get endpoint"
      }
    ];

    let packages: PackageInfo[] = [];
    let lastError = '';
    let successfulEndpoint = '';

    // Try each endpoint until we find one that works
    for (const endpoint of endpoints) {
      try {
        console.log(`Trying ${endpoint.description}: ${endpoint.url}`);
        
        // Try different authentication parameter combinations
        const authVariations = [
          { username, password }, // Standard format
          { user: username, pass: password }, // Alternative format
          { login: username, password }, // Another alternative
          { auth: API_KEY }, // Single auth token
          { token: API_KEY }, // Token-based auth
          { api_key: API_KEY }, // Direct API key
        ];

        let endpointSuccess = false;

        for (const authParams of authVariations) {
          try {
            const apiUrl = new URL(endpoint.url);
            
            // Add authentication parameters
            Object.entries(authParams).forEach(([key, value]) => {
              if (value) apiUrl.searchParams.append(key, value);
            });
            
            // Add the action/type parameters
            Object.entries(endpoint.params).forEach(([key, value]) => {
              apiUrl.searchParams.append(key, value);
            });
            
            console.log(`  Auth variation: ${Object.keys(authParams).join(', ')}`);
            console.log(`  Full URL: ${apiUrl.toString().replace(API_KEY, '[REDACTED]')}`);
            
            const response = await fetch(apiUrl.toString(), {
              method: 'GET',
              headers: {
                'User-Agent': 'IPTV-Management-System/1.0',
                'Accept': 'application/json, text/plain, */*',
                'Cache-Control': 'no-cache',
              },
              // Add timeout
              signal: AbortSignal.timeout(10000), // 10 second timeout
            });
            
            const responseText = await response.text();
            console.log(`  Response Status: ${response.status}`);
            console.log(`  Response Headers: ${JSON.stringify(Object.fromEntries(response.headers))}`);
            console.log(`  Response preview: ${responseText.substring(0, 300)}...`);

            if (!response.ok) {
              lastError = `HTTP ${response.status}: ${response.statusText}`;
              continue;
            }

            // Check if it's an HTML error page
            if (responseText.includes('<html') || responseText.includes('<!DOCTYPE')) {
              lastError = 'Received HTML error page instead of API response';
              continue;
            }

            // Check for common error responses
            if (responseText.includes('not found') || responseText.includes('404') || 
                responseText.includes('error') || responseText.includes('forbidden')) {
              lastError = `Error response: ${responseText.substring(0, 100)}`;
              continue;
            }

            // Try to parse as JSON
            let data;
            try {
              data = JSON.parse(responseText);
              console.log(`  Parsed JSON data structure:`, Object.keys(data));
            } catch (parseError) {
              // If not JSON, check if it's a valid response format
              if (responseText.trim().startsWith('[') || responseText.trim().startsWith('{')) {
                lastError = `JSON parse error: ${parseError.message}`;
                continue;
              } else {
                lastError = `Non-JSON response received: ${responseText.substring(0, 100)}`;
                continue;
              }
            }

            // Check for API errors in the response
            if (data.error || data.status === 'error' || data.result === 'error') {
              lastError = data.error || data.message || data.result || 'API returned error status';
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
              successfulEndpoint = `${endpoint.description} with ${Object.keys(authParams).join(', ')} auth`;
              endpointSuccess = true;
              console.log(`✅ SUCCESS: Found ${packages.length} packages using ${successfulEndpoint}`);
              break;
            }
            
          } catch (authError) {
            console.log(`  Auth variation failed: ${authError.message}`);
            continue;
          }
        }
        
        if (endpointSuccess) break;
        
      } catch (error) {
        console.error(`Error with ${endpoint.description}:`, error);
        lastError = error.message;
        continue;
      }
    }

    // If no packages found from any endpoint, provide default packages
    if (packages.length === 0) {
      console.log(`❌ No packages found from any API endpoint.`);
      console.log(`Last error: ${lastError}`);
      console.log(`Panel URL used: ${baseUrl}`);
      console.log(`Auth format: ${API_KEY.includes(':') ? 'username:password' : 'single_token'}`);
      console.log('Using default package options');
      
      packages = [
        { 
          id: 'basic', 
          name: 'Basic IPTV Package', 
          description: 'Standard channels and content' 
        },
        { 
          id: 'premium', 
          name: 'Premium IPTV Package', 
          description: 'Premium channels with HD quality' 
        },
        { 
          id: 'sports', 
          name: 'Sports Package', 
          description: 'Sports channels and events' 
        },
        { 
          id: 'movies', 
          name: 'Movies & Entertainment', 
          description: 'Movie channels and on-demand content' 
        },
        { 
          id: 'international', 
          name: 'International Package', 
          description: 'Global channels and content' 
        }
      ];
    }

    console.log(`📦 Returning ${packages.length} packages`);
    console.log(`Source: ${successfulEndpoint || 'default'}`);
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        packages: packages,
        message: `Found ${packages.length} available packages`,
        source: packages.length === 5 && !successfulEndpoint ? 'default' : 'api',
        endpoint_used: successfulEndpoint || 'none',
        panel_url: baseUrl,
        debug_info: {
          total_endpoints_tried: endpoints.length,
          last_error: lastError,
          auth_format: API_KEY.includes(':') ? 'username:password' : 'single_token'
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

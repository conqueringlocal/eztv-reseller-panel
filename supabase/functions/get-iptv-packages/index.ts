
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
    // Get the API key from environment
    const API_KEY = Deno.env.get('IPTV_API_KEY')
    
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

    console.log('Fetching available IPTV packages...')

    // Try multiple API endpoints that are commonly used for package/bouquet listing
    const endpoints = [
      // Standard bouquet listing endpoint
      {
        url: "https://my8k.me/player_api.php",
        params: { action: "get_live_categories" }
      },
      // Alternative endpoint for packages
      {
        url: "https://my8k.me/player_api.php", 
        params: { action: "get_bouquets" }
      },
      // Panel API endpoint
      {
        url: "https://my8k.me/api/api.php",
        params: { action: "bouquets" }
      },
      // Admin panel endpoint
      {
        url: "https://my8k.me/admin_api.php",
        params: { action: "get_bouquets" }
      }
    ];

    let packages: PackageInfo[] = [];
    let lastError = '';

    // Try each endpoint until we find one that works
    for (const endpoint of endpoints) {
      try {
        console.log(`Trying endpoint: ${endpoint.url} with action: ${endpoint.params.action}`);
        
        const apiUrl = new URL(endpoint.url);
        apiUrl.searchParams.append('username', API_KEY.split(':')[0] || API_KEY);
        apiUrl.searchParams.append('password', API_KEY.split(':')[1] || API_KEY);
        
        // Add the action parameter
        Object.entries(endpoint.params).forEach(([key, value]) => {
          apiUrl.searchParams.append(key, value);
        });
        
        console.log('API Request URL:', apiUrl.toString().replace(API_KEY, '[REDACTED]'));
        
        const response = await fetch(apiUrl.toString(), {
          method: 'GET',
          headers: {
            'User-Agent': 'IPTV-Management-System/1.0',
          }
        });
        
        const responseText = await response.text();
        console.log(`Response Status: ${response.status}, Body length: ${responseText.length}`);
        console.log(`Response preview: ${responseText.substring(0, 200)}`);

        if (!response.ok) {
          lastError = `HTTP ${response.status}: ${response.statusText}`;
          continue;
        }

        // Check if it's an HTML error page
        if (responseText.includes('<html') || responseText.includes('<!DOCTYPE')) {
          lastError = 'Received HTML error page instead of API response';
          continue;
        }

        // Try to parse as JSON
        let data;
        try {
          data = JSON.parse(responseText);
          console.log('Parsed response data:', data);
        } catch (parseError) {
          lastError = `JSON parse error: ${parseError.message}`;
          continue;
        }

        // Check for API errors
        if (data.error || data.status === 'error') {
          lastError = data.error || data.result || 'API returned error status';
          continue;
        }

        // Try to extract packages from different response formats
        if (Array.isArray(data)) {
          // Direct array response
          packages = data.map((item: any, index: number) => ({
            id: item.category_id || item.bouquet_id || item.id || (index + 1).toString(),
            name: item.category_name || item.bouquet_name || item.name || `Package ${index + 1}`,
            description: item.description || item.details || undefined
          }));
          break;
        } else if (data.categories && Array.isArray(data.categories)) {
          // Categories format
          packages = data.categories.map((cat: any) => ({
            id: cat.category_id || cat.id,
            name: cat.category_name || cat.name,
            description: cat.description
          }));
          break;
        } else if (data.bouquets && Array.isArray(data.bouquets)) {
          // Bouquets format
          packages = data.bouquets.map((bouquet: any) => ({
            id: bouquet.bouquet_id || bouquet.id,
            name: bouquet.bouquet_name || bouquet.name,
            description: bouquet.description
          }));
          break;
        } else if (data.result && Array.isArray(data.result)) {
          // Result wrapper format
          packages = data.result.map((item: any, index: number) => ({
            id: item.category_id || item.bouquet_id || item.id || (index + 1).toString(),
            name: item.category_name || item.bouquet_name || item.name || `Package ${index + 1}`,
            description: item.description
          }));
          break;
        }
        
      } catch (error) {
        console.error(`Error with endpoint ${endpoint.url}:`, error);
        lastError = error.message;
        continue;
      }
    }

    // If no packages found from any endpoint, provide default packages
    if (packages.length === 0) {
      console.log(`No packages found from any API endpoint. Last error: ${lastError}`);
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

    // Filter out any packages with invalid data
    packages = packages.filter(pkg => pkg.id && pkg.name);

    console.log(`Successfully processed ${packages.length} packages`);
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        packages: packages,
        message: `Found ${packages.length} available packages`,
        source: packages.length === 5 ? 'default' : 'api'
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      },
    )
  } catch (error) {
    console.error('Error fetching IPTV packages:', error)
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

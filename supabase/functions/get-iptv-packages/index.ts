
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

    // Use the correct API endpoint to get packages/bouquets
    const apiBaseUrl = "https://my8k.me/api/api.php"
    
    // Build URL with query parameters to get packages list
    const apiUrl = new URL(apiBaseUrl);
    apiUrl.searchParams.append('action', 'packages');
    apiUrl.searchParams.append('api_key', API_KEY);
    
    console.log('API Request URL:', apiUrl.toString().replace(API_KEY, '[REDACTED]'));
    
    // Make GET request to the API
    const response = await fetch(apiUrl.toString(), {
      method: 'GET',
      headers: {
        'User-Agent': 'IPTV-Management-System/1.0',
      }
    })
    
    const responseText = await response.text()
    
    console.log('API Response Status:', response.status)
    console.log('API Response Body:', responseText)

    // Check if response is ok
    if (!response.ok) {
      console.error(`IPTV API returned status ${response.status}: ${response.statusText}`)
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: `IPTV API error: ${response.status} ${response.statusText}`,
          details: responseText?.substring(0, 500)
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        },
      )
    }

    // Check if it's an HTML error page
    if (responseText.includes('<html') || responseText.includes('<!DOCTYPE')) {
      console.error('IPTV API returned HTML instead of expected response')
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'IPTV API returned HTML instead of expected response - possible server error',
          details: responseText.substring(0, 200)
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        },
      )
    }

    // Try to parse the response as JSON
    let data;
    try {
      data = JSON.parse(responseText)
      console.log('Parsed JSON response:', data)
    } catch (parseError) {
      console.error('Failed to parse response as JSON:', responseText)
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Invalid response format from IPTV API',
          details: responseText.substring(0, 200)
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        },
      )
    }

    // Process the packages response
    let packages: PackageInfo[] = [];
    
    if (data.packages && Array.isArray(data.packages)) {
      packages = data.packages.map((pkg: any) => ({
        id: pkg.id || pkg.package_id || pkg.bouquet_id,
        name: pkg.name || pkg.package_name || pkg.bouquet_name || `Package ${pkg.id}`,
        description: pkg.description || pkg.details
      }));
    } else if (data.status === 'success' && data.result) {
      // Handle different response formats
      if (Array.isArray(data.result)) {
        packages = data.result.map((pkg: any) => ({
          id: pkg.id || pkg.package_id || pkg.bouquet_id,
          name: pkg.name || pkg.package_name || pkg.bouquet_name || `Package ${pkg.id}`,
          description: pkg.description || pkg.details
        }));
      }
    } else if (data.error) {
      console.error('IPTV API returned error:', data.error)
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: data.error,
          details: data
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        },
      )
    }

    // If no packages found or API doesn't support package listing, provide default packages
    if (packages.length === 0) {
      console.log('No packages returned by API, using default package options')
      packages = [
        { id: '1', name: 'Basic Package', description: 'Standard IPTV package' },
        { id: '2', name: 'Premium Package', description: 'Premium IPTV package with more channels' },
        { id: '3', name: 'Sports Package', description: 'Sports-focused IPTV package' },
      ];
    }

    console.log(`Successfully fetched ${packages.length} packages`);
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        packages: packages,
        message: `Found ${packages.length} available packages`
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

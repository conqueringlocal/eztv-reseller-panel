
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface IPTVUserParams {
  username: string;
  password: string;
  maxConnections: number;
  expiryDate: string; // ISO string
  isTrial: boolean;
  bouquet?: string;
  output?: string;
  ip?: string;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { userParams }: { userParams: IPTVUserParams } = await req.json()

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

    // Convert ISO date string to days from now (approximate)
    const expiryDate = new Date(userParams.expiryDate);
    const today = new Date();
    const diffTime = expiryDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    const sub = Math.max(1, diffDays); // Ensure at least 1 day

    console.log(`Creating IPTV user: ${userParams.username}`)
    console.log(`Subscription days: ${sub}`)

    // Use the correct API endpoint
    const apiBaseUrl = "https://my8k.me/api/api.php"
    
    // Build URL with query parameters - using correct parameter names
    const apiUrl = new URL(apiBaseUrl);
    apiUrl.searchParams.append('action', 'new');
    apiUrl.searchParams.append('type', 'm3u');
    apiUrl.searchParams.append('sub', sub.toString());
    apiUrl.searchParams.append('pack', userParams.bouquet || '1'); // Use package 1 as default
    apiUrl.searchParams.append('country', 'us'); // Default country
    apiUrl.searchParams.append('notes', `User: ${userParams.username}`);
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
      // If it's not JSON, treat the response as plain text (might be the M3U URL or credentials)
      console.log('Response is not JSON, treating as text:', responseText)
      
      // Check if response contains what looks like credentials or success indicator
      if (responseText.includes('http') || responseText.length > 10) {
        // Assume success and create a response structure
        data = {
          success: true,
          response: responseText,
          message: 'Account created successfully'
        }
      } else {
        console.error('Failed to parse response and no recognizable success pattern:', responseText)
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
    }

    console.log('Processed API Response:', data);

    // Check for success indicators in the response
    const isSuccess = data.success === true || 
                     data.status === 'success' || 
                     data.message?.includes('success') || 
                     (typeof data.response === 'string' && data.response.length > 0);

    if (!isSuccess && data.error) {
      const errorMsg = data.error || data.message || 'Unknown error from IPTV API'
      console.error('IPTV API returned error:', errorMsg)
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: errorMsg,
          details: data
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        },
      )
    }

    // Extract or generate credentials and M3U URL
    let extractedUsername = userParams.username;
    let extractedPassword = userParams.password;
    let m3uUrl = '';
    
    // Check if response contains an M3U URL
    if (data.response && typeof data.response === 'string' && data.response.includes('http')) {
      m3uUrl = data.response;
    } else if (data.m3u_url) {
      m3uUrl = data.m3u_url;
    } else if (data.url) {
      m3uUrl = data.url;
    }
    
    // If no direct M3U URL, try to extract credentials from response
    if (!m3uUrl) {
      if (data.username && data.password) {
        extractedUsername = data.username;
        extractedPassword = data.password;
      }
      
      // Generate M3U URL based on standard format
      m3uUrl = `http://my8k.me:8080/get.php?username=${extractedUsername}&password=${extractedPassword}&type=m3u_plus&output=ts`;
    }

    console.log(`Successfully created IPTV user: ${extractedUsername}`);
    console.log(`Generated M3U URL: ${m3uUrl}`);
    
    const createdUser = {
      username: extractedUsername,
      password: extractedPassword,
      expiryDate: userParams.expiryDate,
      connections: userParams.maxConnections,
      accountType: 'M3U',
      m3uUrl: m3uUrl,
      userId: data.user_id || data.id || null,
      apiResponse: data
    }
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        data: data,
        user: createdUser,
        message: `IPTV M3U account created successfully for ${extractedUsername}`,
        m3uUrl: m3uUrl
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      },
    )
  } catch (error) {
    console.error('Error creating IPTV user:', error)
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

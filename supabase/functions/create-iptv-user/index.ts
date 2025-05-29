
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

    // Convert ISO date string to Unix timestamp
    const expiryTimestamp = Math.floor(new Date(userParams.expiryDate).getTime() / 1000)

    console.log(`Creating IPTV user: ${userParams.username}`)
    console.log(`Expiry timestamp: ${expiryTimestamp}`)

    // Use the correct endpoint with API key authentication
    const apiBaseUrl = "https://my8k.me/api/api.php"
    
    // Prepare the API request parameters as URL search params (GET request)
    const apiUrl = new URL(apiBaseUrl)
    apiUrl.searchParams.append('key', API_KEY)
    apiUrl.searchParams.append('action', 'user_create')
    apiUrl.searchParams.append('username', userParams.username)
    apiUrl.searchParams.append('password', userParams.password)
    apiUrl.searchParams.append('expire_date', expiryTimestamp.toString())
    apiUrl.searchParams.append('max_connections', userParams.maxConnections.toString())
    apiUrl.searchParams.append('is_trial', userParams.isTrial ? '1' : '0')
    apiUrl.searchParams.append('package_id', userParams.bouquet || '1') // Package ID - default to package 1
    apiUrl.searchParams.append('output_format', userParams.output || 'ts')
    apiUrl.searchParams.append('allowed_ips', userParams.ip || '*')
    
    console.log('API Request URL:', apiUrl.toString().replace(API_KEY, '[REDACTED]'))
    
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

    // Parse the JSON response
    let data;
    try {
      data = JSON.parse(responseText)
      console.log('Parsed JSON response:', data)
    } catch (parseError) {
      console.error('Failed to parse JSON response:', parseError)
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Invalid JSON response from IPTV API',
          details: responseText.substring(0, 200)
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        },
      )
    }

    // Handle array response format based on documentation
    const responseData = Array.isArray(data) ? data[0] : data;
    
    console.log('Processed API Response:', responseData);

    // Check for errors in response - status should be "success"
    if (!responseData || responseData.status !== 'success') {
      const errorMsg = responseData?.message || 'Unknown error from IPTV API'
      console.error('IPTV API returned error:', errorMsg)
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: errorMsg,
          details: responseData
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        },
      )
    }

    // Extract username and password from the URL based on the expected response format
    let extractedUsername = userParams.username;
    let extractedPassword = userParams.password;
    
    if (responseData.url) {
      try {
        const urlObj = new URL(responseData.url);
        const urlUsername = urlObj.searchParams.get('username');
        const urlPassword = urlObj.searchParams.get('password');
        
        if (urlUsername) extractedUsername = urlUsername;
        if (urlPassword) extractedPassword = urlPassword;
        
        console.log(`Extracted credentials from URL: ${extractedUsername} / ${extractedPassword}`);
      } catch (urlError) {
        console.warn('Failed to parse URL for credentials:', urlError);
        // Continue with original credentials if URL parsing fails
      }
    }

    console.log(`Successfully created IPTV user: ${extractedUsername}`);
    
    const createdUser = {
      username: extractedUsername,
      password: extractedPassword,
      expiryDate: userParams.expiryDate,
      connections: userParams.maxConnections,
      accountType: 'M3U',
      m3uUrl: responseData.url,
      userId: responseData.user_id,
      country: responseData.country,
      notes: responseData.notes,
      apiResponse: responseData
    }
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        data: responseData,
        user: createdUser,
        message: `IPTV M3U account created successfully for ${extractedUsername}`,
        m3uUrl: responseData.url
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

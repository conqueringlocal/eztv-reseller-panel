
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

    // Use the correct endpoint from the documentation
    const apiBaseUrl = "https://my8k.me/player_api.php"
    
    // Prepare the API request data using the format from documentation
    const requestData = {
      key: API_KEY,
      action: 'user_create',
      user_username: userParams.username,
      user_password: userParams.password,
      user_expire: expiryTimestamp.toString(),
      user_max_connections: userParams.maxConnections.toString(),
      user_is_trial: userParams.isTrial ? '1' : '0',
      user_bouquet: userParams.bouquet || '1',
      user_output: userParams.output || 'ts',
      user_ip: userParams.ip || '*'
    }
    
    console.log('API Request data:', { 
      ...requestData, 
      key: '[REDACTED]' 
    })
    
    // Make POST request to the API with form data
    const formData = new FormData()
    Object.entries(requestData).forEach(([key, value]) => {
      formData.append(key, value)
    })
    
    const response = await fetch(apiBaseUrl, {
      method: 'POST',
      headers: {
        'User-Agent': 'IPTV-Management-System/1.0',
      },
      body: formData
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

    // Handle response format based on documentation - check for "true" status
    const responseData = Array.isArray(data) ? data[0] : data;
    
    console.log('Processed API Response:', responseData);

    // Check for errors in response - status should be "true" for success
    if (!responseData || responseData.status !== 'true') {
      const errorMsg = responseData?.message || responseData?.error || 'Unknown error from IPTV API'
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

    // Extract username and password - they should be in the response
    let extractedUsername = userParams.username;
    let extractedPassword = userParams.password;
    let m3uUrl = '';
    
    // Based on the documentation, the response should contain the user details
    if (responseData.user_info) {
      extractedUsername = responseData.user_info.username || extractedUsername;
      extractedPassword = responseData.user_info.password || extractedPassword;
    }
    
    // Generate M3U URL based on the API documentation format
    if (responseData.server_info && responseData.user_info) {
      const serverUrl = responseData.server_info.url || 'http://my8k.me:8080';
      const username = responseData.user_info.username || extractedUsername;
      const password = responseData.user_info.password || extractedPassword;
      m3uUrl = `${serverUrl}/get.php?username=${username}&password=${password}&type=m3u_plus&output=ts`;
    } else {
      // Fallback M3U URL format
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
      userId: responseData.user_info?.user_id || null,
      country: responseData.user_info?.exp_date || null,
      notes: responseData.user_info?.active_cons || null,
      apiResponse: responseData
    }
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        data: responseData,
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

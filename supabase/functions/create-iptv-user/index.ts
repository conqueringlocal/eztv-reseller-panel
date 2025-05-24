
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

    // Convert ISO date string to Unix timestamp
    const expiryTimestamp = Math.floor(new Date(userParams.expiryDate).getTime() / 1000)

    console.log(`Attempting to create IPTV user: ${userParams.username}`)
    console.log(`Expiry timestamp: ${expiryTimestamp}`)

    // Try multiple API approaches
    let response, responseText, data;
    let apiMethod = 'unknown';

    // Method 1: Try with API key if available
    const IPTV_API_KEY = Deno.env.get('IPTV_API_KEY')
    
    if (IPTV_API_KEY) {
      console.log('Attempting API key method...')
      apiMethod = 'api_key';
      
      const url = new URL("https://my8k.me/player_api.php")
      url.searchParams.append("key", IPTV_API_KEY)
      url.searchParams.append("action", "user_create")
      url.searchParams.append("user_username", userParams.username)
      url.searchParams.append("user_password", userParams.password)
      url.searchParams.append("user_max_connections", userParams.maxConnections.toString())
      url.searchParams.append("user_expire", expiryTimestamp.toString())
      url.searchParams.append("user_is_trial", userParams.isTrial ? "1" : "0")
      url.searchParams.append("user_bouquet", userParams.bouquet || "1")
      url.searchParams.append("user_output", userParams.output || "ts")
      url.searchParams.append("user_ip", userParams.ip || "*")

      console.log(`API URL (key method):`, url.toString().replace(IPTV_API_KEY, '[REDACTED]'))
      
      response = await fetch(url.toString())
      responseText = await response.text()
      
      console.log('API Key method response status:', response.status)
      console.log('API Key method response body:', responseText.substring(0, 500))
    }

    // If API key method failed or not available, try reseller credentials method
    if (!response || !response.ok || responseText?.includes('<html')) {
      console.log('API key method failed or unavailable, trying reseller credentials...')
      apiMethod = 'reseller_credentials';
      
      // For demo purposes, using hardcoded test credentials
      // In production, these should come from reseller settings
      const RESELLER_USERNAME = Deno.env.get('IPTV_RESELLER_USERNAME') || 'your_reseller_username'
      const RESELLER_PASSWORD = Deno.env.get('IPTV_RESELLER_PASSWORD') || 'your_reseller_password'
      
      const url = new URL("https://my8k.me/player_api.php")
      url.searchParams.append("username", RESELLER_USERNAME)
      url.searchParams.append("password", RESELLER_PASSWORD)
      url.searchParams.append("action", "user_create")
      url.searchParams.append("user_username", userParams.username)
      url.searchParams.append("user_password", userParams.password)
      url.searchParams.append("user_max_connections", userParams.maxConnections.toString())
      url.searchParams.append("user_expire", expiryTimestamp.toString())
      url.searchParams.append("user_is_trial", userParams.isTrial ? "1" : "0")
      url.searchParams.append("user_bouquet", userParams.bouquet || "1")
      url.searchParams.append("user_output", userParams.output || "ts")
      url.searchParams.append("user_ip", userParams.ip || "*")

      console.log(`API URL (reseller method):`, url.toString().replace(RESELLER_PASSWORD, '[REDACTED]'))
      
      response = await fetch(url.toString())
      responseText = await response.text()
      
      console.log('Reseller method response status:', response.status)
      console.log('Reseller method response body:', responseText.substring(0, 500))
    }

    // Check if response is ok
    if (!response.ok) {
      console.error(`IPTV API returned status ${response.status}: ${response.statusText}`)
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: `IPTV API error: ${response.status} ${response.statusText}`,
          details: responseText?.substring(0, 500),
          method: apiMethod
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        },
      )
    }

    // Check if it's an HTML error page
    if (responseText.includes('<html') || responseText.includes('<!DOCTYPE')) {
      console.error('IPTV API returned HTML instead of JSON')
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'IPTV API returned HTML instead of JSON - possible server error or invalid endpoint',
          details: 'Check if the API endpoint and credentials are correct',
          method: apiMethod,
          responsePreview: responseText.substring(0, 200)
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        },
      )
    }

    // Try to parse as JSON
    try {
      data = JSON.parse(responseText)
    } catch (parseError) {
      console.error('Failed to parse IPTV API response as JSON:', parseError)
      
      // If it's not JSON but looks like a success response, try to extract info
      if (responseText.includes('success') || responseText.includes('created')) {
        console.log('Response appears to be successful but not JSON, treating as success')
        data = { 
          success: true, 
          user_info: {
            username: userParams.username,
            password: userParams.password
          }
        }
      } else {
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: 'Invalid response from IPTV API - not valid JSON',
            details: responseText.substring(0, 200),
            method: apiMethod
          }),
          { 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400,
          },
        )
      }
    }

    console.log('Parsed IPTV API Response:', data)

    // Check for various error formats from the IPTV API
    if (data.error || data.message?.includes('error') || data.status === 'error') {
      const errorMsg = data.error || data.message || 'Unknown error from IPTV API'
      console.error('IPTV API returned error:', errorMsg)
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: errorMsg,
          details: data,
          method: apiMethod
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        },
      )
    }

    // Check if the user was created successfully
    // Different IPTV panels return different success indicators
    const isSuccess = data.user_info || 
                     data.success || 
                     data.result === 'success' ||
                     (data.status && data.status === 'success') || 
                     (!data.error && typeof data === 'object' && Object.keys(data).length > 0)

    if (isSuccess) {
      console.log(`Successfully created IPTV user: ${userParams.username}`)
      
      // Extract user credentials from the response
      const userInfo = data.user_info || data.result || data
      
      // Try to get the actual username/password from the response
      let actualUsername = userInfo?.username || 
                          userInfo?.user_username || 
                          userParams.username
      
      let actualPassword = userInfo?.password || 
                          userInfo?.user_password || 
                          userParams.password
      
      const createdUser = {
        username: actualUsername,
        password: actualPassword,
        expiryDate: userParams.expiryDate,
        connections: userParams.maxConnections,
        userInfo: userInfo
      }
      
      return new Response(
        JSON.stringify({ 
          success: true, 
          data: data,
          user: createdUser,
          method: apiMethod
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        },
      )
    } else {
      console.error('Failed to create IPTV user - unexpected response format:', data)
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Unexpected response format from IPTV API',
          details: data,
          method: apiMethod
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        },
      )
    }
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

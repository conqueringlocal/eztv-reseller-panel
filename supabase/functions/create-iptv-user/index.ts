
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

    // Get the reseller credentials from environment
    const RESELLER_USERNAME = Deno.env.get('RESELLER_USERNAME')
    const RESELLER_PASSWORD = Deno.env.get('RESELLER_PASSWORD')
    
    if (!RESELLER_USERNAME || !RESELLER_PASSWORD) {
      console.error('Reseller credentials not configured')
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Reseller credentials not configured'
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

    // Use the correct endpoint for user creation as shown in the working panel
    const apiBaseUrl = "https://my8k.me/player_api.php"
    
    // Prepare the API request parameters as URL search params (GET request)
    const apiUrl = new URL(apiBaseUrl)
    apiUrl.searchParams.append('username', RESELLER_USERNAME)
    apiUrl.searchParams.append('password', RESELLER_PASSWORD)
    apiUrl.searchParams.append('action', 'user_create')
    apiUrl.searchParams.append('user_username', userParams.username)
    apiUrl.searchParams.append('user_password', userParams.password)
    apiUrl.searchParams.append('user_expire', expiryTimestamp.toString())
    apiUrl.searchParams.append('user_max_connections', userParams.maxConnections.toString())
    apiUrl.searchParams.append('user_is_trial', userParams.isTrial ? '1' : '0')
    apiUrl.searchParams.append('user_bouquet', userParams.bouquet || '1') // Package ID - default to package 1
    apiUrl.searchParams.append('user_output', userParams.output || 'ts')
    apiUrl.searchParams.append('user_ip', userParams.ip || '*')
    
    console.log('API Request URL:', apiUrl.toString().replace(RESELLER_PASSWORD, '[REDACTED]'))
    
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

    // Try to parse as JSON first, but handle plain text responses
    let data;
    try {
      data = JSON.parse(responseText)
      console.log('Parsed JSON response:', data)
    } catch (parseError) {
      console.log('Response is not JSON, treating as plain text:', responseText)
      
      // For IPTV API, check for success indicators in plain text response
      const lowerResponse = responseText.toLowerCase()
      if (lowerResponse.includes('success') || 
          lowerResponse.includes('user created') || 
          lowerResponse.includes('created') ||
          lowerResponse.includes('ok') ||
          lowerResponse === 'true' ||
          responseText.trim() === '1') {
        console.log('Plain text response appears to be successful')
        data = { 
          success: true, 
          message: responseText.trim(),
          user_info: {
            username: userParams.username,
            password: userParams.password
          }
        }
      } else if (lowerResponse.includes('error') || 
                 lowerResponse.includes('fail') ||
                 lowerResponse.includes('invalid') ||
                 lowerResponse.includes('missing') ||
                 responseText.trim() === '0') {
        console.error('Plain text response indicates error:', responseText)
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: 'IPTV API returned error',
            details: responseText.trim()
          }),
          { 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400,
          },
        )
      } else {
        // Unknown response format - treat as success if we got a response
        console.log('Unknown response format, treating as success based on HTTP status')
        data = { 
          success: true, 
          message: responseText.trim(),
          user_info: {
            username: userParams.username,
            password: userParams.password
          }
        }
      }
    }

    console.log('Processed API Response:', data)

    // Check for errors in JSON response
    if (data && (data.error || data.status === 'error' || data.success === false)) {
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

    // Determine if the operation was successful
    const isSuccess = data?.success || 
                     data?.status === 'success' || 
                     data?.message?.toLowerCase().includes('success') ||
                     data?.message?.toLowerCase().includes('created') ||
                     (!data?.error && responseText.length > 0)

    if (isSuccess) {
      console.log(`Successfully created IPTV user: ${userParams.username}`)
      
      // Extract user credentials from the response
      const userInfo = data?.user_info || data?.result || {}
      
      // Get the actual username/password from the API response, fallback to original
      const actualUsername = userInfo?.username || 
                            userInfo?.user_username || 
                            userParams.username
      
      const actualPassword = userInfo?.password || 
                            userInfo?.user_password || 
                            userParams.password
      
      const createdUser = {
        username: actualUsername,
        password: actualPassword,
        expiryDate: userParams.expiryDate,
        connections: userParams.maxConnections,
        accountType: 'M3U',
        userInfo: userInfo,
        apiResponse: data
      }
      
      return new Response(
        JSON.stringify({ 
          success: true, 
          data: data,
          user: createdUser,
          message: `IPTV account created successfully for ${actualUsername}`
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        },
      )
    } else {
      console.error('Failed to create IPTV user - unexpected response:', data)
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Unexpected response from IPTV API',
          details: data || responseText
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

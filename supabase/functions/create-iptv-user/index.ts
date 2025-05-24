
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
    const IPTV_API_KEY = Deno.env.get('IPTV_API_KEY')
    
    if (!IPTV_API_KEY) {
      console.error('IPTV_API_KEY not configured')
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

    // Use the correct endpoint as shown in the reference screenshot
    const apiUrl = "https://my8k.me/api"
    
    // Prepare the API request body as shown in your screenshot
    const requestBody = {
      key: IPTV_API_KEY,
      action: "user_create",
      user_username: userParams.username,
      user_password: userParams.password,
      user_max_connections: userParams.maxConnections,
      user_expire: expiryTimestamp,
      user_is_trial: userParams.isTrial ? 1 : 0,
      user_bouquet: userParams.bouquet || "1",
      user_output: userParams.output || "ts",
      user_ip: userParams.ip || "*"
    }

    console.log('API Request Body:', { ...requestBody, key: '[REDACTED]' })
    
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody)
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
      console.error('IPTV API returned HTML instead of JSON')
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'IPTV API returned HTML instead of JSON - possible server error or invalid endpoint',
          details: responseText.substring(0, 200)
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        },
      )
    }

    // Try to parse as JSON
    let data;
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
            details: responseText.substring(0, 200)
          }),
          { 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400,
          },
        )
      }
    }

    console.log('Parsed IPTV API Response:', data)

    // Check for errors in the API response
    if (data.error || data.message?.includes('error') || data.status === 'error') {
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

    // Check if the user was created successfully
    const isSuccess = data.user_info || 
                     data.success || 
                     data.result === 'success' ||
                     (data.status && data.status === 'success') || 
                     (!data.error && typeof data === 'object' && Object.keys(data).length > 0)

    if (isSuccess) {
      console.log(`Successfully created IPTV user: ${userParams.username}`)
      
      // Extract user credentials from the response
      const userInfo = data.user_info || data.result || data
      
      // Get the actual username/password from the API response
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
        userInfo: userInfo
      }
      
      return new Response(
        JSON.stringify({ 
          success: true, 
          data: data,
          user: createdUser
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
          details: data
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


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
    // Get the API key from Supabase secrets
    const IPTV_API_KEY = Deno.env.get('IPTV_API_KEY')
    if (!IPTV_API_KEY) {
      console.error('IPTV_API_KEY not configured in Supabase secrets')
      return new Response(
        JSON.stringify({ success: false, error: 'IPTV API key not configured' }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500,
        },
      )
    }

    const { userParams }: { userParams: IPTVUserParams } = await req.json()

    // Convert ISO date string to Unix timestamp
    const expiryTimestamp = Math.floor(new Date(userParams.expiryDate).getTime() / 1000)

    // Construct the URL with parameters for creating a user using API key
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

    console.log(`Making IPTV API call to create user: ${userParams.username}`)
    console.log(`API URL (key redacted):`, url.toString().replace(IPTV_API_KEY, '[REDACTED]'))

    const response = await fetch(url.toString())
    
    // Get response text first to handle both JSON and HTML responses
    const responseText = await response.text()
    console.log('Raw IPTV API Response Status:', response.status)
    console.log('Raw IPTV API Response Headers:', Object.fromEntries(response.headers.entries()))
    console.log('Raw IPTV API Response Body:', responseText)

    // Check if response is ok first
    if (!response.ok) {
      console.error(`IPTV API returned status ${response.status}: ${response.statusText}`)
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: `IPTV API error: ${response.status} ${response.statusText}`,
          details: responseText.substring(0, 500)
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        },
      )
    }

    // Try to parse as JSON, but handle other formats gracefully
    let data
    try {
      data = JSON.parse(responseText)
    } catch (parseError) {
      console.error('Failed to parse IPTV API response as JSON:', parseError)
      console.error('Response was:', responseText.substring(0, 500))
      
      // Check if it's an HTML error page
      if (responseText.includes('<html') || responseText.includes('<!DOCTYPE')) {
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: 'IPTV API returned HTML instead of JSON - possible server error or invalid endpoint',
            details: 'Check if the API endpoint and credentials are correct'
          }),
          { 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400,
          },
        )
      }
      
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

    console.log('Parsed IPTV API Response:', data)

    // Check for various success/error formats from the IPTV API
    if (data.error) {
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

    // Check if the user was created successfully
    // Different IPTV panels return different success indicators
    const isSuccess = data.user_info || data.success || (data.status && data.status === 'success') || 
                     (!data.error && typeof data === 'object')

    if (isSuccess) {
      console.log(`Successfully created IPTV user: ${userParams.username}`)
      
      // Extract user credentials from the response
      const userInfo = data.user_info || data
      const createdUser = {
        username: userParams.username,
        password: userParams.password,
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

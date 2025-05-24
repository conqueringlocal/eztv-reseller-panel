
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
      throw new Error('IPTV_API_KEY not configured')
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

    const response = await fetch(url.toString())
    const data = await response.json()

    console.log('IPTV API Response:', data)

    // Check if the user was created successfully
    if (response.ok && data && !data.error) {
      console.log(`Successfully created IPTV user: ${userParams.username}`)
      return new Response(
        JSON.stringify({ success: true, data }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        },
      )
    } else {
      console.error('Failed to create IPTV user:', data)
      return new Response(
        JSON.stringify({ success: false, error: data }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        },
      )
    }
  } catch (error) {
    console.error('Error creating IPTV user:', error)
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      },
    )
  }
})

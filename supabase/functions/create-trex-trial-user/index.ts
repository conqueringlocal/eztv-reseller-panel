
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    console.log("🎯 Create Trex trial user function called")
    
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { customerData, resellerId } = await req.json()
    const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '') || '';
    const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    if (!token || token !== service) {
      const { data: { user }, error } = await supabase.auth.getUser(token);
      if(error || !user) return new Response(JSON.stringify({error:'Sign in required'}),{status:401,headers:corsHeaders});
      const {data:admin,error:roleError}=await supabase.rpc('has_role',{_user_id:user.id,_role:'admin'});
      if(roleError || (!admin && user.id!==resellerId)) return new Response(JSON.stringify({error:'Not authorized'}),{status:403,headers:corsHeaders});
    }

    
    console.log("📦 Trex trial creation request:")

    // Validate required fields
    if (!customerData || !resellerId) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Missing required fields: customerData and resellerId' 
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400 
        }
      )
    }

    // Get reseller data to verify provider
    const { data: resellerData, error: resellerError } = await supabase
      .from('profiles')
      .select('name, provider')
      .eq('id', resellerId)
      .single()

    if (resellerError || !resellerData) {
      console.error("❌ Error getting reseller data:")
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Reseller not found' 
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400 
        }
      )
    }

    // Verify that the reseller has Trex provider
    if (resellerData.provider !== 'trex') {
      console.log("Operation event")
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'This reseller is not authorized to create Trex trial accounts' 
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 403 
        }
      )
    }

    // Check daily trial limit for Trex provider
    const today = new Date().toISOString().split('T')[0];
    
    // Get the daily trial limit from system settings
    const { data: trialLimitData, error: trialLimitError } = await supabase
      .from('system_settings')
      .select('value')
      .eq('id', 'trex_trial_daily_limit')
      .single()

    const dailyLimit = trialLimitData ? parseInt(trialLimitData.value) : 10; // Default to 10
    console.log("Operation event")

    // Get current trial count for today
    const { data: currentLimitData, error: currentLimitError } = await supabase
      .from('daily_trial_limits')
      .select('trial_count')
      .eq('provider', 'trex')
      .eq('date', today)
      .single()

    const currentTrialCount = currentLimitData ? currentLimitData.trial_count : 0;
    console.log("Operation event")

    // Check if limit is exceeded
    if (currentTrialCount >= dailyLimit) {
      console.log("Operation event")
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: `Daily trial limit exceeded for Trex provider (${currentTrialCount}/${dailyLimit})` 
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 429 
        }
      )
    }

    // Generate unique username and password for trial
    const timestamp = Date.now();
    const randomNum = Math.floor(Math.random() * 1000);
    const username = `trial_${customerData.name.toLowerCase().replace(/\s+/g, '')}_${timestamp}_${randomNum}`.substring(0, 32);
    const password = `trial_${timestamp}_${randomNum}`;

    console.log("Operation event");

    // Calculate trial dates (24 hours from now)
    const startDate = today
    const expiryDate = new Date()
    expiryDate.setHours(expiryDate.getHours() + 24) // 24 hours trial
    const expirationDate = expiryDate.toISOString().split('T')[0]

    console.log("Operation event")

    // Get default package ID from system settings
    let packageId = '14826' // Default fallback
    try {
      const { data: settingsData, error: settingsError } = await supabase
        .from('system_settings')
        .select('value')
        .eq('id', 'trex_default_package_id')
        .single()

      if (!settingsError && settingsData) {
        packageId = settingsData.value
        console.log("Operation event")
      } else {
        console.log("Operation event")
      }
    } catch (error) {
      console.log("⚠️ Failed to get Trex package ID from settings, using fallback:")
    }

    // Get API configuration
    const API_KEY = Deno.env.get('TREX_API_KEY')
    const PANEL_URL = Deno.env.get('TREX_PANEL_URL') || 'https://activationpanel.net'
    
    if (!API_KEY) {
      console.error("❌ Trex API key not configured")
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Trex API key not configured'
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500,
        },
      )
    }

    console.log("🎯 Creating trial Trex user via API call using correct parameters")

    try {
      // Use the correct API format as specified by the user
      const baseUrl = PANEL_URL.replace('/api/api.php', '').replace('/player_api.php', '');
      const apiUrl = new URL(`${baseUrl}/api/api.php`);
      
      // Add parameters in the exact order specified by the user
      // https://activationpanel.net/api/api.php?action=new&type=m3u&sub=12&pack=132&api_key=KEY
      apiUrl.searchParams.append('action', 'new');
      apiUrl.searchParams.append('type', 'm3u');
      apiUrl.searchParams.append('sub', '99'); // 99 is for demo, uses 1 Demo Ticket
      apiUrl.searchParams.append('pack', packageId);
      apiUrl.searchParams.append('note', `${customerData.name} | 24 hour trial`);
      apiUrl.searchParams.append('api_key', API_KEY);
      
      console.log("Operation event")
      
      const response = await fetch(apiUrl.toString(), {
        method: 'GET',
        headers: {
          'User-Agent': 'IPTV-Management-System/1.0',
          'Accept': 'application/json, text/plain, */*',
          'Cache-Control': 'no-cache',
        },
        signal: AbortSignal.timeout(30000), // 30 second timeout
      })
      
      const responseText = await response.text()
      console.log("Operation event")
      console.log("Operation event")

      if (!response.ok) {
        console.log("Operation event")
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: `Trex trial API HTTP ${response.status}: ${response.statusText}`,
            debug_info: {
              panel_url: PANEL_URL,
              package_id: packageId,
              response_text: responseText
            }
          }),
          { 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400,
          },
        )
      }

      // Try to parse as JSON first
      let apiResult;
      try {
        apiResult = JSON.parse(responseText);
      } catch (parseError) {
        // If it's not JSON, check if it contains credentials in text format
        console.log("Operation event");
        
        // Look for common patterns in text responses that might contain credentials
        if (responseText.includes('username') || responseText.includes('password') || responseText.includes('m3u')) {
          // Try to extract credentials from text response
          const lines = responseText.split('\n');
          let extractedUsername = username; // fallback to generated username
          let extractedPassword = password; // fallback to generated password
          
          // Look for username/password patterns in the response
          for (const line of lines) {
            if (line.toLowerCase().includes('username') && line.includes(':')) {
              const match = line.split(':')[1]?.trim();
              if (match) extractedUsername = match;
            }
            if (line.toLowerCase().includes('password') && line.includes(':')) {
              const match = line.split(':')[1]?.trim();
              if (match) extractedPassword = match;
            }
          }
          
          apiResult = {
            success: true,
            username: extractedUsername,
            password: extractedPassword,
            response: responseText
          };
        } else if (responseText.toLowerCase().includes('error') || responseText.toLowerCase().includes('fail')) {
          throw new Error(`API Error: ${responseText}`);
        } else {
          // Assume success if no error indicators and use generated credentials
          apiResult = {
            success: true,
            username: username,
            password: password,
            response: responseText
          };
        }
      }

      // Check for API errors in JSON response
      if (apiResult.error || apiResult.status === 'error') {
        throw new Error(apiResult.error || apiResult.result || 'Failed to create Trex trial user');
      }

      // Use credentials from API response or fallback to generated ones
      const finalUsername = apiResult.username || username;
      const finalPassword = apiResult.password || password;

      console.log("✅ Trex trial account created successfully")

      // Generate M3U URL
      const m3uUrl = `${baseUrl}/get.php?username=${finalUsername}&password=${finalPassword}&type=m3u_plus&output=ts`;

      console.log("Operation event")
      console.log("Operation event")

      // Create HighLevel contact with trial credentials if needed
      let contactId = null
      if (customerData.highlevelContactId) {
        contactId = customerData.highlevelContactId
      } else {
        console.log("🔄 Creating HighLevel contact for Trex trial user...")
        try {
          const { data: hlData, error: hlError } = await supabase.functions.invoke('create-highlevel-contact', {
            body: {
              customerName: customerData.name,
              customerEmail: customerData.email,
              resellerId: resellerId,
              iptvCredentials: {
                username: finalUsername,
                password: finalPassword,
                m3uUrl: m3uUrl
              }
            }
          })

          if (!hlError && hlData?.success) {
            contactId = hlData.contactId
            console.log("✅ HighLevel contact created:")
          }
        } catch (error) {
          console.log("⚠️ HighLevel contact creation failed:")
        }
      }

      // Insert trial customer into database with Trex provider
      const { data: customer, error: customerError } = await supabase
        .from('customers')
        .insert({
          reseller_id: resellerId,
          name: customerData.name,
          email: customerData.email,
          mac_address: null,
          device_type: customerData.deviceType || 'Smart TV',
          plan_duration: 1, // Duration is not relevant for trials, but keep it as 1
          start_date: startDate,
          expiration_date: expirationDate,
          username: finalUsername,
          password: finalPassword,
          m3u_url: m3uUrl,
          highlevel_contact_id: contactId,
          status: 'active',
          is_trial: true,
          trial_created_at: new Date().toISOString(),
          is_deactivated: false,
          provider: 'trex',
          customer_group: `trial_${finalUsername}`,
          connection_sequence: 1,
          max_connections: 1,
          current_connections: 0
        })
        .select()
        .single()

      if (customerError) {
        console.error("❌ Error creating Trex trial customer record:")
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: `Failed to create Trex trial customer record: ${customerError.message}` 
          }),
          { 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 500 
          }
        )
      }

      console.log("✅ Trex trial customer record created successfully:")

      // Update daily trial count for Trex provider
      try {
        const { error: updateError } = await supabase
          .from('daily_trial_limits')
          .upsert({
            provider: 'trex',
            date: today,
            trial_count: currentTrialCount + 1
          })

        if (updateError) {
          console.error("⚠️ Failed to update Trex trial count:")
        } else {
          console.log("Operation event")
        }
      } catch (error) {
        console.error("⚠️ Error updating Trex trial count:")
      }

      // Send trial credentials via HighLevel if contact ID is available
      if (contactId) {
        console.log("📨 Sending Trex trial credentials via HighLevel")
        try {
          await supabase.functions.invoke('send-highlevel-message', {
            body: {
              contactId,
              customerName: customerData.name,
              username: finalUsername,
              password: finalPassword,
              m3uUrl: m3uUrl,
              resellerId: resellerId,
              messageType: 'SMS'
            }
          })
          console.log("✅ Trex trial credentials sent via HighLevel")
        } catch (error) {
          console.log("⚠️ Failed to send Trex trial credentials via HighLevel:")
        }
      }

      console.log("🎉 Trex trial account creation completed successfully")

      return new Response(
        JSON.stringify({ 
          success: true, 
          message: '24-hour Trex trial account created successfully',
          customer: {
            id: customer.id,
            username: finalUsername,
            password: finalPassword,
            expirationDate: expirationDate,
            m3uUrl: m3uUrl,
            isTrial: true,
            provider: 'trex'
          }
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200 
        }
      )

    } catch (error) {
      console.error("💥 Error during Trex trial API call:")
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: `Trex trial API call failed: ${error.message}`,
          debug_info: {
            panel_url: PANEL_URL,
            package_id: packageId,
            error_details: error.stack
          }
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        },
      )
    }

  } catch (error) {
    console.error("💥 Error in create-trex-trial-user function:")
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message || 'Internal server error' 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    )
  }
})


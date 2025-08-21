
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
    console.log('🎯 Create Trex trial user function called')
    
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { customerData, resellerId } = await req.json()
    
    console.log('📦 Trex trial creation request:', { customerData, resellerId })

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
      console.error('❌ Error getting reseller data:', resellerError)
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
      console.log(`❌ Reseller provider mismatch. Expected: trex, Got: ${resellerData.provider}`)
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
    console.log(`📊 Daily trial limit for Trex: ${dailyLimit}`)

    // Get current trial count for today
    const { data: currentLimitData, error: currentLimitError } = await supabase
      .from('daily_trial_limits')
      .select('trial_count')
      .eq('provider', 'trex')
      .eq('date', today)
      .single()

    const currentTrialCount = currentLimitData ? currentLimitData.trial_count : 0;
    console.log(`📊 Current Trex trials today: ${currentTrialCount}`)

    // Check if limit is exceeded
    if (currentTrialCount >= dailyLimit) {
      console.log(`❌ Daily trial limit exceeded for Trex provider: ${currentTrialCount}/${dailyLimit}`)
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

    // Check for duplicate trial (same email today)
    const { data: existingTrial, error: duplicateError } = await supabase
      .from('customers')
      .select('id, username, password, m3u_url')
      .eq('email', customerData.email)
      .eq('provider', 'trex')
      .eq('is_trial', true)
      .gte('trial_created_at', `${today}T00:00:00.000Z`)
      .lt('trial_created_at', `${today}T23:59:59.999Z`)
      .single()

    if (existingTrial && !duplicateError) {
      console.log(`⚠️ Duplicate trial detected for email: ${customerData.email}`)
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'Trial account already exists for this email today',
          customer: {
            id: existingTrial.id,
            username: existingTrial.username,
            password: existingTrial.password,
            m3uUrl: existingTrial.m3u_url,
            isTrial: true,
            provider: 'trex'
          }
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200 
        }
      )
    }

    // Generate unique username and password for trial
    const timestamp = Date.now();
    const randomNum = Math.floor(Math.random() * 1000);
    const username = `trial_${customerData.name.toLowerCase().replace(/\s+/g, '')}_${timestamp}_${randomNum}`.substring(0, 32);
    const password = `trial_${timestamp}_${randomNum}`;

    console.log(`🔐 Generated Trex trial credentials - Username: ${username}`);

    // Calculate trial dates (24 hours from now)
    const startDate = today
    const expiryDate = new Date()
    expiryDate.setHours(expiryDate.getHours() + 24) // 24 hours trial
    const expirationDate = expiryDate.toISOString().split('T')[0]

    console.log(`📅 Trial period: ${startDate} to ${expirationDate} (24 hours)`)

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
        console.log(`📦 Using Trex package ID from settings: ${packageId}`)
      } else {
        console.log(`⚠️ Using fallback package ID: ${packageId}`)
      }
    } catch (error) {
      console.log('⚠️ Failed to get Trex package ID from settings, using fallback:', error)
    }

    // Get API configuration
    const API_KEY = Deno.env.get('TREX_API_KEY')
    const PANEL_URL = Deno.env.get('TREX_PANEL_URL') || 'https://activationpanel.net'
    
    if (!API_KEY) {
      console.error('❌ Trex API key not configured')
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

    console.log('🎯 Creating trial Trex user via API call using correct parameters')

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
      
      console.log(`🔗 Trex trial API URL: ${apiUrl.toString().replace(API_KEY, '[REDACTED]')}`)
      
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
      console.log(`📡 Trex trial API Response Status: ${response.status}`)
      console.log(`📡 Trex trial API Response: ${responseText}`)

      if (!response.ok) {
        console.log(`❌ Trex trial API HTTP Error: ${response.status} - ${response.statusText}`)
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
        console.log(`📄 Parsing text response for trial`);
        
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

      console.log('✅ Trex trial account created successfully')
      
      // Enhanced logging for debugging URL extraction
      console.log('🔍 DEBUGGING API RESPONSE FOR URL EXTRACTION:')
      console.log('📋 Full API Result Object:', JSON.stringify(apiResult, null, 2))
      console.log('📋 API Result Keys:', Object.keys(apiResult))
      if (apiResult.response) {
        console.log('📋 Response Text (first 500 chars):', 
          typeof apiResult.response === 'string' 
            ? apiResult.response.substring(0, 500)
            : JSON.stringify(apiResult.response).substring(0, 500)
        )
      }

      // Start with working Trex OTT URL as fallback
      let m3uUrl = `http://line.trx-ott.com/get.php?username=${finalUsername}&password=${finalPassword}&type=m3u_plus&output=ts`;
      let urlSource = 'generated';
      
      // Enhanced URL extraction from API response
      // Method 1: Direct URL fields
      const possibleUrlFields = ['m3u_url', 'url', 'm3uUrl', 'M3U_URL', 'URL', 'link', 'stream_url', 'playlist_url', 'iptv_url'];
      for (const field of possibleUrlFields) {
        if (apiResult[field] && typeof apiResult[field] === 'string') {
          console.log(`🎯 Found URL in field '${field}': ${apiResult[field]}`);
          m3uUrl = apiResult[field];
          urlSource = `field:${field}`;
          break;
        }
      }
      
      // Method 2: Extract from response text with enhanced patterns
      if (urlSource === 'generated' && apiResult.response && typeof apiResult.response === 'string') {
        const responseText = apiResult.response;
        
        // Pattern 1: Standard HTTP(S) URLs
        const httpUrlMatch = responseText.match(/(https?:\/\/[^\s\n\r"'<>,;]+)/i);
        if (httpUrlMatch) {
          console.log(`🎯 Extracted HTTP URL from response: ${httpUrlMatch[1]}`);
          m3uUrl = httpUrlMatch[1];
          urlSource = 'regex:http';
        }
        
        // Pattern 2: Look for M3U specific patterns
        const m3uPatterns = [
          /m3u[_-]?url[:\s]*([^\s\n\r"'<>,;]+)/i,
          /playlist[_-]?url[:\s]*([^\s\n\r"'<>,;]+)/i,
          /stream[_-]?url[:\s]*([^\s\n\r"'<>,;]+)/i,
          /url[:\s]*(https?:\/\/[^\s\n\r"'<>,;]*\.m3u[^\s\n\r"'<>,;]*)/i
        ];
        
        for (const pattern of m3uPatterns) {
          const match = responseText.match(pattern);
          if (match && match[1]) {
            console.log(`🎯 Extracted M3U URL with pattern: ${match[1]}`);
            m3uUrl = match[1];
            urlSource = 'regex:m3u';
            break;
          }
        }
        
        // Pattern 3: Look for URLs that contain common IPTV parameters
        if (urlSource === 'generated') {
          const iptvParamPattern = /(https?:\/\/[^\s\n\r"'<>,;]*[?&](username|user|login)[=][^&\s\n\r"'<>,;]*)/i;
          const iptvMatch = responseText.match(iptvParamPattern);
          if (iptvMatch) {
            console.log(`🎯 Extracted IPTV URL with parameters: ${iptvMatch[1]}`);
            m3uUrl = iptvMatch[1];
            urlSource = 'regex:iptv';
          }
        }
      }
      
      // Method 3: Check for nested objects in response
      if (urlSource === 'generated' && typeof apiResult.response === 'object' && apiResult.response !== null) {
        const searchNestedUrl = (obj: any, path = ''): string | null => {
          for (const [key, value] of Object.entries(obj)) {
            const currentPath = path ? `${path}.${key}` : key;
            if (typeof value === 'string' && value.startsWith('http')) {
              console.log(`🎯 Found URL in nested object at ${currentPath}: ${value}`);
              return value;
            } else if (typeof value === 'object' && value !== null) {
              const nestedResult = searchNestedUrl(value, currentPath);
              if (nestedResult) return nestedResult;
            }
          }
          return null;
        };
        
        const nestedUrl = searchNestedUrl(apiResult.response);
        if (nestedUrl) {
          m3uUrl = nestedUrl;
          urlSource = 'nested';
        }
      }
      
      console.log(`🔗 Final M3U URL (${urlSource}): ${m3uUrl}`)
      console.log('🔍 URL EXTRACTION COMPLETE')
      

      console.log(`🔐 Final Trex trial credentials - Username: ${finalUsername}, Password: ${finalPassword}`)
      console.log(`🔗 Trex M3U URL: ${m3uUrl}`)

      // Create HighLevel contact with trial credentials if needed
      let contactId = null
      if (customerData.highlevelContactId) {
        contactId = customerData.highlevelContactId
      } else {
        console.log('🔄 Creating HighLevel contact for Trex trial user...')
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
            console.log('✅ HighLevel contact created:', contactId)
          }
        } catch (error) {
          console.log('⚠️ HighLevel contact creation failed:', error)
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
        console.error('❌ Error creating Trex trial customer record:', customerError)
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

      console.log('✅ Trex trial customer record created successfully:', customer.id)

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
          console.error('⚠️ Failed to update Trex trial count:', updateError)
        } else {
          console.log(`✅ Updated Trex trial count: ${currentTrialCount + 1}`)
        }
      } catch (error) {
        console.error('⚠️ Error updating Trex trial count:', error)
      }

      // Send trial credentials via HighLevel if contact ID is available
      if (contactId) {
        console.log('📨 Sending Trex trial credentials via HighLevel')
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
          console.log('✅ Trex trial credentials sent via HighLevel')
        } catch (error) {
          console.log('⚠️ Failed to send Trex trial credentials via HighLevel:', error)
        }
      }

      console.log('🎉 Trex trial account creation completed successfully')

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
      console.error('💥 Error during Trex trial API call:', error)
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
    console.error('💥 Error in create-trial-user function:', error)
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


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
    console.log('🎯 Create trial user function called')
    
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { customerData, resellerId } = await req.json()
    
    console.log('📦 Trial creation request:', { customerData, resellerId })

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

    // Generate MAC address from customer name (remove spaces/special chars, lowercase)
    const generatedMacAddress = customerData.name
      .replace(/[^a-zA-Z0-9]/g, "")
      .toLowerCase()

    console.log(`🔧 Generated MAC address from name "${customerData.name}": ${generatedMacAddress}`)

    // Calculate trial dates (24 hours from now)
    const today = new Date()
    const startDate = today.toISOString().split('T')[0]
    
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
        .eq('id', 'default_package_id')
        .single()

      if (!settingsError && settingsData) {
        packageId = settingsData.value
        console.log(`📦 Using package ID from settings: ${packageId}`)
      } else {
        console.log(`⚠️ Using fallback package ID: ${packageId}`)
      }
    } catch (error) {
      console.log('⚠️ Failed to get package ID from settings, using fallback:', error)
    }

    // Get reseller name for trial API
    const { data: resellerData, error: resellerError } = await supabase
      .from('profiles')
      .select('name')
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

    // Get API configuration
    const API_KEY = Deno.env.get('IPTV_API_KEY')
    const PANEL_URL = Deno.env.get('IPTV_PANEL_URL')
    
    if (!API_KEY) {
      console.error('❌ IPTV API key not configured')
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

    if (!PANEL_URL) {
      console.error('❌ IPTV Panel URL not configured')
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'IPTV Panel URL not configured'
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500,
        },
      )
    }

    console.log('🎯 Creating trial IPTV user via direct API call')

    // Prepare trial API data using the exact structure you provided
    const trialData = {
      mac: generatedMacAddress,
      sub_id: "8", // Trial subscription ID as specified
      comment: `Trial - ${customerData.name} | Reseller: ${resellerData.name}`,
      bouq_list: [],
      type: "lines",
      bouq_custom: packageId,
      country: "ALL"
    }

    console.log('📋 Trial API data:', trialData)

    try {
      // Construct the trial API URL using the exact format you provided
      const baseUrl = PANEL_URL.replace('/api/api.php', '').replace('/player_api.php', '')
      const apiUrl = new URL(`${baseUrl}/api.php`)
      apiUrl.searchParams.append('action', 'add_new')
      apiUrl.searchParams.append('data', JSON.stringify(trialData))
      apiUrl.searchParams.append('api_key', API_KEY)
      
      console.log(`🔗 Trial API URL: ${apiUrl.toString().replace(API_KEY, '[REDACTED]')}`)
      
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
      console.log(`📡 Trial API Response Status: ${response.status}`)
      console.log(`📡 Trial API Response: ${responseText}`)

      if (!response.ok) {
        console.log(`❌ Trial API HTTP Error: ${response.status} - ${response.statusText}`)
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: `Trial API HTTP ${response.status}: ${response.statusText}`,
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

      // Check if the trial creation was successful
      if (responseText.includes('error') || responseText.includes('fail')) {
        console.log(`❌ Trial API Error in response: ${responseText}`)
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: `Trial API Error: ${responseText}`,
            debug_info: {
              panel_url: PANEL_URL,
              package_id: packageId,
              api_response: responseText
            }
          }),
          { 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400,
          },
        )
      }

      console.log('✅ Trial account created successfully')

      // Now retrieve the credentials using the search API
      console.log('🔍 Retrieving trial account credentials...')
      
      const searchUrl = new URL(`${baseUrl}/api_table.php`)
      searchUrl.searchParams.append('search[value]', generatedMacAddress)
      searchUrl.searchParams.append('id', 'lines')
      searchUrl.searchParams.append('filter', '15')
      searchUrl.searchParams.append('state', '0')
      
      console.log(`🔗 Credential search URL: ${searchUrl.toString()}`)
      
      const credentialResponse = await fetch(searchUrl.toString(), {
        method: 'GET',
        headers: {
          'User-Agent': 'IPTV-Management-System/1.0',
          'Accept': 'application/json, text/plain, */*',
          'Cache-Control': 'no-cache',
        },
        signal: AbortSignal.timeout(30000),
      })
      
      const credentialResponseText = await credentialResponse.text()
      console.log(`📡 Credential API Response Status: ${credentialResponse.status}`)
      console.log(`📡 Credential API Response: ${credentialResponseText}`)

      if (!credentialResponse.ok) {
        console.log(`❌ Credential API HTTP Error: ${credentialResponse.status}`)
        // Continue with fallback credentials since account was created
      }

      // Parse credential response and extract username/password
      let finalUsername = generatedMacAddress // Fallback to MAC address
      let finalPassword = generatedMacAddress // Fallback to MAC address
      
      try {
        const credentialData = JSON.parse(credentialResponseText)
        console.log(`📋 Parsed credential data:`, credentialData)
        
        // Extract credentials from the API response
        if (credentialData.data && credentialData.data.length > 0) {
          const accountData = credentialData.data[0]
          if (accountData.username) {
            finalUsername = accountData.username
          }
          if (accountData.password) {
            finalPassword = accountData.password
          }
          console.log(`✅ Retrieved credentials from API - Username: ${finalUsername}, Password: ${finalPassword}`)
        } else {
          console.log(`⚠️ No account data found in credential response, using MAC address as fallback`)
        }
      } catch (parseError) {
        console.log(`⚠️ Could not parse credential response, using MAC address as fallback: ${parseError}`)
      }

      // Generate M3U URL using the retrieved or fallback credentials
      const m3uUrl = `${baseUrl}/get.php?username=${finalUsername}&password=${finalPassword}&type=m3u_plus&output=ts`

      console.log(`🔐 Final trial credentials - Username: ${finalUsername}, Password: ${finalPassword}`)
      console.log(`🔗 M3U URL: ${m3uUrl}`)

      // Create HighLevel contact with trial credentials if needed
      let contactId = null
      if (customerData.highlevelContactId) {
        contactId = customerData.highlevelContactId
      } else {
        console.log('🔄 Creating HighLevel contact for trial user...')
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

      // Insert trial customer into database
      const { data: customer, error: customerError } = await supabase
        .from('customers')
        .insert({
          reseller_id: resellerId,
          name: customerData.name,
          email: customerData.email,
          mac_address: generatedMacAddress,
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
          is_deactivated: false
        })
        .select()
        .single()

      if (customerError) {
        console.error('❌ Error creating trial customer record:', customerError)
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: `Failed to create trial customer record: ${customerError.message}` 
          }),
          { 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 500 
          }
        )
      }

      console.log('✅ Trial customer record created successfully:', customer.id)

      // Send trial credentials via HighLevel if contact ID is available
      if (contactId) {
        console.log('📨 Sending trial credentials via HighLevel')
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
          console.log('✅ Trial credentials sent via HighLevel')
        } catch (error) {
          console.log('⚠️ Failed to send trial credentials via HighLevel:', error)
        }
      }

      console.log('🎉 Trial account creation completed successfully')

      return new Response(
        JSON.stringify({ 
          success: true, 
          message: '24-hour trial account created successfully',
          customer: {
            id: customer.id,
            username: finalUsername,
            password: finalPassword,
            expirationDate: expirationDate,
            m3uUrl: m3uUrl,
            isTrial: true,
            macAddress: generatedMacAddress
          }
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200 
        }
      )

    } catch (error) {
      console.error('💥 Error during trial API call:', error)
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: `Trial API call failed: ${error.message}`,
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

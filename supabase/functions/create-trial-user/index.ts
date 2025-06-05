
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

    // Generate IPTV credentials
    const username = customerData.name
      .replace(/[^a-zA-Z0-9]/g, "")
      .toLowerCase()
      .substring(0, 10) + Math.floor(Math.random() * 1000)
    
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
    let password = ""
    for (let i = 0; i < 8; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length))
    }

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

    // Get reseller name for IPTV API
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

    console.log('🎯 Creating trial IPTV user via create-iptv-user function')

    // Call the create-iptv-user function for trial account
    const { data: iptvResult, error: iptvError } = await supabase.functions.invoke('create-iptv-user', {
      body: {
        userParams: {
          username,
          password,
          maxConnections: 1,
          expiryDate: expiryDate.toISOString(),
          isTrial: true, // Mark as trial
          bouquet: packageId,
          output: "ts",
          customerName: customerData.name,
          resellerName: resellerData.name
        }
      }
    })

    if (iptvError || !iptvResult?.success) {
      console.error('❌ Failed to create trial IPTV user:', iptvError || iptvResult)
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Failed to create trial IPTV user' 
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500 
        }
      )
    }

    console.log('✅ Trial IPTV user created successfully')

    // Extract credentials from API response (if provided) or use generated ones
    const finalUsername = iptvResult.user?.username || username
    const finalPassword = iptvResult.user?.password || password
    const m3uUrl = iptvResult.user?.m3u_url

    console.log(`🔐 Final trial credentials: ${finalUsername} / ${finalPassword}`)

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
        mac_address: customerData.macAddress,
        device_type: customerData.deviceType || 'Smart TV',
        plan_duration: 1, // Duration is not relevant for trials, but keep it as 1
        start_date: startDate,
        expiration_date: expirationDate,
        username: finalUsername,
        password: finalPassword,
        m3u_url: m3uUrl,
        highlevel_contact_id: contactId,
        status: 'active',
        is_trial: true, // Mark as trial account
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
          isTrial: true
        }
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    )

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

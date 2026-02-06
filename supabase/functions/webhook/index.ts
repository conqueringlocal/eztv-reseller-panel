
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { processEnhancedWebhook, EnhancedWebhookPayload } from './enhancedWebhookHandler.ts'
import { processWebhook, WebhookPayload } from './webhookHandler.ts'

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
    console.log(`📞 Webhook received: ${req.method} ${req.url}`)
    
    let payload: any;
    
    if (req.method === 'POST') {
      // Handle JSON POST request (standard webhook)
      const contentType = req.headers.get('content-type')
      console.log(`📋 Content-Type: ${contentType}`)
      
      if (contentType?.includes('application/json')) {
        payload = await req.json()
        console.log(`📦 JSON Payload received:`, payload)
      } else if (contentType?.includes('application/x-www-form-urlencoded')) {
        // Handle form data
        const formData = await req.formData()
        const formObj: any = {}
        for (const [key, value] of formData.entries()) {
          formObj[key] = value
        }
        payload = formObj
        console.log(`📝 Form Payload received:`, payload)
      } else {
        // Try to parse as text and then JSON
        const text = await req.text()
        console.log(`📄 Raw payload:`, text)
        try {
          payload = JSON.parse(text)
        } catch {
          return new Response(
            JSON.stringify({ 
              success: false, 
              error: 'Invalid payload format - expected JSON' 
            }),
            { 
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              status: 400 
            }
          )
        }
      }
    } else if (req.method === 'GET') {
      // Handle GET request with query parameters (fallback support)
      const url = new URL(req.url)
      const searchParams = url.searchParams
      
      const action = searchParams.get('action') as 'create' | 'renew' | 'trial' | 'upgrade' || 'create';
      const isTrial = searchParams.get('is_trial') === 'true' || action === 'trial';
      
      payload = {
        api_key: searchParams.get('api_key') || searchParams.get('apiKey') || '',
        resellerId: searchParams.get('resellerId') || '',
        action: action,
        connections: parseInt(searchParams.get('connections') || '1', 10),
        customer: {
          name: searchParams.get('name') || searchParams.get('customerName') || '',
          email: searchParams.get('email') || searchParams.get('customerEmail') || '',
          mac: searchParams.get('mac') || searchParams.get('macAddress') || '',
          device_type: searchParams.get('device_type') || searchParams.get('deviceType') || 'Smart TV',
          // Only include plan_duration_months for non-trial actions
          plan_duration_months: isTrial ? undefined : parseInt(searchParams.get('plan_duration_months') || searchParams.get('planDuration') || '0', 10),
          package_id: searchParams.get('package_id') || searchParams.get('packageId') || undefined
        },
        contact_id: searchParams.get('contact_id') || searchParams.get('contactId') || undefined,
        is_trial: isTrial,
        trial_duration_hours: parseInt(searchParams.get('trial_duration_hours') || '24', 10)
      }
      
      // Remove undefined plan_duration_months for cleaner payload
      if (payload.customer.plan_duration_months === undefined) {
        delete payload.customer.plan_duration_months;
      }
      
      console.log(`🔗 Query Params Payload:`, payload)
    } else {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Method not allowed - use POST or GET' 
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 405 
        }
      )
    }

    // Validate that we have some data
    if (!payload) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'No payload data received' 
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400 
        }
      )
    }

    console.log(`🔄 Processing webhook with payload:`, payload)
    
    // Determine which webhook processor to use based on payload structure
    let result;
    
    // Check if this is an enhanced webhook (has action field and connections support)
    if (payload.action && ['create', 'renew', 'trial', 'upgrade'].includes(payload.action)) {
      console.log('🚀 Using enhanced webhook processor')
      result = await processEnhancedWebhook(payload as EnhancedWebhookPayload)
    } else {
      console.log('📋 Using legacy webhook processor')
      // Convert to legacy format for backwards compatibility
      const legacyPayload: WebhookPayload = {
        api_key: payload.api_key,
        resellerId: payload.resellerId,
        action: payload.action || 'create',
        contact_id: payload.contact_id,
        is_trial: payload.is_trial,
        customer: payload.customer || {
          name: payload.customerName || '',
          email: payload.customerEmail || '',
          mac: payload.macAddress || '',
          device_type: payload.deviceType || '',
          plan_duration_months: payload.planDuration || 0,
          package_id: payload.packageId
        },
        customerName: payload.customerName,
        customerEmail: payload.customerEmail,
        macAddress: payload.macAddress,
        deviceType: payload.deviceType,
        planDuration: payload.planDuration,
        packageId: payload.packageId,
        contactId: payload.contactId
      }
      result = await processWebhook(legacyPayload)
    }
    
    console.log(`✅ Webhook processing result:`, result)
    
    return new Response(
      JSON.stringify(result),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: result.success ? 200 : 400
      }
    )
    
  } catch (error) {
    console.error('💥 Webhook error:', error)
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message || 'Internal server error',
        stack: error.stack 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    )
  }
})

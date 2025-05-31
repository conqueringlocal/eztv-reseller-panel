
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
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
    
    let payload: WebhookPayload;
    
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
      
      payload = {
        api_key: searchParams.get('api_key') || searchParams.get('apiKey') || '',
        resellerId: searchParams.get('resellerId') || '',
        customer: {
          name: searchParams.get('name') || searchParams.get('customerName') || '',
          email: searchParams.get('email') || searchParams.get('customerEmail') || '',
          mac: searchParams.get('mac') || searchParams.get('macAddress') || '',
          device_type: searchParams.get('device_type') || searchParams.get('deviceType') || 'Smart TV',
          plan_duration_months: parseInt(searchParams.get('plan_duration_months') || searchParams.get('planDuration') || '0', 10)
        }
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
    
    // Process the webhook
    const result = await processWebhook(payload)
    
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

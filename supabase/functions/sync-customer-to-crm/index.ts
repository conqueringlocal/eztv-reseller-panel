
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SyncCustomerRequest {
  customerId: string;
  resellerId: string;
  forceSync?: boolean;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    console.log('🔄 CRM customer sync function called');

    const { customerId, resellerId, forceSync = false }: SyncCustomerRequest = await req.json();

    console.log('📋 Sync request:', { customerId, resellerId, forceSync });

    if (!customerId || !resellerId) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Customer ID and Reseller ID are required' 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get Supabase client
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Get customer details
    const { data: customer, error: customerError } = await supabase
      .from('customers')
      .select('*')
      .eq('id', customerId)
      .eq('reseller_id', resellerId)
      .single();

    if (customerError || !customer) {
      console.error('❌ Customer not found:', customerError);
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Customer not found' 
      }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check if customer already has a CRM contact ID and force sync is not enabled
    if (customer.highlevel_contact_id && !forceSync) {
      console.log('ℹ️ Customer already has CRM contact ID, skipping sync');
      return new Response(JSON.stringify({ 
        success: true, 
        contactId: customer.highlevel_contact_id,
        message: 'Customer already synced to CRM',
        skipped: true
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get reseller's CRM credentials
    const { data: crmSettings, error: crmError } = await supabase
      .from('reseller_highlevel_settings')
      .select('api_key, location_id')
      .eq('reseller_id', resellerId)
      .eq('is_active', true)
      .single();

    if (crmError || !crmSettings) {
      console.error('❌ No CRM settings found for reseller:', resellerId);
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'CRM credentials not configured for this reseller' 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Create contact in CRM using the existing create-highlevel-contact function
    console.log('🔄 Creating contact in CRM...');
    
    const createContactResponse = await supabase.functions.invoke('create-highlevel-contact', {
      body: {
        customerName: customer.name,
        customerEmail: customer.email,
        resellerId: resellerId,
        apiKey: crmSettings.api_key,
        locationId: crmSettings.location_id
      }
    });

    if (createContactResponse.error || !createContactResponse.data?.success) {
      console.error('❌ Failed to create CRM contact:', createContactResponse.error);
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Failed to create contact in CRM',
        details: createContactResponse.data?.error || createContactResponse.error?.message
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const contactId = createContactResponse.data.contactId;

    // Update customer with CRM contact ID
    const { error: updateError } = await supabase
      .from('customers')
      .update({ highlevel_contact_id: contactId })
      .eq('id', customerId)
      .eq('reseller_id', resellerId);

    if (updateError) {
      console.error('❌ Failed to update customer with CRM contact ID:', updateError);
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Contact created but failed to update customer record' 
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('✅ Customer successfully synced to CRM');

    return new Response(JSON.stringify({ 
      success: true, 
      contactId: contactId,
      message: 'Customer successfully synced to CRM'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('💥 Error in CRM sync function:', error);
    return new Response(JSON.stringify({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

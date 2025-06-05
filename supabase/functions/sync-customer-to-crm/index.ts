
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

    // Get customer details including IPTV credentials
    console.log('🔍 Fetching customer details...');
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
        error: 'Customer not found',
        details: customerError?.message || 'Customer does not exist or does not belong to this reseller'
      }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('👤 Customer found:', { 
      name: customer.name, 
      email: customer.email, 
      highlevelContactId: customer.highlevel_contact_id,
      hasCredentials: !!(customer.username && customer.password)
    });

    // Check if customer already has a CRM contact ID and force sync is not enabled
    if (customer.highlevel_contact_id && !forceSync) {
      console.log('ℹ️ Customer already has CRM contact ID, checking if credentials need updating...');
      
      // If customer has IPTV credentials but force sync is not enabled, update credentials
      if (customer.username && customer.password) {
        console.log('🔄 Updating existing contact with IPTV credentials...');
        
        const updateResponse = await supabase.functions.invoke('update-highlevel-contact-credentials', {
          body: {
            contactId: customer.highlevel_contact_id,
            resellerId: resellerId,
            iptvCredentials: {
              username: customer.username,
              password: customer.password,
              m3uUrl: customer.m3u_url
            }
          }
        });

        if (updateResponse.error || !updateResponse.data?.success) {
          console.error('❌ Failed to update contact credentials:', updateResponse.error || updateResponse.data);
          return new Response(JSON.stringify({ 
            success: false, 
            error: 'Failed to update contact credentials in CRM',
            details: updateResponse.data?.error || 'Contact credentials update function returned failure'
          }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        console.log('✅ Contact credentials updated successfully');
        return new Response(JSON.stringify({ 
          success: true, 
          contactId: customer.highlevel_contact_id,
          message: 'Customer credentials updated in CRM',
          credentialsUpdated: true
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ 
        success: true, 
        contactId: customer.highlevel_contact_id,
        message: 'Customer already synced to CRM',
        skipped: true
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get reseller's location ID from HighLevel settings
    console.log('🔍 Fetching reseller HighLevel settings...');
    const { data: crmSettings, error: crmError } = await supabase
      .from('reseller_highlevel_settings')
      .select('location_id, is_active')
      .eq('reseller_id', resellerId)
      .eq('is_active', true)
      .single();

    if (crmError || !crmSettings) {
      console.error('❌ No HighLevel settings found for reseller:', resellerId, crmError);
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'HighLevel integration not configured for this reseller',
        details: crmError?.message || 'No active HighLevel settings found'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('🔐 HighLevel settings found:', { 
      hasLocationId: !!crmSettings.location_id,
      locationId: crmSettings.location_id
    });

    // Prepare IPTV credentials if available
    let iptvCredentials = undefined;
    if (customer.username && customer.password) {
      iptvCredentials = {
        username: customer.username,
        password: customer.password,
        m3uUrl: customer.m3u_url
      };
      console.log('📋 IPTV credentials prepared for contact creation');
    }

    // Create contact in CRM using the create-highlevel-contact function
    console.log('🔄 Creating contact in CRM...');
    
    const createContactResponse = await supabase.functions.invoke('create-highlevel-contact', {
      body: {
        customerName: customer.name,
        customerEmail: customer.email,
        resellerId: resellerId,
        iptvCredentials: iptvCredentials
      }
    });

    console.log('📡 Create contact response status:', createContactResponse.status);
    console.log('📡 Create contact response data:', createContactResponse.data);
    console.log('📡 Create contact response error:', createContactResponse.error);

    if (createContactResponse.error) {
      console.error('❌ Edge function invocation error:', createContactResponse.error);
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Failed to invoke contact creation function',
        details: createContactResponse.error.message || 'Unknown edge function error'
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!createContactResponse.data?.success) {
      console.error('❌ CRM contact creation failed:', createContactResponse.data);
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Failed to create contact in CRM',
        details: createContactResponse.data?.error || 'Contact creation function returned failure',
        troubleshooting: createContactResponse.data?.troubleshooting || null,
        debugInfo: createContactResponse.data?.debugInfo || null
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const contactId = createContactResponse.data.contactId;
    console.log('✅ Contact created successfully with ID:', contactId);

    // Update customer with CRM contact ID
    console.log('💾 Updating customer record with CRM contact ID...');
    const { error: updateError } = await supabase
      .from('customers')
      .update({ highlevel_contact_id: contactId })
      .eq('id', customerId)
      .eq('reseller_id', resellerId);

    if (updateError) {
      console.error('❌ Failed to update customer with CRM contact ID:', updateError);
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Contact created but failed to update customer record',
        details: updateError.message,
        contactId: contactId // Still return the contact ID so user knows it was created
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('✅ Customer successfully synced to CRM');

    return new Response(JSON.stringify({ 
      success: true, 
      contactId: contactId,
      message: forceSync ? 'Customer force-synced to CRM successfully' : 'Customer successfully synced to CRM',
      credentialsAdded: !!iptvCredentials,
      debugInfo: createContactResponse.data?.debugInfo || null
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('💥 Error in CRM sync function:', error);
    console.error('Error stack:', error.stack);
    return new Response(JSON.stringify({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error',
      details: error instanceof Error ? error.stack : 'No additional details available'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

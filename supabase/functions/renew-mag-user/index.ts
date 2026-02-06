
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface RenewMagRequest {
  customerId: string;
  planDuration: number;
  serviceCall?: boolean;  // Skip JWT for internal calls
  resellerId?: string;    // Required when serviceCall=true
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    const { customerId, planDuration, serviceCall = false, resellerId: providedResellerId }: RenewMagRequest = await req.json();

    let isServiceCall = false;
    let verifiedUserId: string | null = null;

    if (!serviceCall) {
      // Normal path: Verify JWT token
      const authHeader = req.headers.get('Authorization');
      if (!authHeader) {
        return new Response(
          JSON.stringify({ error: 'No authorization header' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const token = authHeader.replace('Bearer ', '');
      const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token);
      
      if (authError || !user) {
        console.error('Auth error:', authError);
        return new Response(
          JSON.stringify({ error: 'Invalid token' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      verifiedUserId = user.id;
    } else {
      // Service call path: Skip JWT, trust the provided resellerId
      console.log('🔐 Bypassing JWT authentication for service call');
      
      if (!providedResellerId) {
        return new Response(
          JSON.stringify({ error: 'resellerId is required for service calls' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      isServiceCall = true;
    }

    console.log(`🔄 Starting MAG renewal process for customer: ${customerId}, duration: ${planDuration} months`);

    // Validate plan duration
    if (![1, 3, 6, 12].includes(planDuration)) {
      console.error(`❌ Invalid plan duration: ${planDuration}. Must be 1, 3, 6, or 12 months.`);
      return new Response(
        JSON.stringify({ error: 'Invalid plan duration. Must be 1, 3, 6, or 12 months.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get customer details including their MAC address
    const { data: customer, error: customerError } = await supabaseClient
      .from('customers')
      .select('*')
      .eq('id', customerId)
      .single();

    if (customerError || !customer) {
      console.error('Customer not found:', customerError);
      return new Response(
        JSON.stringify({ error: 'Customer not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Authorization check
    if (isServiceCall) {
      // Service call: Verify the provided resellerId matches the customer's reseller
      if (customer.reseller_id !== providedResellerId) {
        console.error(`❌ Service call reseller mismatch: provided ${providedResellerId} != customer ${customer.reseller_id}`);
        return new Response(
          JSON.stringify({ error: 'Reseller ID mismatch' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      console.log(`✅ Service call authorized for reseller: ${providedResellerId}`);
    } else {
      // User call: Check authorization
      const { data: userProfile, error: profileError } = await supabaseClient
        .from('profiles')
        .select('role')
        .eq('id', verifiedUserId)
        .single();

      if (profileError || !userProfile) {
        console.error('❌ Failed to fetch user profile:', profileError);
        return new Response(
          JSON.stringify({ error: 'Failed to verify user permissions' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Check authorization: admins can renew any customer, resellers only their own
      if (userProfile.role !== 'admin' && customer.reseller_id !== verifiedUserId) {
        console.error(`❌ Authorization failed: User ${verifiedUserId} attempted to renew customer belonging to ${customer.reseller_id}`);
        return new Response(
          JSON.stringify({ error: 'Unauthorized to renew this customer' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log(`✅ Authorization passed: ${userProfile.role === 'admin' ? 'Admin' : 'Reseller'} renewing customer`);
    }

    // Note: Credit checking and deduction is now handled by renew-customer-group function
    // This function only handles the IPTV API call and database update

    // Get IPTV panel credentials from Supabase secrets
    const iptvApiKey = Deno.env.get('IPTV_API_KEY');
    const panelUrl = Deno.env.get('IPTV_PANEL_URL') || 'https://my8k.me/api/api.php';

    if (!iptvApiKey) {
      console.error('IPTV API key not configured in secrets');
      return new Response(
        JSON.stringify({ error: 'IPTV API key not configured. Please contact administrator.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if this is a consolidated customer
    const connectionList = customer.connection_list;
    const isConsolidated = Array.isArray(connectionList) && connectionList.length > 0;

    console.log(`🔍 Customer type: ${isConsolidated ? 'Consolidated' : 'Single'}`);
    console.log(`📊 Connections to renew: ${isConsolidated ? connectionList.length : 1}`);

    const renewalResults = [];

    if (isConsolidated) {
      // CONSOLIDATED: Renew each MAG connection
      console.log(`🔄 Processing ${connectionList.length} consolidated MAG connections`);
      
      for (let i = 0; i < connectionList.length; i++) {
        const connection = connectionList[i];
        const connectionNum = connection.connection_number || i + 1;
        
        if (!connection.mac_address) {
          console.warn(`⚠️ Connection ${connectionNum} missing MAC address, skipping`);
          renewalResults.push({
            connectionNumber: connectionNum,
            success: false,
            error: 'Missing MAC address'
          });
          continue;
        }
        
        console.log(`\n📡 Renewing MAG connection ${connectionNum} of ${connectionList.length}`);
        console.log(`📦 MAC: ${connection.mac_address}`);
        
        const renewUrl = new URL(panelUrl);
        renewUrl.searchParams.append("api_key", iptvApiKey);
        renewUrl.searchParams.append("action", "renew");
        renewUrl.searchParams.append("type", "mag");
        renewUrl.searchParams.append("mac", connection.mac_address);
        renewUrl.searchParams.append("sub", planDuration.toString());
        
        try {
          const iptvResponse = await fetch(renewUrl.toString());
          const iptvData = await iptvResponse.json();
          
          if (!iptvResponse.ok || iptvData.error || iptvData.status === 'error') {
            console.error(`❌ Connection ${connectionNum} renewal failed:`, iptvData);
            renewalResults.push({
              connectionNumber: connectionNum,
              success: false,
              error: iptvData.error || iptvData.message || 'Unknown error'
            });
          } else {
            console.log(`✅ Connection ${connectionNum} renewed successfully`);
            renewalResults.push({
              connectionNumber: connectionNum,
              success: true
            });
          }
        } catch (error) {
          console.error(`❌ Connection ${connectionNum} API call failed:`, error);
          renewalResults.push({
            connectionNumber: connectionNum,
            success: false,
            error: error.message
          });
        }
      }
      
      const allSuccessful = renewalResults.every(r => r.success);
      const successCount = renewalResults.filter(r => r.success).length;
      
      if (!allSuccessful) {
        return new Response(
          JSON.stringify({ 
            error: 'Partial renewal failure',
            details: `Only ${successCount} out of ${connectionList.length} MAG connections renewed`,
            renewalResults
          }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      console.log(`✅ All ${connectionList.length} MAG connections renewed`);
      
    } else {
      // SINGLE CONNECTION (fallback)
      console.log(`🔄 Processing single MAG connection`);
      
      if (!customer.mac_address) {
        return new Response(
          JSON.stringify({ error: 'Customer does not have a MAC address configured' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      const renewUrl = new URL(panelUrl);
      renewUrl.searchParams.append("api_key", iptvApiKey);
      renewUrl.searchParams.append("action", "renew");
      renewUrl.searchParams.append("type", "mag");
      renewUrl.searchParams.append("mac", customer.mac_address);
      renewUrl.searchParams.append("sub", planDuration.toString());
      
      const iptvResponse = await fetch(renewUrl.toString());
      const iptvData = await iptvResponse.json();
      
      if (!iptvResponse.ok || iptvData.error || iptvData.status === 'error') {
        return new Response(
          JSON.stringify({ 
            error: 'Failed to renew MAG subscription',
            details: iptvData
          }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true,
        message: `MAG renewal successful for ${planDuration} month(s)`,
        connectionsRenewed: isConsolidated ? connectionList.length : 1,
        provider: 'mag',
        customerName: customer.name
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in renew-mag-user function:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

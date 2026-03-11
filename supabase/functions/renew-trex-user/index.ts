
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface RenewRequest {
  customerId: string;
  planDuration: number;
  serviceCall?: boolean;  // Skip JWT for internal calls
  resellerId?: string;    // Required when serviceCall=true
}

// Helper function to map plan duration to subscription format (same as create-trex-user)
function mapPlanDurationToSub(planDuration: number): string {
  // IMPORTANT: Trex renewal API uses 0-indexed subscription package indices
  // sub=0 → 1 month, sub=1 → 2 months, sub=2 → 3 months, etc.
  const mapping: { [key: number]: string } = {
    1: '0',    // 1 month (index 0)
    3: '2',    // 3 months (index 2)
    6: '5',    // 6 months (index 5)
    12: '11',  // 12 months (index 11)
  };
  
  return mapping[planDuration] || '0'; // Default to 1 month if not found
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

    const { customerId, planDuration, serviceCall = false, resellerId: providedResellerId }: RenewRequest = await req.json();

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

    console.log(`🔄 Starting Trex renewal process for customer: ${customerId}, duration: ${planDuration} months`);

    // Validate plan duration
    if (![1, 3, 6, 12].includes(planDuration)) {
      console.error(`❌ Invalid plan duration: ${planDuration}. Must be 1, 3, 6, or 12 months.`);
      return new Response(
        JSON.stringify({ error: 'Invalid plan duration. Must be 1, 3, 6, or 12 months.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get customer details including their IPTV credentials
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
    // This function only handles the Trex API call and database update

    // Get Trex panel credentials from Supabase secrets
    const trexApiKey = Deno.env.get('TREX_API_KEY');
    const panelUrl = Deno.env.get('TREX_PANEL_URL') || 'https://trex.example.com/api/api.php';

    if (!trexApiKey) {
      console.error('Trex API key not configured in secrets');
      return new Response(
        JSON.stringify({ error: 'Trex API key not configured. Please contact administrator.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Map plan duration to subscription format (to match create-trex-user behavior)
    const subscriptionPeriod = mapPlanDurationToSub(planDuration);
    
    // Check if this is a consolidated customer with multiple connections
    const connectionList = customer.connection_list;
    const isConsolidated = Array.isArray(connectionList) && connectionList.length > 0;

    console.log(`🔍 Customer type: ${isConsolidated ? 'Consolidated' : 'Single'}`);
    console.log(`📊 Connections to renew: ${isConsolidated ? connectionList.length : 1}`);

    const renewalResults = [];

    if (isConsolidated) {
      // CONSOLIDATED CUSTOMER: Renew each connection in the list
      console.log(`🔄 Processing ${connectionList.length} consolidated connections`);
      
      for (let i = 0; i < connectionList.length; i++) {
        const connection = connectionList[i];
        const connectionNum = connection.connection_number || i + 1;
        
        console.log(`\n📡 Renewing connection ${connectionNum} of ${connectionList.length}`);
        
        // Determine account type
        const isMagAccount = !!connection.mac_address;
        const accountType = isMagAccount ? 'mag' : 'm3u';
        
        // Build renewal URL
        const renewUrl = new URL(panelUrl);
        renewUrl.searchParams.append("api_key", trexApiKey);
        renewUrl.searchParams.append("action", "renew");
        renewUrl.searchParams.append("type", accountType);
        renewUrl.searchParams.append("sub", subscriptionPeriod);
        
        if (isMagAccount) {
          renewUrl.searchParams.append("mac", connection.mac_address);
          console.log(`📦 Connection ${connectionNum}: MAG renewal for ${connection.mac_address}`);
        } else {
          renewUrl.searchParams.append("username", connection.username);
          renewUrl.searchParams.append("password", connection.password);
          console.log(`👤 Connection ${connectionNum}: M3U renewal for ${connection.username}`);
        }
        
        // Call Trex API
        try {
          const trexResponse = await fetch(renewUrl.toString());
          const trexData = await trexResponse.json();
          
          if (!trexResponse.ok || trexData.error || trexData.status === 'error') {
            console.error(`❌ Connection ${connectionNum} renewal failed:`, trexData);
            renewalResults.push({
              connectionNumber: connectionNum,
              success: false,
              error: trexData.error || trexData.message || 'Unknown error'
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
      
      // Check if all renewals succeeded
      const allSuccessful = renewalResults.every(r => r.success);
      const successCount = renewalResults.filter(r => r.success).length;
      
      if (!allSuccessful) {
        console.error(`⚠️ Partial renewal failure: ${successCount}/${connectionList.length} connections renewed`);
        return new Response(
          JSON.stringify({ 
            error: 'Partial renewal failure',
            details: `Only ${successCount} out of ${connectionList.length} connections were renewed successfully`,
            renewalResults
          }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      console.log(`✅ All ${connectionList.length} consolidated connections renewed successfully`);
      
    } else {
      // SINGLE CONNECTION: Use top-level credentials (fallback)
      console.log(`🔄 Processing single connection (legacy format)`);
      
      if (!customer.username || !customer.password) {
        console.error(`❌ Customer ${customer.name} does not have IPTV credentials`);
        return new Response(
          JSON.stringify({ error: 'Customer does not have IPTV credentials' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      const isMagAccount = !!customer.mac_address;
      const accountType = isMagAccount ? 'mag' : 'm3u';
      
      const renewUrl = new URL(panelUrl);
      renewUrl.searchParams.append("api_key", trexApiKey);
      renewUrl.searchParams.append("action", "renew");
      renewUrl.searchParams.append("type", accountType);
      renewUrl.searchParams.append("sub", subscriptionPeriod);
      
      if (isMagAccount) {
        renewUrl.searchParams.append("mac", customer.mac_address);
        console.log(`📦 Single MAG renewal for ${customer.mac_address}`);
      } else {
        renewUrl.searchParams.append("username", customer.username);
        renewUrl.searchParams.append("password", customer.password);
        console.log(`👤 Single M3U renewal for ${customer.username}`);
      }
      
      const trexResponse = await fetch(renewUrl.toString());
      const trexData = await trexResponse.json();
      
      if (!trexResponse.ok || trexData.error || trexData.status === 'error') {
        console.error('❌ Trex API renewal failed:', trexData);
        return new Response(
          JSON.stringify({ 
            error: 'Failed to renew Trex subscription', 
            details: trexData,
            trexResponse: trexData 
          }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      console.log(`✅ Single connection renewed successfully`);
    }

    // Success response
    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Trex renewal successful for ${planDuration} month(s)`,
        connectionsRenewed: isConsolidated ? connectionList.length : 1,
        provider: 'trex',
        customerName: customer.name
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in renew-trex-user function:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});


import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface RenewGroupRequest {
  customerId: string;
  planDuration: number;
}

interface CustomerAccount {
  id: string;
  name: string;
  username?: string;
  password?: string;
  mac_address?: string;
  provider: string;
  reseller_id: string;
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

    // Get the authorization header - we need to preserve this for forwarding
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'No authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify the JWT token
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token);
    
    if (authError || !user) {
      console.error('Auth error:', authError);
      return new Response(
        JSON.stringify({ error: 'Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { customerId, planDuration }: RenewGroupRequest = await req.json();

    console.log(`🔄 Starting group renewal process for customer: ${customerId}, duration: ${planDuration} months`);

    // Validate plan duration
    if (![1, 3, 6, 12].includes(planDuration)) {
      console.error(`❌ Invalid plan duration: ${planDuration}. Must be 1, 3, 6, or 12 months.`);
      return new Response(
        JSON.stringify({ error: 'Invalid plan duration. Must be 1, 3, 6, or 12 months.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get the primary customer to find the customer group
    const { data: primaryCustomer, error: customerError } = await supabaseClient
      .from('customers')
      .select('*')
      .eq('id', customerId)
      .single();

    if (customerError || !primaryCustomer) {
      console.error('Primary customer not found:', customerError);
      return new Response(
        JSON.stringify({ error: 'Customer not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if user has permission to renew this customer
    if (primaryCustomer.reseller_id !== user.id) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized to renew this customer' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get all customers in the same group
    const { data: groupCustomers, error: groupError } = await supabaseClient
      .from('customers')
      .select('*')
      .eq('customer_group', primaryCustomer.customer_group)
      .neq('status', 'cancelled');

    if (groupError || !groupCustomers) {
      console.error('Error fetching group customers:', groupError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch customer group' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`📊 Found ${groupCustomers.length} accounts in customer group: ${primaryCustomer.customer_group}`);

    // Get reseller profile to check credits and provider
    const { data: reseller, error: resellerError } = await supabaseClient
      .from('profiles')
      .select('credits, provider')
      .eq('id', user.id)
      .single();

    if (resellerError || !reseller) {
      console.error('Reseller not found:', resellerError);
      return new Response(
        JSON.stringify({ error: 'Reseller not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const creditsRequired = groupCustomers.length * planDuration;

    // Check if reseller has enough credits
    if (reseller.credits < creditsRequired) {
      console.log(`❌ Insufficient credits. Required: ${creditsRequired}, Available: ${reseller.credits}`);
      return new Response(
        JSON.stringify({ 
          error: 'Insufficient credits', 
          required: creditsRequired, 
          available: reseller.credits 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Separate customers by type (MAG vs M3U)
    const magCustomers = groupCustomers.filter(c => c.mac_address && !c.username);
    const m3uCustomers = groupCustomers.filter(c => c.username && c.password);

    console.log(`📋 Customer breakdown: ${magCustomers.length} MAG accounts, ${m3uCustomers.length} M3U accounts`);

    let renewalResults: Array<{account: CustomerAccount, success: boolean, error?: string}> = [];

    // Create a new Supabase client with proper auth headers for function invocations
    const clientWithAuth = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '', // Use anon key for client operations
      {
        global: {
          headers: {
            Authorization: authHeader, // Forward the original auth header
          }
        }
      }
    );

    // Renew MAG customers
    for (const customer of magCustomers) {
      console.log(`🔄 Renewing MAG customer: ${customer.name} (${customer.mac_address})`);
      
      try {
        const { data, error } = await clientWithAuth.functions.invoke('renew-mag-user', {
          body: {
            customerId: customer.id,
            planDuration: planDuration
          }
        });

        if (error || !data?.success) {
          console.error(`❌ Failed to renew MAG customer ${customer.name}:`, error || data?.error);
          renewalResults.push({
            account: customer as CustomerAccount,
            success: false,
            error: error?.message || data?.error || 'Unknown error'
          });
        } else {
          console.log(`✅ Successfully renewed MAG customer: ${customer.name}`);
          renewalResults.push({
            account: customer as CustomerAccount,
            success: true
          });
        }
      } catch (error) {
        console.error(`💥 Exception renewing MAG customer ${customer.name}:`, error);
        renewalResults.push({
          account: customer as CustomerAccount,
          success: false,
          error: error.message
        });
      }
    }

    // Renew M3U customers based on provider
    for (const customer of m3uCustomers) {
      console.log(`🔄 Renewing M3U customer: ${customer.name} (${customer.username}) - Provider: ${customer.provider}`);
      
      try {
        let functionName = 'renew-iptv-user'; // Default to 8k provider
        if (customer.provider === 'trex') {
          functionName = 'renew-trex-user';
        }

        const { data, error } = await clientWithAuth.functions.invoke(functionName, {
          body: {
            customerId: customer.id,
            planDuration: planDuration
          }
        });

        if (error || !data?.success) {
          console.error(`❌ Failed to renew M3U customer ${customer.name}:`, error || data?.error);
          renewalResults.push({
            account: customer as CustomerAccount,
            success: false,
            error: error?.message || data?.error || 'Unknown error'
          });
        } else {
          console.log(`✅ Successfully renewed M3U customer: ${customer.name}`);
          renewalResults.push({
            account: customer as CustomerAccount,
            success: true
          });
        }
      } catch (error) {
        console.error(`💥 Exception renewing M3U customer ${customer.name}:`, error);
        renewalResults.push({
          account: customer as CustomerAccount,
          success: false,
          error: error.message
        });
      }
    }

    // Count successful renewals
    const successfulRenewals = renewalResults.filter(r => r.success).length;
    const failedRenewals = renewalResults.filter(r => !r.success);

    console.log(`📊 Renewal summary: ${successfulRenewals}/${renewalResults.length} accounts renewed successfully`);

    if (failedRenewals.length > 0) {
      console.error('❌ Failed renewals:', failedRenewals.map(f => `${f.account.name}: ${f.error}`));
    }

    // Update database with consolidated results - only if all renewals succeeded
    if (successfulRenewals === renewalResults.length) {
      // Use the existing database function to update all accounts and deduct credits
      const { data: dbResult, error: dbError } = await supabaseClient.rpc('renew_customer_group', {
        customer_id_param: customerId,
        duration_months: planDuration,
        reseller_id_param: user.id
      });

      if (dbError || !dbResult?.[0]?.success) {
        console.error('❌ Database update failed:', dbError || dbResult?.[0]?.error_message);
        return new Response(
          JSON.stringify({ 
            error: 'API renewals succeeded but database update failed',
            details: dbError?.message || dbResult?.[0]?.error_message,
            renewalResults: renewalResults
          }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log(`✅ Group renewal completed successfully: ${successfulRenewals} accounts renewed`);

      return new Response(
        JSON.stringify({ 
          success: true,
          message: `Successfully renewed ${successfulRenewals} accounts for ${planDuration} months`,
          accountsRenewed: successfulRenewals,
          creditsUsed: creditsRequired,
          renewalResults: renewalResults
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } else {
      // Partial failure - return detailed results
      console.error(`❌ Partial renewal failure: ${successfulRenewals}/${renewalResults.length} accounts renewed`);
      
      return new Response(
        JSON.stringify({ 
          success: false,
          error: `Only ${successfulRenewals} out of ${renewalResults.length} accounts were renewed successfully`,
          accountsRenewed: successfulRenewals,
          totalAccounts: renewalResults.length,
          renewalResults: renewalResults
        }),
        { status: 207, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

  } catch (error) {
    console.error('💥 Unexpected error in renew-customer-group function:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

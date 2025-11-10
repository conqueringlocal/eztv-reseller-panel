
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
      console.error('❌ No authorization header provided');
      return new Response(
        JSON.stringify({ 
          error: 'Authentication required. Please ensure you are logged in.',
          code: 'MISSING_AUTH_HEADER'
        }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify the JWT token
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token);
    
    if (authError || !user) {
      console.error('❌ Auth verification failed:', {
        error: authError?.message,
        hasToken: !!token,
        tokenLength: token?.length
      });
      
      return new Response(
        JSON.stringify({ 
          error: authError?.message?.includes('expired') 
            ? 'Your session has expired. Please log in again.'
            : 'Invalid authentication token. Please log in again.',
          code: 'INVALID_TOKEN',
          details: authError?.message
        }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`✅ User authenticated: ${user.email} (ID: ${user.id})`);

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
      console.error(`❌ Authorization failed: User ${user.id} (${user.email}) attempted to renew customer ${customerId} owned by ${primaryCustomer.reseller_id}`);
      
      return new Response(
        JSON.stringify({ 
          error: 'You do not have permission to renew this customer subscription.',
          code: 'UNAUTHORIZED_CUSTOMER',
          details: `Customer belongs to a different reseller`
        }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`✅ Authorization passed: User ${user.email} can renew customer ${primaryCustomer.name}`);

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

    // Enhanced idempotency protection using database-level transaction tracking
    console.log(`🔐 Checking for existing renewal transaction for customer ${customerId}`);
    
    const { data: transactionData, error: transactionError } = await supabaseClient.rpc(
      'get_or_create_renewal_transaction',
      {
        p_customer_id: customerId,
        p_reseller_id: user.id,
        p_plan_duration: planDuration,
        p_credits_required: creditsRequired
      }
    );

    if (transactionError) {
      console.error('❌ Failed to create/check renewal transaction:', transactionError);
      return new Response(
        JSON.stringify({ 
          error: 'Failed to initialize renewal transaction. Please try again.',
          code: 'TRANSACTION_ERROR',
          details: transactionError.message
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const transactionResult = transactionData?.[0];
    if (!transactionResult) {
      console.error('❌ No transaction result returned');
      return new Response(
        JSON.stringify({ error: 'Failed to initialize renewal transaction' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // If this is not a new transaction, check the status
    if (!transactionResult.is_new_transaction) {
      if (transactionResult.current_status === 'completed') {
        console.log('🛑 Duplicate renewal detected via transaction tracking. Already completed.');
        return new Response(
          JSON.stringify({
            success: true,
            message: 'Renewal already processed successfully',
            alreadyProcessed: true,
            accountsRenewed: groupCustomers.length,
            creditsUsed: creditsRequired,
            transactionId: transactionResult.transaction_id
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } else if (transactionResult.current_status === 'pending') {
        console.log('🛑 Duplicate renewal request detected while transaction is still pending.');
        return new Response(
          JSON.stringify({
            success: false,
            error: 'A renewal for this customer is already in progress. Please wait and try again if needed.',
            code: 'RENEWAL_IN_PROGRESS',
            transactionId: transactionResult.transaction_id
          }),
          { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    const transactionId = transactionResult.transaction_id;
    console.log(`✅ Created new renewal transaction: ${transactionId}`);

    // Check if reseller has enough credits
    if (reseller.credits < creditsRequired) {
      console.log(`❌ Insufficient credits. Required: ${creditsRequired}, Available: ${reseller.credits}`);
      return new Response(
        JSON.stringify({ 
          error: `Insufficient credits. You need ${creditsRequired} credits but only have ${reseller.credits}.`,
          code: 'INSUFFICIENT_CREDITS',
          required: creditsRequired, 
          available: reseller.credits 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`✅ Credit check passed: ${reseller.credits} credits available, ${creditsRequired} required`);

    // Separate customers into MAG and M3U types
    const magCustomers = groupCustomers.filter(c => c.mac_address);
    const m3uCustomers = groupCustomers.filter(c => !c.mac_address);

    console.log(`📊 Customer Group Breakdown:`);
    console.log(`   - Total accounts in group: ${groupCustomers.length}`);
    console.log(`   - MAG devices: ${magCustomers.length}`);
    console.log(`   - M3U accounts: ${m3uCustomers.length}`);
    console.log(`   - Plan duration: ${planDuration} months`);
    console.log(`   - Credits required: ${creditsRequired}`);
    console.log(`   - Transaction ID: ${transactionId}`);

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
    console.log(`\n🔄 Starting MAG Customer Renewals (${magCustomers.length} accounts)...`);
    for (const customer of magCustomers) {
      try {
        console.log(`   → Renewing MAG: ${customer.name} | MAC: ${customer.mac_address} | Customer ID: ${customer.id}`);
        
        const { data, error } = await clientWithAuth.functions.invoke('renew-mag-user', {
          body: {
            customerId: customer.id,
            planDuration: planDuration
          }
        });

        if (error || !data?.success) {
          const errorMsg = error?.message || data?.error || 'Unknown error';
          console.error(`   ❌ FAILED: ${customer.name} - ${errorMsg}`);
          renewalResults.push({
            account: customer as CustomerAccount,
            success: false,
            error: errorMsg
          });
        } else {
          console.log(`   ✅ SUCCESS: ${customer.name}`);
          renewalResults.push({
            account: customer as CustomerAccount,
            success: true
          });
        }
      } catch (error) {
        console.error(`   ❌ EXCEPTION: ${customer.name} - ${error.message}`);
        renewalResults.push({
          account: customer as CustomerAccount,
          success: false,
          error: error.message
        });
      }
    }

    // Renew M3U customers based on provider
    console.log(`\n🔄 Starting M3U Customer Renewals (${m3uCustomers.length} accounts)...`);
    for (const customer of m3uCustomers) {
      try {
        const provider = customer.provider || '8k';
        const functionName = provider === 'trex' ? 'renew-trex-user' : 'renew-iptv-user';
        
        console.log(`   → Renewing ${provider.toUpperCase()}: ${customer.name} | Username: ${customer.username} | Customer ID: ${customer.id}`);
        
        const { data, error } = await clientWithAuth.functions.invoke(functionName, {
          body: {
            customerId: customer.id,
            planDuration: planDuration
          }
        });

        if (error || !data?.success) {
          const errorMsg = error?.message || data?.error || 'Unknown error';
          console.error(`   ❌ FAILED: ${customer.name} - ${errorMsg}`);
          renewalResults.push({
            account: customer as CustomerAccount,
            success: false,
            error: errorMsg
          });
        } else {
          console.log(`   ✅ SUCCESS: ${customer.name}`);
          renewalResults.push({
            account: customer as CustomerAccount,
            success: true
          });
        }
      } catch (error) {
        const provider = customer.provider || '8k';
        console.error(`   ❌ EXCEPTION: ${customer.name} - ${error.message}`);
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

    console.log(`\n📊 Renewal Results Summary:`);
    console.log(`   - Total accounts: ${renewalResults.length}`);
    console.log(`   - Successful: ${successfulRenewals}`);
    console.log(`   - Failed: ${failedRenewals.length}`);
    console.log(`   - Transaction ID: ${transactionId}`);
    
    if (failedRenewals.length > 0) {
      console.error(`\n❌ RENEWAL INCOMPLETE - Some accounts failed to renew`);
      console.error(`Failed accounts:`);
      failedRenewals.forEach(f => {
        console.error(`   - ${f.account.name} (ID: ${f.account.id}): ${f.error}`);
      });
    }

    // Update database with consolidated results - only if all renewals succeeded
    if (successfulRenewals === renewalResults.length) {
      try {
        // Use the existing database function to update all accounts and deduct credits
        const { data: dbResult, error: dbError } = await supabaseClient.rpc('renew_customer_group', {
          customer_id_param: customerId,
          duration_months: planDuration,
          reseller_id_param: user.id
        });

        if (dbError || !dbResult?.[0]?.success) {
          console.error('❌ Database update failed:', dbError || dbResult?.[0]?.error_message);
          
          // Mark transaction as failed
          const { error: failError } = await supabaseClient.rpc('fail_renewal_transaction', {
            p_transaction_id: transactionId,
            p_reason: `Database update failed: ${dbError?.message || dbResult?.[0]?.error_message}`
          });
          
          if (failError) {
            console.error('❌ Failed to mark transaction as failed:', failError);
          }
          
          return new Response(
            JSON.stringify({ 
              error: 'API renewals succeeded but database update failed',
              details: dbError?.message || dbResult?.[0]?.error_message,
              renewalResults: renewalResults,
              transactionId: transactionId
            }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Mark transaction as completed
        const { error: completeError } = await supabaseClient.rpc('complete_renewal_transaction', {
          p_transaction_id: transactionId
        });
        
        if (completeError) {
          console.error('❌ Failed to mark transaction as completed:', completeError);
          // Don't fail the request, just log the error
        }

        console.log(`✅ Group renewal completed successfully: ${successfulRenewals} accounts renewed`);

        return new Response(
          JSON.stringify({ 
            success: true,
            message: `Successfully renewed ${successfulRenewals} accounts for ${planDuration} months`,
            accountsRenewed: successfulRenewals,
            creditsUsed: creditsRequired,
            renewalResults: renewalResults,
            transactionId: transactionId
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } catch (dbUpdateError) {
        console.error('💥 Exception during database update:', dbUpdateError);
        
        // Mark transaction as failed
        try {
          await supabaseClient.rpc('fail_renewal_transaction', {
            p_transaction_id: transactionId,
            p_reason: `Exception during database update: ${dbUpdateError.message}`
          });
        } catch (failError) {
          console.error('❌ Failed to mark transaction as failed after exception:', failError);
        }
        
        return new Response(
          JSON.stringify({ 
            error: 'Database update exception occurred',
            details: dbUpdateError.message,
            renewalResults: renewalResults,
            transactionId: transactionId
          }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    } else {
      // Partial failure - mark transaction as failed
      const { error: failError } = await supabaseClient.rpc('fail_renewal_transaction', {
        p_transaction_id: transactionId,
        p_reason: `Partial renewal failure: ${successfulRenewals}/${renewalResults.length} accounts renewed`
      });
      
      if (failError) {
        console.error('❌ Failed to mark transaction as failed:', failError);
      }
      
      console.error(`❌ Partial renewal failure: ${successfulRenewals}/${renewalResults.length} accounts renewed`);
      
      return new Response(
        JSON.stringify({ 
          success: false,
          error: `Only ${successfulRenewals} out of ${renewalResults.length} accounts were renewed successfully`,
          accountsRenewed: successfulRenewals,
          totalAccounts: renewalResults.length,
          renewalResults: renewalResults,
          transactionId: transactionId
        }),
        { status: 207, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

  } catch (error) {
    console.error('💥 Unexpected error in renew-customer-group function:', error);
    
    // Try to fail the transaction if we have a transaction ID
    try {
      // We need to extract transactionId from the scope if it exists
      // For now, we'll log this as a general failure
      console.log('🔄 Attempting to clean up any pending transactions due to unexpected error');
    } catch (cleanupError) {
      console.error('❌ Failed to cleanup transaction after error:', cleanupError);
    }
    
    // Provide more specific error messages based on error type
    let errorMessage = 'An unexpected error occurred while processing the renewal.';
    let errorCode = 'INTERNAL_ERROR';
    
    if (error.message?.includes('network') || error.message?.includes('fetch')) {
      errorMessage = 'Network connectivity issue. Please try again.';
      errorCode = 'NETWORK_ERROR';
    } else if (error.message?.includes('timeout')) {
      errorMessage = 'Request timed out. Please try again.';
      errorCode = 'TIMEOUT_ERROR';
    } else if (error.message?.includes('database') || error.message?.includes('sql')) {
      errorMessage = 'Database error. Please contact support if this persists.';
      errorCode = 'DATABASE_ERROR';
    }
    
    return new Response(
      JSON.stringify({ 
        error: errorMessage,
        code: errorCode,
        details: error.message,
        timestamp: new Date().toISOString()
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

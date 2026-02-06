
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface RenewGroupRequest {
  customerId: string;
  planDuration: number;
  serviceCall?: boolean;  // Skip JWT verification for internal service calls (e.g., webhook)
  resellerId?: string;    // Required when serviceCall=true, already validated by caller
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

// Helper function to verify a connection exists in the provider panel
async function verifyConnectionExists(
  creds: { username?: string; password?: string; mac_address?: string },
  provider: string
): Promise<{ exists: boolean; error?: string }> {
  try {
    let apiKey: string | undefined;
    let panelUrl: string | undefined;

    // Trex-only mode: Always use Trex credentials
    apiKey = Deno.env.get('TREX_API_KEY');
    panelUrl = Deno.env.get('TREX_PANEL_URL');

    if (!apiKey || !panelUrl) {
      return { exists: false, error: `Provider ${provider} not configured` };
    }

    const hasUser = creds.username?.trim();
    const hasPass = creds.password?.trim();
    const hasMac = creds.mac_address?.trim();

    if (!hasUser && !hasPass && !hasMac) {
      return { exists: false, error: 'No credentials to verify' };
    }

    let verifyUrl = `${panelUrl}?action=device_info&api_key=${apiKey}`;
    if (hasUser && hasPass) {
      verifyUrl += `&username=${encodeURIComponent(hasUser)}&password=${encodeURIComponent(hasPass)}`;
    } else if (hasMac) {
      verifyUrl += `&mac=${encodeURIComponent(hasMac)}`;
    }

    console.log(`🔍 Verifying connection exists: ${hasUser || hasMac}`);

    const response = await fetch(verifyUrl, {
      method: 'GET',
      headers: { 'User-Agent': 'IPTV-Management-System/1.0' },
      signal: AbortSignal.timeout(15000),
    });

    const responseText = await response.text();

    if (!response.ok) {
      return { exists: false, error: `HTTP ${response.status}` };
    }

    try {
      const data = JSON.parse(responseText);
      
      // Check various success indicators
      if (data.status === 'true' || data.status === true || data.success === true || data.user_info) {
        console.log(`✅ Connection verified: ${hasUser || hasMac}`);
        return { exists: true };
      }
      
      console.log(`❌ Connection not found: ${hasUser || hasMac}`);
      return { exists: false, error: 'Account not found in provider panel' };
    } catch {
      // Non-JSON response
      if (responseText.toLowerCase().includes('error') || 
          responseText.toLowerCase().includes('not found') ||
          responseText.toLowerCase().includes('invalid')) {
        return { exists: false, error: 'Account not found in provider panel' };
      }
      // Can't verify - treat as not existing for safety
      return { exists: false, error: 'Could not verify account existence' };
    }
  } catch (error) {
    console.error(`❌ Verification error:`, error.message);
    return { exists: false, error: error.message };
  }
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

    const { customerId, planDuration, serviceCall = false, resellerId: providedResellerId }: RenewGroupRequest = await req.json();

    // Determine authentication context
    let verifiedUserId: string | null = null;
    let isServiceCall = false;
    let authHeader: string | null = null;

    if (!serviceCall) {
      // Normal path: Verify JWT token
      authHeader = req.headers.get('Authorization');
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

      verifiedUserId = user.id;
      console.log(`✅ User authenticated: ${user.email} (ID: ${user.id})`);
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

    // Authorization differs for service calls vs user calls
    let isAdmin = false;
    let userEmail = 'service-call';

    if (!isServiceCall) {
      // Fetch user profile for logging
      const { data: userProfile, error: profileError } = await supabaseClient
        .from('profiles')
        .select('id, name, email')
        .eq('id', verifiedUserId)
        .single();

      if (profileError || !userProfile) {
        console.error('❌ Failed to fetch user profile:', profileError);
        return new Response(
          JSON.stringify({ error: 'Failed to verify user permissions' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      userEmail = userProfile.email;

      // Check if user is admin using secure function
      const { data: isAdminData, error: roleError } = await supabaseClient
        .rpc('has_role', { 
          _user_id: verifiedUserId, 
          _role: 'admin' 
        });

      if (roleError) {
        console.error('❌ Failed to check user role:', roleError);
        return new Response(
          JSON.stringify({ error: 'Failed to verify user permissions' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      isAdmin = isAdminData === true;

      // Authorization: Admin can renew any customer, resellers can only renew their own
      if (!isAdmin && primaryCustomer.reseller_id !== verifiedUserId) {
        console.error(`❌ Authorization failed: User ${verifiedUserId} (${userEmail}) attempted to renew customer ${customerId} owned by ${primaryCustomer.reseller_id}`);
        
        return new Response(
          JSON.stringify({ 
            error: 'You do not have permission to renew this customer subscription.',
            code: 'UNAUTHORIZED_CUSTOMER',
            details: `Customer belongs to a different reseller`
          }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log(`✅ Authorization passed: User ${userEmail} ${isAdmin ? '(ADMIN)' : '(RESELLER)'} can renew customer ${primaryCustomer.name}`);
    } else {
      // Service call - verify the provided resellerId matches the customer's reseller
      if (primaryCustomer.reseller_id !== providedResellerId) {
        console.error(`❌ Service call reseller mismatch: provided ${providedResellerId} != customer ${primaryCustomer.reseller_id}`);
        return new Response(
          JSON.stringify({ error: 'Reseller ID mismatch' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      console.log(`✅ Service call authorized for reseller: ${providedResellerId}`);
    }

    // Set admin override flag for credit bypass
    const isAdminOverride = isAdmin;

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
      .select('credits, provider, name')
      .eq('id', primaryCustomer.reseller_id)
      .single();

    if (resellerError || !reseller) {
      console.error('Reseller not found:', resellerError);
      return new Response(
        JSON.stringify({ error: 'Reseller not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const creditsRequired = groupCustomers.length * planDuration;

    // ========================================
    // PREFLIGHT VALIDATION: Check ALL connections exist in provider panel BEFORE renewing
    // ========================================
    console.log(`\n🔍 PREFLIGHT VALIDATION: Verifying all ${groupCustomers.length} connections exist in provider panel...`);
    
    const missingConnections: Array<{ name: string; username?: string; mac_address?: string; error: string }> = [];
    
    for (const customer of groupCustomers) {
      const provider = customer.provider || 'trex';
      const connectionList = customer.connection_list;
      const hasConnectionList = Array.isArray(connectionList) && connectionList.length > 0;
      
      if (hasConnectionList) {
        // CONSOLIDATED CUSTOMER: Verify each connection in the connection_list
        console.log(`📋 Customer ${customer.name} has ${connectionList.length} connection(s) in connection_list`);
        
        for (const conn of connectionList) {
          const verification = await verifyConnectionExists(
            { 
              username: conn.username, 
              password: conn.password, 
              mac_address: conn.mac_address 
            },
            provider
          );
          
          if (!verification.exists) {
            console.log(`❌ PREFLIGHT FAILED: ${customer.name} connection ${conn.connection_number || '?'}`);
            missingConnections.push({
              name: `${customer.name} (Connection ${conn.connection_number || '?'})`,
              username: conn.username,
              mac_address: conn.mac_address,
              error: verification.error || 'Account not found in provider panel'
            });
          } else {
            console.log(`✅ PREFLIGHT PASSED: ${customer.name} connection ${conn.connection_number || '?'}`);
          }
        }
      } else {
        // LEGACY SINGLE-CONNECTION: Use top-level fields
        const verification = await verifyConnectionExists(
          { 
            username: customer.username, 
            password: customer.password, 
            mac_address: customer.mac_address 
          },
          provider
        );
        
        if (!verification.exists) {
          console.log(`❌ PREFLIGHT FAILED: ${customer.name} does not exist in ${provider} panel`);
          missingConnections.push({
            name: customer.name,
            username: customer.username,
            mac_address: customer.mac_address,
            error: verification.error || 'Account not found in provider panel'
          });
        } else {
          console.log(`✅ PREFLIGHT PASSED: ${customer.name} exists in panel`);
        }
      }
    }
    
    // If any connections are missing, BLOCK the renewal entirely
    if (missingConnections.length > 0) {
      console.error(`\n🛑 RENEWAL BLOCKED: ${missingConnections.length} of ${groupCustomers.length} connections do not exist in provider panel`);
      console.error('Missing connections:', missingConnections.map(c => c.name).join(', '));
      
      return new Response(
        JSON.stringify({
          success: false,
          error: `Renewal blocked: ${missingConnections.length} connection(s) do not exist in the provider panel. Please contact support to fix these accounts before renewing.`,
          code: 'MISSING_CONNECTIONS',
          missingConnections: missingConnections,
          totalConnections: groupCustomers.length,
          details: 'These accounts may have been created incorrectly or deleted from the provider panel. Renewal cannot proceed until all connections are valid.'
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    console.log(`✅ PREFLIGHT COMPLETE: All ${groupCustomers.length} connections verified in provider panel\n`);

    // Enhanced idempotency protection using database-level transaction tracking
    console.log(`🔐 Checking for existing renewal transaction for customer ${customerId}`);
    
    const { data: transactionData, error: transactionError } = await supabaseClient.rpc(
      'get_or_create_renewal_transaction',
      {
        p_customer_id: customerId,
        p_reseller_id: primaryCustomer.reseller_id,
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

    // Only check credits if NOT admin
    if (!isAdminOverride) {
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
    } else {
      console.log(`⚡ ADMIN OVERRIDE: Bypassing credit check for admin ${userEmail}`);
    }

    // Helper function to determine if device is MAG type based on device_type
    // This is more reliable than checking mac_address since placeholder MACs exist
    const isMagDevice = (deviceType: string | null | undefined): boolean => {
      if (!deviceType) return false;
      const dt = deviceType.toLowerCase();
      return dt.includes('mag') || dt.includes('stb');
    };

    // Separate customers into MAG and M3U types based on device_type
    const magCustomers = groupCustomers.filter(c => isMagDevice(c.device_type));
    const m3uCustomers = groupCustomers.filter(c => !isMagDevice(c.device_type));

    console.log(`📊 Customer Group Breakdown:`);
    console.log(`   - Total accounts in group: ${groupCustomers.length}`);
    console.log(`   - MAG devices: ${magCustomers.length}`);
    console.log(`   - M3U accounts: ${m3uCustomers.length}`);
    console.log(`   - Plan duration: ${planDuration} months`);
    console.log(`   - Credits required: ${creditsRequired}`);
    console.log(`   - Transaction ID: ${transactionId}`);

    let renewalResults: Array<{account: CustomerAccount, success: boolean, error?: string}> = [];

    // Create a client for sub-function invocations
    // For service calls, use service role key; for user calls, forward auth header
    const clientWithAuth = isServiceCall
      ? supabaseClient  // Service role client - already has proper auth
      : createClient(
          Deno.env.get('SUPABASE_URL') ?? '',
          Deno.env.get('SUPABASE_ANON_KEY') ?? '',
          {
            global: {
              headers: {
                Authorization: authHeader!, // Forward the original auth header
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
            planDuration: planDuration,
            ...(isServiceCall ? { serviceCall: true, resellerId: providedResellerId } : {})
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
        const provider = customer.provider || 'trex';
        const functionName = 'renew-trex-user'; // Trex-only mode
        
        console.log(`   → Renewing ${provider.toUpperCase()}: ${customer.name} | Username: ${customer.username} | Customer ID: ${customer.id}`);
        
        const { data, error } = await clientWithAuth.functions.invoke(functionName, {
          body: {
            customerId: customer.id,
            planDuration: planDuration,
            ...(isServiceCall ? { serviceCall: true, resellerId: providedResellerId } : {})
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
        const provider = customer.provider || 'trex';
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
        if (isAdminOverride) {
          // ADMIN PATH: Update customers directly without calling renew_customer_group function
          console.log(`⚡ ADMIN: Updating customer expiration dates directly (no credit deduction)`);
          
          // Update all customers in the group
          const newExpirationDate = new Date();
          newExpirationDate.setMonth(newExpirationDate.getMonth() + planDuration);
          
          const { error: updateError } = await supabaseClient
            .from('customers')
            .update({
              expiration_date: newExpirationDate.toISOString().split('T')[0],
              plan_duration: planDuration,
              status: 'active'
            })
            .eq('customer_group', primaryCustomer.customer_group)
            .neq('status', 'cancelled');
          
          if (updateError) {
            console.error('❌ Admin database update failed:', updateError);
            
            const { error: failError } = await supabaseClient.rpc('fail_renewal_transaction', {
              p_transaction_id: transactionId,
              p_reason: `Admin update failed: ${updateError.message}`
            });
            
            if (failError) {
              console.error('❌ Failed to mark transaction as failed:', failError);
            }
            
            return new Response(
              JSON.stringify({ 
                error: 'API renewals succeeded but database update failed',
                details: updateError.message,
                renewalResults: renewalResults,
                transactionId: transactionId
              }),
              { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }
          
          // Log admin action (no credit deduction)
          await supabaseClient
            .from('credit_logs')
            .insert({
              reseller_id: primaryCustomer.reseller_id,
              action: 'addition',
              credits_used: 0,
              customer_name: primaryCustomer.name,
              customer_id: customerId,
              notes: `ADMIN ACTION: Renewed by admin ${userEmail} without credit charge (${planDuration} months, ${groupCustomers.length} accounts)`
            });
          
          console.log(`✅ Admin renewal completed successfully (no credits charged to reseller)`);
          
        } else {
          // RESELLER PATH: Use the database function to deduct credits normally
          const { data: dbResult, error: dbError } = await supabaseClient.rpc('renew_customer_group', {
            customer_id_param: customerId,
            duration_months: planDuration,
            reseller_id_param: primaryCustomer.reseller_id
          });

          if (dbError || !dbResult?.[0]?.success) {
            console.error('❌ Database update failed:', dbError || dbResult?.[0]?.error_message);
            
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
          
          console.log(`✅ Reseller renewal: Credits deducted from ${reseller.name}`);
        }

        // Mark transaction as completed
        const { error: completeError } = await supabaseClient.rpc('complete_renewal_transaction', {
          p_transaction_id: transactionId
        });
        
        if (completeError) {
          console.error('❌ Failed to mark transaction as completed:', completeError);
          // Don't fail the request, just log the error
        }

        console.log(`✅ Group renewal completed: ${successfulRenewals} accounts renewed`);

        return new Response(
          JSON.stringify({ 
            success: true,
            message: `Successfully renewed ${successfulRenewals} accounts for ${planDuration} months${isAdminOverride ? ' (Admin - No Credit Charge)' : ''}`,
            accountsRenewed: successfulRenewals,
            creditsUsed: isAdminOverride ? 0 : creditsRequired,
            adminOverride: isAdminOverride,
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

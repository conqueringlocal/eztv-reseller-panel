
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import Stripe from "https://esm.sh/stripe@13.10.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders, status: 204 });
  }

  try {
    console.log('=== VERIFY CHECKOUT FUNCTION START ===');
    
    const { sessionId } = await req.json();
    console.log('Session ID received:', sessionId);

    if (!sessionId) {
      console.error('No session ID provided');
      return new Response(JSON.stringify({ error: "No session ID provided" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    // Get the authorization header from the request
    const authHeader = req.headers.get("Authorization");
    console.log('Authorization header present:', !!authHeader);
    
    if (!authHeader) {
      console.error('No authorization header found');
      return new Response(JSON.stringify({ error: "No authorization header" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 401,
      });
    }

    // Extract the token from the authorization header
    const token = authHeader.replace('Bearer ', '');
    console.log('Token extracted, length:', token.length);

    // Create a Supabase client for user authentication
    const supabaseAuth = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? ""
    );

    console.log('Getting user from token...');
    
    // Get the user from the auth token
    const { data: { user }, error: userError } = await supabaseAuth.auth.getUser(token);
    
    if (userError) {
      console.error('Error getting user:', userError);
      return new Response(JSON.stringify({ error: "Authentication failed: " + userError.message }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 401,
      });
    }
    
    if (!user) {
      console.error('No user found from token');
      return new Response(JSON.stringify({ error: "User not authenticated" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 401,
      });
    }

    console.log('User authenticated successfully:', user.id, user.email);

    // Create a second Supabase client with service role key (for writing to the database)
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      {
        auth: {
          persistSession: false,
        },
      }
    );

    // Initialize Stripe
    const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeSecretKey) {
      console.error('Stripe secret key not configured');
      return new Response(JSON.stringify({ error: "Stripe not configured" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      });
    }

    const stripe = new Stripe(stripeSecretKey, {
      apiVersion: "2023-10-16",
    });

    console.log('Retrieving Stripe session...');

    // Retrieve the session to verify it
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    console.log('Session retrieved. Status:', session.status, 'Payment status:', session.payment_status);

    // Verify that the session was completed and belongs to the current user
    if (
      session.payment_status !== "paid" ||
      session.status !== "complete" ||
      session.client_reference_id !== user.id
    ) {
      console.error('Invalid session verification:', {
        payment_status: session.payment_status,
        status: session.status,
        client_reference_id: session.client_reference_id,
        user_id: user.id
      });
      return new Response(JSON.stringify({ error: "Invalid or unpaid session" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    // Get the credits amount from metadata
    const creditsToAdd = parseInt(session.metadata?.credits || "0", 10);
    console.log('Credits to add:', creditsToAdd);
    
    if (creditsToAdd <= 0) {
      console.error('Invalid credit amount:', creditsToAdd);
      return new Response(JSON.stringify({ error: "Invalid credit amount" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    // Check if this payment has already been processed
    console.log('Checking if payment already processed...');
    const { data: existingLog, error: logCheckError } = await adminClient
      .from("credit_logs")
      .select("id")
      .ilike("notes", `%${sessionId}%`)
      .single();

    if (logCheckError && logCheckError.code !== 'PGRST116') { // PGRST116 is "not found" error
      console.error('Error checking existing logs:', logCheckError);
      return new Response(JSON.stringify({ error: "Database error" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      });
    }

    if (existingLog) {
      console.log('Payment already processed, returning success');
      return new Response(JSON.stringify({ 
        success: true, 
        message: "Payment already processed",
        credits: creditsToAdd
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    // Update the user's credit balance
    console.log('Fetching current profile...');
    const { data: profile, error: profileError } = await adminClient
      .from("profiles")
      .select("credits")
      .eq("id", user.id)
      .single();

    if (profileError) {
      console.error('Error fetching profile:', profileError);
      return new Response(JSON.stringify({ error: "Failed to fetch profile" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      });
    }

    const newCreditBalance = (profile.credits || 0) + creditsToAdd;
    console.log('Updating credits from', profile.credits, 'to', newCreditBalance);

    // Update the user's credits
    const { error: updateError } = await adminClient
      .from("profiles")
      .update({ credits: newCreditBalance })
      .eq("id", user.id);

    if (updateError) {
      console.error('Error updating credits:', updateError);
      return new Response(JSON.stringify({ error: "Failed to update credits" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      });
    }

    // Log the transaction with revenue amount
    console.log('Logging credit transaction...');
    const revenueAmount = (session.amount_total || 0) / 100; // Convert cents to dollars
    
    const { error: logError } = await adminClient
      .from("credit_logs")
      .insert({
        reseller_id: user.id,
        action: "addition",
        credits_used: creditsToAdd,
        revenue_amount: revenueAmount,
        notes: `Credits purchased via Stripe. Session ID: ${sessionId}`,
      });

    if (logError) {
      console.error("Error logging credit purchase:", logError);
      // Continue anyway, the credits were already added
    }

    console.log('=== VERIFY CHECKOUT FUNCTION SUCCESS ===');

    return new Response(JSON.stringify({ 
      success: true, 
      credits: creditsToAdd,
      newBalance: newCreditBalance
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    console.error('=== VERIFY CHECKOUT FUNCTION ERROR ===');
    console.error('Error details:', error);
    console.error('Error message:', error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});

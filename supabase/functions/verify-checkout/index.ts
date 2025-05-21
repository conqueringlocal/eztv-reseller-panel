
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
    const { sessionId } = await req.json();

    if (!sessionId) {
      return new Response(JSON.stringify({ error: "No session ID provided" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    // Get the authorization header from the request
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No authorization header" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 401,
      });
    }

    // Create a Supabase client with the auth token (for user validation)
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      {
        global: {
          headers: {
            Authorization: authHeader,
          },
        },
      }
    );

    // Get the user from the auth token
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 401,
      });
    }

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
    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2023-10-16",
    });

    // Retrieve the session to verify it
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    // Verify that the session was completed and belongs to the current user
    if (
      session.payment_status !== "paid" ||
      session.status !== "complete" ||
      session.client_reference_id !== user.id
    ) {
      return new Response(JSON.stringify({ error: "Invalid or unpaid session" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    // Get the credits amount from metadata
    const creditsToAdd = parseInt(session.metadata?.credits || "0", 10);
    if (creditsToAdd <= 0) {
      return new Response(JSON.stringify({ error: "Invalid credit amount" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    // Update the user's credit balance
    const { data: profile, error: profileError } = await adminClient
      .from("profiles")
      .select("credits")
      .eq("id", user.id)
      .single();

    if (profileError) {
      return new Response(JSON.stringify({ error: "Failed to fetch profile" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      });
    }

    const newCreditBalance = (profile.credits || 0) + creditsToAdd;

    // Update the user's credits
    const { error: updateError } = await adminClient
      .from("profiles")
      .update({ credits: newCreditBalance })
      .eq("id", user.id);

    if (updateError) {
      return new Response(JSON.stringify({ error: "Failed to update credits" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      });
    }

    // Log the transaction
    const { error: logError } = await adminClient
      .from("credit_logs")
      .insert({
        reseller_id: user.id,
        action: "addition",
        credits_used: creditsToAdd,
        notes: `Credits purchased via Stripe. Session ID: ${sessionId}`,
      });

    if (logError) {
      console.error("Error logging credit purchase:", logError);
      // Continue anyway, the credits were already added
    }

    return new Response(JSON.stringify({ 
      success: true, 
      credits: creditsToAdd,
      newBalance: newCreditBalance
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});

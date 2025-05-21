
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import Stripe from "https://esm.sh/stripe@13.10.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// This is a public endpoint for Stripe webhooks
serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders, status: 204 });
  }

  try {
    // Get the request body (raw string)
    const body = await req.text();
    const signature = req.headers.get("stripe-signature");

    if (!signature) {
      return new Response(JSON.stringify({ error: "No stripe signature header" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    // Initialize Stripe
    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2023-10-16",
    });
    
    const endpointSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET") || "";
    
    // Verify the event using the signature and secret
    let event;
    try {
      event = stripe.webhooks.constructEvent(body, signature, endpointSecret);
    } catch (err) {
      return new Response(JSON.stringify({ error: `Webhook Error: ${err.message}` }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    // Create a Supabase client with service role key
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      {
        auth: {
          persistSession: false,
        },
      }
    );

    // Handle the checkout.session.completed event
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      
      // Make sure payment is successful and session is completed
      if (session.payment_status !== "paid" || session.status !== "complete") {
        return new Response(JSON.stringify({ 
          received: true, 
          message: "Ignoring incomplete session" 
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        });
      }
      
      // Get the user ID from the client_reference_id
      const userId = session.client_reference_id;
      
      if (!userId) {
        return new Response(JSON.stringify({ 
          received: true, 
          message: "No user ID in client_reference_id" 
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        });
      }

      // Get credits from metadata
      const creditsToAdd = parseInt(session.metadata?.credits || "0", 10);
      
      if (creditsToAdd <= 0) {
        return new Response(JSON.stringify({ 
          received: true, 
          message: "Invalid credits amount" 
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        });
      }

      // Get the user's current credits
      const { data: profile, error: profileError } = await supabaseAdmin
        .from("profiles")
        .select("credits")
        .eq("id", userId)
        .single();

      if (profileError) {
        console.error("Error fetching profile:", profileError);
        return new Response(JSON.stringify({ error: "Failed to fetch user profile" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 500,
        });
      }

      // Calculate new credit balance
      const newCreditBalance = (profile.credits || 0) + creditsToAdd;

      // Update the user's credits
      const { error: updateError } = await supabaseAdmin
        .from("profiles")
        .update({ credits: newCreditBalance })
        .eq("id", userId);

      if (updateError) {
        console.error("Error updating credits:", updateError);
        return new Response(JSON.stringify({ error: "Failed to update credits" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 500,
        });
      }

      // Log the transaction
      const { error: logError } = await supabaseAdmin
        .from("credit_logs")
        .insert({
          reseller_id: userId,
          action: "addition",
          credits_used: creditsToAdd,
          notes: `Credits purchased via Stripe. Session ID: ${session.id}`,
        });

      if (logError) {
        console.error("Error logging credits transaction:", logError);
        // Continue anyway, the credits were already added
      }
      
      console.log(`Added ${creditsToAdd} credits to user ${userId}`);
    }

    // Return a 200 response to acknowledge receipt of the event
    return new Response(JSON.stringify({ received: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    console.error("Error processing webhook:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});


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
    console.log('=== CREATE CHECKOUT FUNCTION START ===');
    
    // Get the authorization header from the request
    const authHeader = req.headers.get("Authorization");
    console.log('Authorization header present:', !!authHeader);
    
    if (!authHeader) {
      console.error('No authorization header found');
      return new Response(JSON.stringify({ error: "No authorization header provided" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 401,
      });
    }

    // Extract the token from the authorization header
    const token = authHeader.replace('Bearer ', '');
    console.log('Token extracted, length:', token.length);

    // Create a Supabase client with standard configuration
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? ""
    );

    console.log('Supabase client created, getting user with token...');

    // Get the user from the auth token by passing the token directly
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(token);
    
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

    // Get the request body
    const { priceId } = await req.json();
    console.log('Price ID received:', priceId);

    if (!priceId) {
      return new Response(JSON.stringify({ error: "Price ID is required" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    // Get the user's profile
    console.log('Fetching user profile from database...');
    const { data: profile, error: profileError } = await supabaseClient
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    if (profileError) {
      console.error('Error fetching profile:', profileError);
      return new Response(JSON.stringify({ error: "Failed to fetch user profile: " + profileError.message }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 404,
      });
    }

    if (!profile) {
      console.error('No profile found for user:', user.id);
      return new Response(JSON.stringify({ error: "User profile not found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 404,
      });
    }

    console.log('Profile found for user:', profile.email, 'Role:', profile.role);

    // Credit amounts per price ID
    const creditAmounts: Record<string, number> = {
      "prod_SPTCJTX53FYiCA": 5,
      "prod_SPTDalEPErdJEh": 10,
      "prod_SPTDaHwo44Pq9O": 20,
      "prod_SPTDaXJCOMZ4X7": 50,
    };

    // Validate the price ID
    if (!Object.keys(creditAmounts).includes(priceId)) {
      console.error('Invalid price ID:', priceId);
      return new Response(JSON.stringify({ error: "Invalid price ID: " + priceId }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

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

    console.log('Stripe initialized, creating checkout session...');

    const origin = req.headers.get("origin") || "http://localhost:3000";
    console.log('Origin:', origin);

    // Create a Stripe Checkout session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "payment",
      success_url: `${origin}/reseller/credits?success=true&session_id={CHECKOUT_SESSION_ID}&credits=${creditAmounts[priceId]}`,
      cancel_url: `${origin}/reseller/credits?canceled=true`,
      customer_email: profile.email,
      client_reference_id: user.id,
      metadata: {
        userId: user.id,
        userEmail: profile.email,
        credits: creditAmounts[priceId].toString(),
        priceId,
      },
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
    });

    console.log('Checkout session created successfully:', session.id);
    console.log('Session URL:', session.url);
    console.log('=== CREATE CHECKOUT FUNCTION SUCCESS ===');

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    console.error('=== CREATE CHECKOUT FUNCTION ERROR ===');
    console.error('Error details:', error);
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});

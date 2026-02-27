import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Credit packages with amounts in USD
const creditPackages: Record<string, { credits: number; price: number; name: string }> = {
  "credits_5": { credits: 5, price: 15.00, name: "5 Credits" },
  "credits_10": { credits: 10, price: 30.00, name: "10 Credits" },
  "credits_20": { credits: 20, price: 60.00, name: "20 Credits" },
  "credits_50": { credits: 50, price: 150.00, name: "50 Credits" },
};

async function getPayPalAccessToken(): Promise<string> {
  const clientId = Deno.env.get("PAYPAL_CLIENT_ID");
  const secretKey = Deno.env.get("PAYPAL_SECRET_KEY");

  if (!clientId || !secretKey) {
    throw new Error("PayPal credentials not configured");
  }

  const auth = btoa(`${clientId}:${secretKey}`);
  const response = await fetch("https://api-m.paypal.com/v1/oauth2/token", {
    method: "POST",
    headers: {
      "Authorization": `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("PayPal auth error:", errorText);
    throw new Error("Failed to authenticate with PayPal");
  }

  const data = await response.json();
  return data.access_token;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders, status: 204 });
  }

  try {
    console.log("=== CREATE PAYPAL ORDER START ===");

    // Authenticate user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No authorization header" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 401,
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const supabaseAuth = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? ""
    );

    const { data: { user }, error: userError } = await supabaseAuth.auth.getUser(token);
    if (userError || !user) {
      console.error("Auth error:", userError);
      return new Response(JSON.stringify({ error: "Authentication failed" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 401,
      });
    }

    console.log("User authenticated:", user.id);

    const { packageId } = await req.json();
    console.log("Package ID:", packageId);

    const selectedPackage = creditPackages[packageId];
    if (!selectedPackage) {
      return new Response(JSON.stringify({ error: "Invalid package ID" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    // Get PayPal access token
    const accessToken = await getPayPalAccessToken();

    const origin = req.headers.get("origin") || "https://eztv-reseller-panel.lovable.app";

    // Create PayPal order
    const orderResponse = await fetch("https://api-m.paypal.com/v2/checkout/orders", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        intent: "CAPTURE",
        purchase_units: [
          {
            amount: {
              currency_code: "USD",
              value: selectedPackage.price.toFixed(2),
            },
            description: `${selectedPackage.name} - EZTV Reseller Credits`,
            custom_id: JSON.stringify({
              userId: user.id,
              credits: selectedPackage.credits,
              packageId,
            }),
          },
        ],
        payment_source: {
          paypal: {
            experience_context: {
              payment_method_preference: "IMMEDIATE_PAYMENT_REQUIRED",
              brand_name: "EZTV Club",
              locale: "en-US",
              landing_page: "LOGIN",
              user_action: "PAY_NOW",
              return_url: `${origin}/reseller/credits?paypal_success=true&credits=${selectedPackage.credits}`,
              cancel_url: `${origin}/reseller/credits?canceled=true`,
            },
          },
        },
      }),
    });

    if (!orderResponse.ok) {
      const errorText = await orderResponse.text();
      console.error("PayPal order creation error:", errorText);
      throw new Error("Failed to create PayPal order");
    }

    const orderData = await orderResponse.json();
    console.log("PayPal order created:", orderData.id, "Status:", orderData.status);

    // Find the approval URL
    const approvalLink = orderData.links?.find((link: any) => link.rel === "payer-action" || link.rel === "approve");
    const approvalUrl = approvalLink?.href;

    if (!approvalUrl) {
      console.error("No approval URL found in PayPal response:", JSON.stringify(orderData.links));
      throw new Error("No approval URL returned from PayPal");
    }

    console.log("Approval URL:", approvalUrl);
    console.log("=== CREATE PAYPAL ORDER SUCCESS ===");

    return new Response(JSON.stringify({ 
      orderId: orderData.id, 
      approvalUrl 
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    console.error("=== CREATE PAYPAL ORDER ERROR ===", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});

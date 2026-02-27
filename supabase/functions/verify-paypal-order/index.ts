import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
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
    console.log("=== VERIFY PAYPAL ORDER START ===");

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

    const { orderId } = await req.json();
    console.log("Order ID:", orderId);

    if (!orderId) {
      return new Response(JSON.stringify({ error: "Order ID is required" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    // Check if this order has already been processed
    const { data: existingLog } = await adminClient
      .from("credit_logs")
      .select("id")
      .ilike("notes", `%${orderId}%`)
      .single();

    if (existingLog) {
      console.log("Order already processed, returning success");
      return new Response(JSON.stringify({ 
        success: true, 
        message: "Payment already processed" 
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    // Capture the PayPal order
    const accessToken = await getPayPalAccessToken();
    
    const captureResponse = await fetch(
      `https://api-m.paypal.com/v2/checkout/orders/${orderId}/capture`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (!captureResponse.ok) {
      const errorText = await captureResponse.text();
      console.error("PayPal capture error:", errorText);
      throw new Error("Failed to capture PayPal payment");
    }

    const captureData = await captureResponse.json();
    console.log("Capture status:", captureData.status);

    if (captureData.status !== "COMPLETED") {
      return new Response(JSON.stringify({ error: "Payment not completed" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    // Extract custom data from the order
    const customId = captureData.purchase_units?.[0]?.payments?.captures?.[0]?.custom_id 
      || captureData.purchase_units?.[0]?.custom_id;
    
    let creditsToAdd = 0;
    let orderUserId = "";

    if (customId) {
      try {
        const customData = JSON.parse(customId);
        creditsToAdd = customData.credits || 0;
        orderUserId = customData.userId || "";
      } catch {
        console.error("Failed to parse custom_id:", customId);
      }
    }

    // Verify the order belongs to the authenticated user
    if (orderUserId && orderUserId !== user.id) {
      console.error("User mismatch:", orderUserId, "vs", user.id);
      return new Response(JSON.stringify({ error: "Order does not belong to authenticated user" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 403,
      });
    }

    if (creditsToAdd <= 0) {
      console.error("Invalid credits amount:", creditsToAdd);
      return new Response(JSON.stringify({ error: "Invalid credit amount" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    // Update user credits
    const { data: profile, error: profileError } = await adminClient
      .from("profiles")
      .select("credits")
      .eq("id", user.id)
      .single();

    if (profileError) {
      console.error("Error fetching profile:", profileError);
      throw new Error("Failed to fetch user profile");
    }

    const newBalance = (profile.credits || 0) + creditsToAdd;
    console.log("Updating credits from", profile.credits, "to", newBalance);

    const { error: updateError } = await adminClient
      .from("profiles")
      .update({ credits: newBalance })
      .eq("id", user.id);

    if (updateError) {
      console.error("Error updating credits:", updateError);
      throw new Error("Failed to update credits");
    }

    // Get the revenue amount from the capture
    const capturedAmount = parseFloat(
      captureData.purchase_units?.[0]?.payments?.captures?.[0]?.amount?.value || "0"
    );

    // Log the credit addition
    const { error: logError } = await adminClient
      .from("credit_logs")
      .insert({
        reseller_id: user.id,
        action: "addition",
        credits_used: creditsToAdd,
        revenue_amount: capturedAmount,
        notes: `Credits purchased via PayPal. Order ID: ${orderId}`,
      });

    if (logError) {
      console.error("Error logging credit purchase:", logError);
    }

    console.log("=== VERIFY PAYPAL ORDER SUCCESS ===");

    return new Response(JSON.stringify({
      success: true,
      credits: creditsToAdd,
      newBalance,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    console.error("=== VERIFY PAYPAL ORDER ERROR ===", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});

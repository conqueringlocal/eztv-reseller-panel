// Reseller Credit Monitor Edge Function
// Triggered by cron job or manual admin call to check low credit resellers
// and update Admin HighLevel subaccount for alerts

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import {
  getAdminHighLevelSettings,
  upsertAdminResellerContact,
  updateAdminResellerAlertFields
} from "../_shared/admin-highlevel-api.ts";

const SUPABASE_URL = "https://hddnqgggjjlildufirof.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

// Sanitized logging helper - mask IDs
const maskId = (id: string): string => {
  if (!id || id.length < 8) return '****';
  return `${id.slice(0, 4)}...${id.slice(-4)}`;
};

// Delay helper
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // === DUAL AUTH: CRON_SECRET OR Admin JWT ===
    const cronSecret = req.headers.get("X-CRON-SECRET");
    const expectedCronSecret = Deno.env.get("CRON_SECRET");
    const isCronAuth = cronSecret && cronSecret === expectedCronSecret;

    let isAuthorized = isCronAuth;

    // If not cron auth, check for admin JWT
    if (!isCronAuth) {
      const authHeader = req.headers.get("Authorization");
      
      if (!authHeader?.startsWith("Bearer ")) {
        return new Response(
          JSON.stringify({ error: "Unauthorized" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const token = authHeader.replace("Bearer ", "");
      
      // Use anon client to validate the user's JWT
      const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        global: { headers: { Authorization: `Bearer ${token}` } }
      });
      
      const { data: userData, error: authError } = await supabaseAuth.auth.getUser();
      
      if (authError || !userData?.user) {
        console.log("Invalid JWT token");
        return new Response(
          JSON.stringify({ error: "Invalid token" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Use service role to check admin role
      const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      const { data: isAdmin, error: roleError } = await supabaseAdmin.rpc("has_role", {
        _user_id: userData.user.id,
        _role: "admin"
      });

      if (roleError || !isAdmin) {
        console.log("User is not admin");
        return new Response(
          JSON.stringify({ error: "Admin access required" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      isAuthorized = true;
      console.log("Authorized via admin JWT");
    } else {
      console.log("Authorized via CRON_SECRET");
    }

    if (!isAuthorized) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse request body for dry_run flag
    let dryRun = false;
    try {
      const body = await req.json();
      dryRun = body?.dry_run === true;
    } catch {
      // No body or invalid JSON, default to dry_run=false
    }

    console.log("Starting reseller credit monitor, dry_run:", dryRun);

    // Use service role for all DB operations
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Get Admin HL settings
    const hlSettings = await getAdminHighLevelSettings(supabaseAdmin);
    
    if (!hlSettings) {
      console.log("Admin HL integration not configured or inactive");
      return new Response(
        JSON.stringify({ success: true, disabled: true, dryRun, stats: {} }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Query all resellers
    const { data: resellers, error: resellersError } = await supabaseAdmin
      .from("profiles")
      .select("id, name, email, credits, low_credit_threshold, low_credit_alert_cooldown_hours, last_low_credit_alert_at, admin_highlevel_contact_id")
      .eq("role", "reseller");

    if (resellersError) {
      console.error("Error fetching resellers:", resellersError);
      return new Response(
        JSON.stringify({ error: "Failed to fetch resellers" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Stats tracking
    const stats = {
      scanned: resellers?.length || 0,
      eligible: 0,
      alerted: 0,
      skippedCooldown: 0,
      skippedNoEmail: 0,
      skippedNoCredits: 0,
      skippedAboveThreshold: 0,
      hlFailed: 0,
      contactsCreated: 0,
      contactsUpdated: 0
    };

    console.log("Processing", stats.scanned, "resellers");

    for (const reseller of resellers || []) {
      const threshold = reseller.low_credit_threshold ?? 10;
      const cooldownHours = reseller.low_credit_alert_cooldown_hours ?? 24;
      
      // Check credits null safety
      if (reseller.credits === null || reseller.credits === undefined) {
        stats.skippedNoCredits++;
        continue;
      }

      // Check if credits above threshold
      if (reseller.credits > threshold) {
        stats.skippedAboveThreshold++;
        continue;
      }

      // Check cooldown period
      if (reseller.last_low_credit_alert_at) {
        const lastAlert = new Date(reseller.last_low_credit_alert_at);
        const cooldownEnd = new Date(lastAlert.getTime() + cooldownHours * 60 * 60 * 1000);
        
        if (new Date() < cooldownEnd) {
          stats.skippedCooldown++;
          continue;
        }
      }

      // Check email
      if (!reseller.email) {
        stats.skippedNoEmail++;
        continue;
      }

      // This reseller is eligible for alert
      stats.eligible++;
      console.log("Eligible reseller:", maskId(reseller.id), "credits:", reseller.credits, "threshold:", threshold);

      // If dry run, skip HL calls and DB writes
      if (dryRun) {
        continue;
      }

      // === LIVE MODE: Call HL and update DB ===
      try {
        // Upsert contact in Admin HL
        let contactId = reseller.admin_highlevel_contact_id;
        
        if (!contactId) {
          const upsertResult = await upsertAdminResellerContact(
            hlSettings.private_integration_token,
            hlSettings.location_id,
            { id: reseller.id, name: reseller.name, email: reseller.email }
          );
          
          contactId = upsertResult.contactId;
          
          if (upsertResult.isNew) {
            stats.contactsCreated++;
          }

          // Save contact ID to DB
          if (contactId) {
            await supabaseAdmin
              .from("profiles")
              .update({ admin_highlevel_contact_id: contactId })
              .eq("id", reseller.id);
          }
        }

        if (!contactId) {
          console.log("Failed to get/create HL contact for reseller:", maskId(reseller.id));
          stats.hlFailed++;
          continue;
        }

        // Update HL custom fields
        const updateResult = await updateAdminResellerAlertFields(
          contactId,
          hlSettings.private_integration_token,
          hlSettings.location_id,
          {
            reseller_credit_balance: reseller.credits.toString(),
            reseller_low_credit_threshold: threshold.toString(),
            reseller_credit_alert_reason: "low_credit",
            reseller_credit_alert_triggered_at: new Date().toISOString(),
            reseller_name: reseller.name || undefined
          }
        );

        if (updateResult.success) {
          stats.alerted++;
          stats.contactsUpdated++;

          // Update last_low_credit_alert_at in DB
          await supabaseAdmin
            .from("profiles")
            .update({ last_low_credit_alert_at: new Date().toISOString() })
            .eq("id", reseller.id);

          console.log("Alert sent for reseller:", maskId(reseller.id));
        } else {
          stats.hlFailed++;
          console.log("HL update failed for reseller:", maskId(reseller.id));
        }

        // 150ms delay between HL API calls
        await delay(150);

      } catch (error) {
        console.error("Error processing reseller:", maskId(reseller.id), error);
        stats.hlFailed++;
      }
    }

    console.log("Credit monitor complete, stats:", JSON.stringify(stats));

    return new Response(
      JSON.stringify({
        success: true,
        disabled: false,
        dryRun,
        stats
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Unexpected error in credit monitor:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

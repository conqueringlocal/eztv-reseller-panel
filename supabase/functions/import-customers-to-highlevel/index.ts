import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { rewriteM3uDomain, DEFAULT_M3U_DOMAIN } from '../_shared/m3u-domain.ts';
import { getHighLevelSettings, updateHighLevelContact, HighLevelContactFields } from '../_shared/highlevel-api.ts';

const BATCH_SIZE = 200;

// Delay helper for rate limiting
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Mask contact ID for logging
const maskId = (id: string | null | undefined): string => {
  if (!id) return 'unknown';
  return `${id.slice(0, 4)}...${id.slice(-4)}`;
};

interface ImportRequest {
  reseller_id: string;
  limit?: number;
  dry_run?: boolean;
}

interface ConnectionData {
  username?: string;
  password?: string;
  m3u_url?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { 
      status: 405, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
  const supabaseAuth = createClient(supabaseUrl, anonKey);

  // Auth check - require Authorization header
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { 
      status: 401, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });
  }

  const token = authHeader.replace('Bearer ', '');
  const { data: userData, error: authError } = await supabaseAuth.auth.getUser(token);
  if (authError || !userData?.user) {
    return new Response(JSON.stringify({ error: 'Invalid token' }), { 
      status: 401, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });
  }

  // Admin check via has_role
  const { data: isAdmin, error: roleError } = await supabaseAdmin.rpc('has_role', {
    _user_id: userData.user.id,
    _role: 'admin'
  });
  if (roleError || !isAdmin) {
    return new Response(JSON.stringify({ error: 'Admin access required' }), { 
      status: 403, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });
  }

  // Parse body
  let body: ImportRequest;
  try { 
    body = await req.json(); 
  } catch { 
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { 
      status: 400, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });
  }
  
  const { reseller_id: resellerId, limit, dry_run: dryRun = false } = body;
  
  if (!resellerId) {
    return new Response(JSON.stringify({ error: 'reseller_id is required' }), { 
      status: 400, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });
  }

  console.log('🚀 Starting HighLevel customer import:', { 
    resellerId: maskId(resellerId), 
    limit, 
    dryRun 
  });

  // Load HighLevel settings - REQUIRED
  const hlSettings = await getHighLevelSettings(resellerId);
  const hlEnabled = !!hlSettings?.token && !!hlSettings?.locationId && !!hlSettings?.isActive;
  
  if (!hlEnabled) {
    console.log('❌ HighLevel not configured for reseller');
    return new Response(JSON.stringify({ 
      error: 'HighLevel integration is not configured or not active for this reseller. Please configure the Private Integration Token and Location ID first.' 
    }), { 
      status: 400, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });
  }

  console.log('✅ HighLevel configured, proceeding with import');

  // Load reseller profile for M3U domain override
  const { data: reseller, error: resellerErr } = await supabaseAdmin
    .from('profiles')
    .select('id')
    .eq('id', resellerId)
    .single();

  if (resellerErr || !reseller) {
    return new Response(JSON.stringify({ error: 'Reseller not found' }), { 
      status: 404, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });
  }

  const domainOverride: string | null = null;
  console.log('🔗 M3U domain override:', domainOverride ? 'configured' : 'using default');

  // Counters
  let processed = 0;
  let createdContacts = 0;
  let updatedContacts = 0;
  let skippedNoEmail = 0;
  let duplicateEmailSkipped = 0;
  let updatedDbContactId = 0;
  let hlSynced = 0;
  let hlFailed = 0;

  // Track seen emails for duplicate protection within this import run
  const seenEmails = new Set<string>();

  let from = 0;
  let shouldContinue = true;

  while (shouldContinue) {
    const { data: customers, error: custErr } = await supabaseAdmin
      .from('customers')
      .select('id, reseller_id, highlevel_contact_id, name, email, device_type, expiration_date, username, password, m3u_url, connection_list, total_connections')
      .eq('reseller_id', resellerId)
      .range(from, from + BATCH_SIZE - 1);

    if (custErr) {
      console.error('❌ Failed to load customers batch:', custErr.message);
      return new Response(JSON.stringify({ error: 'Failed to load customers' }), { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }

    if (!customers || customers.length === 0) break;

    console.log(`📦 Processing batch: ${from} to ${from + customers.length - 1}`);

    for (const customer of customers) {
      // Check limit
      if (limit && processed >= limit) {
        shouldContinue = false;
        break;
      }

      processed++;

      // Email normalization
      const email = (customer.email || '').trim().toLowerCase();
      if (!email) {
        skippedNoEmail++;
        console.log(`⏭️ Skipped customer (no email): ${maskId(customer.id)}`);
        continue;
      }

      // Duplicate email protection within this import run
      if (seenEmails.has(email)) {
        duplicateEmailSkipped++;
        console.log(`⏭️ Skipped duplicate email: ${maskId(customer.id)}`);
        continue;
      }
      seenEmails.add(email);

      try {
        // Build connections array (up to 3)
        const connections: ConnectionData[] = [];
        
        if (customer.connection_list && Array.isArray(customer.connection_list) && customer.connection_list.length > 0) {
          // Use connection_list (up to 3 connections)
          const connList = customer.connection_list.slice(0, 3);
          for (const conn of connList) {
            const connRecord = conn as Record<string, unknown>;
            const originalUrl = connRecord?.m3u_url as string | undefined;
            const rewrittenUrl = rewriteM3uDomain(originalUrl, domainOverride, DEFAULT_M3U_DOMAIN);
            connections.push({
              username: connRecord?.username as string | undefined,
              password: connRecord?.password as string | undefined,
              m3u_url: rewrittenUrl
            });
          }
        } else if (customer.username || customer.password || customer.m3u_url) {
          // Use legacy single connection
          const rewrittenUrl = rewriteM3uDomain(customer.m3u_url, domainOverride, DEFAULT_M3U_DOMAIN);
          connections.push({
            username: customer.username,
            password: customer.password,
            m3u_url: rewrittenUrl
          });
        }

        // Calculate total_connections
        const actualCount = Math.max(connections.length, 1);
        const totalConnections = String(Math.min(actualCount, 3));

        // Safe expiration formatting
        const expRaw = customer.expiration_date;
        const serviceExpiration =
          typeof expRaw === 'string'
            ? expRaw.split('T')[0]
            : expRaw instanceof Date
              ? expRaw.toISOString().split('T')[0]
              : '';

        // Resolve HighLevel contact ID
        let contactId = customer.highlevel_contact_id;
        let isNewContact = false;

        if (!contactId) {
          // Parse name for HighLevel
          const nameParts = (customer.name || '').trim().split(/\s+/);
          const firstName = nameParts[0] || 'Customer';
          const lastName = nameParts.slice(1).join(' ') || '';

          // Try upsert first (idempotent)
          await delay(150);
          try {
            const upsertResponse = await fetch('https://services.leadconnectorhq.com/contacts/upsert', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${hlSettings.token}`,
                'Version': '2021-07-28',
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                locationId: hlSettings.locationId,
                email: email,
                firstName: firstName,
                lastName: lastName
              })
            });

            if (upsertResponse.ok) {
              const upsertData = await upsertResponse.json();
              contactId = upsertData.contact?.id;
              // Check if this was a new contact or existing
              if (upsertData.new === true) {
                isNewContact = true;
              }
              console.log(`✅ Upsert successful: ${maskId(contactId)}, new: ${isNewContact}`);
            } else {
              console.log(`⚠️ Upsert failed with status ${upsertResponse.status}, trying duplicate search`);
            }
          } catch (upsertErr) {
            console.log(`⚠️ Upsert exception, trying duplicate search`);
          }

          // Fallback: try duplicate search
          if (!contactId) {
            await delay(150);
            try {
              const searchResponse = await fetch(
                `https://services.leadconnectorhq.com/contacts/search/duplicate?locationId=${hlSettings.locationId}&email=${encodeURIComponent(email)}`,
                {
                  method: 'GET',
                  headers: {
                    'Authorization': `Bearer ${hlSettings.token}`,
                    'Version': '2021-07-28'
                  }
                }
              );

              if (searchResponse.ok) {
                const searchData = await searchResponse.json();
                contactId = searchData.contact?.id;
                if (contactId) {
                  console.log(`✅ Found existing contact via search: ${maskId(contactId)}`);
                }
              }
            } catch (searchErr) {
              console.log(`⚠️ Duplicate search failed`);
            }
          }

          // Final fallback: create new contact
          if (!contactId) {
            await delay(150);
            try {
              const createResponse = await fetch('https://services.leadconnectorhq.com/contacts/', {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${hlSettings.token}`,
                  'Version': '2021-07-28',
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                  locationId: hlSettings.locationId,
                  email: email,
                  firstName: firstName,
                  lastName: lastName
                })
              });

              if (createResponse.ok) {
                const createData = await createResponse.json();
                contactId = createData.contact?.id;
                isNewContact = true;
                console.log(`✅ Created new contact: ${maskId(contactId)}`);
              } else {
                console.log(`❌ Failed to create contact: ${createResponse.status}`);
              }
            } catch (createErr) {
              console.log(`❌ Create contact exception`);
            }
          }

          // Update counters
          if (contactId) {
            if (isNewContact) {
              createdContacts++;
            } else {
              updatedContacts++;
            }

            // Save contact ID to database (unless dry_run)
            if (!dryRun) {
              const { error: updateErr } = await supabaseAdmin
                .from('customers')
                .update({ highlevel_contact_id: contactId })
                .eq('id', customer.id);

              if (!updateErr) {
                updatedDbContactId++;
                console.log(`💾 Saved contact ID to DB: ${maskId(customer.id)}`);
              } else {
                console.log(`⚠️ Failed to save contact ID to DB: ${maskId(customer.id)}`);
              }
            }
          } else {
            // Could not get contact ID - skip syncing
            hlFailed++;
            console.log(`❌ Could not resolve HighLevel contact for: ${maskId(customer.id)}`);
            continue;
          }
        } else {
          // Already had a contact ID
          updatedContacts++;
          console.log(`📌 Using existing contact ID: ${maskId(contactId)}`);
        }

        // Sync custom fields to HighLevel (unless dry_run)
        if (!dryRun && contactId) {
          // Build fields - use undefined instead of '' to avoid overwriting existing HL fields with blanks
          const fields: HighLevelContactFields = {
            provision_status: 'success',
            service_expiration: serviceExpiration || undefined,
            total_connections: totalConnections || undefined,
            service_username_1: connections[0]?.username || undefined,
            service_password_1: connections[0]?.password || undefined,
            service_m3u_url_1: connections[0]?.m3u_url || undefined,
            service_username_2: connections[1]?.username || undefined,
            service_password_2: connections[1]?.password || undefined,
            service_m3u_url_2: connections[1]?.m3u_url || undefined,
            service_username_3: connections[2]?.username || undefined,
            service_password_3: connections[2]?.password || undefined,
            service_m3u_url_3: connections[2]?.m3u_url || undefined
          };

          await delay(150);
          const result = await updateHighLevelContact(
            contactId,
            hlSettings.token,
            hlSettings.locationId,
            resellerId,
            fields
          );

          if (result.success) {
            hlSynced++;
            console.log(`✅ Synced fields for: ${maskId(contactId)}`);
          } else {
            hlFailed++;
            console.log(`❌ Failed to sync fields for: ${maskId(contactId)}`);
          }
        } else if (dryRun) {
          // Dry run - count as synced for reporting
          hlSynced++;
        }

      } catch (customerErr) {
        hlFailed++;
        console.error(`❌ Error processing customer ${maskId(customer.id)}:`, customerErr instanceof Error ? customerErr.message : 'Unknown error');
        continue;
      }
    }

    console.log(`📊 Batch progress: processed=${processed}, created=${createdContacts}, synced=${hlSynced}, failed=${hlFailed}`);
    from += BATCH_SIZE;
  }

  console.log('✅ Import complete:', { 
    processed, 
    createdContacts, 
    updatedContacts,
    skippedNoEmail,
    duplicateEmailSkipped,
    updatedDbContactId, 
    hlSynced, 
    hlFailed,
    dryRun
  });

  return new Response(
    JSON.stringify({
      success: true,
      resellerId,
      processed,
      createdContacts,
      updatedContacts,
      skippedNoEmail,
      duplicateEmailSkipped,
      updatedDbContactId,
      hlSynced,
      hlFailed,
      dryRun
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
});

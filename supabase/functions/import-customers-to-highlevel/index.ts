import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { rewriteM3uDomain, DEFAULT_M3U_DOMAIN } from '../_shared/m3u-domain.ts';
import { getHighLevelSettings, updateHighLevelContact, HighLevelContactFields } from '../_shared/highlevel-api.ts';

const BATCH_SIZE = 200;

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

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

interface UpsertResult {
  contactId: string | null;
  isNew: boolean;
}

// Extracted upsert helper — resolves or creates a HighLevel contact by email
async function resolveHighLevelContact(
  email: string,
  name: string,
  token: string,
  locationId: string
): Promise<UpsertResult> {
  const nameParts = name.trim().split(/\s+/);
  const firstName = nameParts[0] || 'Customer';
  const lastName = nameParts.slice(1).join(' ') || '';

  // Try upsert first (idempotent)
  await delay(150);
  try {
    const upsertResponse = await fetch('https://services.leadconnectorhq.com/contacts/upsert', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Version': '2021-07-28',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ locationId, email, firstName, lastName })
    });

    if (upsertResponse.ok) {
      const upsertData = await upsertResponse.json();
      const contactId = upsertData.contact?.id;
      if (contactId) {
        console.log(`✅ Upsert successful: ${maskId(contactId)}, new: ${upsertData.new === true}`);
        return { contactId, isNew: upsertData.new === true };
      }
    } else {
      console.log(`⚠️ Upsert failed with status ${upsertResponse.status}`);
    }
  } catch {
    console.log(`⚠️ Upsert exception, trying duplicate search`);
  }

  // Fallback: duplicate search
  await delay(150);
  try {
    const searchResponse = await fetch(
      `https://services.leadconnectorhq.com/contacts/search/duplicate?locationId=${locationId}&email=${encodeURIComponent(email)}`,
      {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${token}`, 'Version': '2021-07-28' }
      }
    );
    if (searchResponse.ok) {
      const searchData = await searchResponse.json();
      if (searchData.contact?.id) {
        console.log(`✅ Found existing contact via search: ${maskId(searchData.contact.id)}`);
        return { contactId: searchData.contact.id, isNew: false };
      }
    }
  } catch {
    console.log(`⚠️ Duplicate search failed`);
  }

  // Final fallback: create
  await delay(150);
  try {
    const createResponse = await fetch('https://services.leadconnectorhq.com/contacts/', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Version': '2021-07-28',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ locationId, email, firstName, lastName })
    });
    if (createResponse.ok) {
      const createData = await createResponse.json();
      if (createData.contact?.id) {
        console.log(`✅ Created new contact: ${maskId(createData.contact.id)}`);
        return { contactId: createData.contact.id, isNew: true };
      }
    } else {
      console.log(`❌ Failed to create contact: ${createResponse.status}`);
    }
  } catch {
    console.log(`❌ Create contact exception`);
  }

  return { contactId: null, isNew: false };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { 
      status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
  const supabaseAuth = createClient(supabaseUrl, anonKey);

  // Auth check
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { 
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });
  }

  const token = authHeader.replace('Bearer ', '');
  const { data: userData, error: authError } = await supabaseAuth.auth.getUser(token);
  if (authError || !userData?.user) {
    return new Response(JSON.stringify({ error: 'Invalid token' }), { 
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });
  }

  const { data: isAdmin, error: roleError } = await supabaseAdmin.rpc('has_role', {
    _user_id: userData.user.id, _role: 'admin'
  });
  if (roleError || !isAdmin) {
    return new Response(JSON.stringify({ error: 'Admin access required' }), { 
      status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });
  }

  let body: ImportRequest;
  try { body = await req.json(); } catch { 
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { 
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });
  }
  
  const { reseller_id: resellerId, limit, dry_run: dryRun = false } = body;
  
  if (!resellerId) {
    return new Response(JSON.stringify({ error: 'reseller_id is required' }), { 
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });
  }

  console.log('🚀 Starting HighLevel customer import:', { resellerId: maskId(resellerId), limit, dryRun });

  const hlSettings = await getHighLevelSettings(resellerId);
  const hlEnabled = !!hlSettings?.token && !!hlSettings?.locationId && !!hlSettings?.isActive;
  
  if (!hlEnabled) {
    return new Response(JSON.stringify({ 
      error: 'HighLevel integration is not configured or not active for this reseller.' 
    }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  const { data: reseller, error: resellerErr } = await supabaseAdmin
    .from('profiles').select('id').eq('id', resellerId).single();
  if (resellerErr || !reseller) {
    return new Response(JSON.stringify({ error: 'Reseller not found' }), { 
      status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });
  }

  const domainOverride: string | null = null;

  // Counters
  let processed = 0, createdContacts = 0, updatedContacts = 0;
  let skippedNoEmail = 0, duplicateEmailSkipped = 0, updatedDbContactId = 0;
  let hlSynced = 0, hlFailed = 0, staleIdsFixed = 0;

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
      return new Response(JSON.stringify({ error: 'Failed to load customers' }), { 
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }
    if (!customers || customers.length === 0) break;

    console.log(`📦 Processing batch: ${from} to ${from + customers.length - 1}`);

    for (const customer of customers) {
      if (limit && processed >= limit) { shouldContinue = false; break; }
      processed++;

      const email = (customer.email || '').trim().toLowerCase();
      if (!email) { skippedNoEmail++; continue; }
      if (seenEmails.has(email)) { duplicateEmailSkipped++; continue; }
      seenEmails.add(email);

      try {
        // Build connections array (up to 3)
        const connections: ConnectionData[] = [];
        if (customer.connection_list && Array.isArray(customer.connection_list) && customer.connection_list.length > 0) {
          for (const conn of customer.connection_list.slice(0, 3)) {
            const c = conn as Record<string, unknown>;
            connections.push({
              username: c?.username as string | undefined,
              password: c?.password as string | undefined,
              m3u_url: rewriteM3uDomain(c?.m3u_url as string | undefined, domainOverride, DEFAULT_M3U_DOMAIN)
            });
          }
        } else if (customer.username || customer.password || customer.m3u_url) {
          connections.push({
            username: customer.username,
            password: customer.password,
            m3u_url: rewriteM3uDomain(customer.m3u_url, domainOverride, DEFAULT_M3U_DOMAIN)
          });
        }

        const totalConnections = String(Math.min(Math.max(connections.length, 1), 3));
        const expRaw = customer.expiration_date;
        const serviceExpiration = typeof expRaw === 'string' ? expRaw.split('T')[0]
          : expRaw instanceof Date ? expRaw.toISOString().split('T')[0] : '';

        // Resolve contact ID
        let contactId = customer.highlevel_contact_id;
        let isNewContact = false;

        if (!contactId) {
          const result = await resolveHighLevelContact(email, customer.name || '', hlSettings.token, hlSettings.locationId);
          contactId = result.contactId;
          isNewContact = result.isNew;

          if (contactId) {
            if (isNewContact) createdContacts++; else updatedContacts++;
            if (!dryRun) {
              const { error: updateErr } = await supabaseAdmin.from('customers')
                .update({ highlevel_contact_id: contactId }).eq('id', customer.id);
              if (!updateErr) updatedDbContactId++;
            }
          } else {
            hlFailed++;
            continue;
          }
        } else {
          updatedContacts++;
        }

        // Sync custom fields
        if (!dryRun && contactId) {
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
          let result = await updateHighLevelContact(contactId, hlSettings.token, hlSettings.locationId, resellerId, fields);

          // Retry on stale contact ID ("Contact not found")
          if (!result.success && result.errorBody?.includes('Contact not found')) {
            console.log(`🔄 Stale contact ID detected for ${maskId(customer.id)}, re-resolving...`);
            staleIdsFixed++;

            // Clear stale ID in DB
            await supabaseAdmin.from('customers')
              .update({ highlevel_contact_id: null }).eq('id', customer.id);

            // Re-resolve via upsert
            const freshResult = await resolveHighLevelContact(email, customer.name || '', hlSettings.token, hlSettings.locationId);
            if (freshResult.contactId) {
              contactId = freshResult.contactId;
              // Save new ID
              await supabaseAdmin.from('customers')
                .update({ highlevel_contact_id: contactId }).eq('id', customer.id);
              updatedDbContactId++;

              // Retry field sync
              await delay(150);
              result = await updateHighLevelContact(contactId, hlSettings.token, hlSettings.locationId, resellerId, fields);
            }
          }

          if (result.success) {
            hlSynced++;
          } else {
            hlFailed++;
            console.log(`❌ Failed to sync fields for: ${maskId(contactId)}`);
          }
        } else if (dryRun) {
          hlSynced++;
        }
      } catch (customerErr) {
        hlFailed++;
        console.error(`❌ Error processing customer ${maskId(customer.id)}:`, customerErr instanceof Error ? customerErr.message : 'Unknown error');
      }
    }

    console.log(`📊 Batch progress: processed=${processed}, created=${createdContacts}, synced=${hlSynced}, failed=${hlFailed}, staleFixed=${staleIdsFixed}`);
    from += BATCH_SIZE;
  }

  console.log('✅ Import complete:', { processed, createdContacts, updatedContacts, skippedNoEmail, duplicateEmailSkipped, updatedDbContactId, hlSynced, hlFailed, staleIdsFixed, dryRun });

  return new Response(
    JSON.stringify({
      success: true, resellerId, processed, createdContacts, updatedContacts,
      skippedNoEmail, duplicateEmailSkipped, updatedDbContactId,
      hlSynced, hlFailed, staleIdsFixed, dryRun
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
});

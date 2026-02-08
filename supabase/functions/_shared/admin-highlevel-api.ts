// Admin HighLevel API helpers for Low Credit Alerts
// Separate from per-reseller HighLevel integration

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = "https://hddnqgggjjlildufirof.supabase.co";
const HIGHLEVEL_API_BASE = "https://services.leadconnectorhq.com";

// Sanitized logging helper - mask IDs
const maskId = (id: string): string => {
  if (!id || id.length < 8) return '****';
  return `${id.slice(0, 4)}...${id.slice(-4)}`;
};

export interface AdminHighLevelSettings {
  id: string;
  private_integration_token: string;
  location_id: string;
  is_active: boolean;
  custom_field_mappings: Record<string, string>;
}

export interface AdminResellerAlertFields {
  reseller_credit_balance?: string;
  reseller_low_credit_threshold?: string;
  reseller_credit_alert_reason?: string;
  reseller_credit_alert_triggered_at?: string;
  reseller_name?: string;
  reseller_buy_credits_url?: string;
}

interface CustomFieldMapping {
  [key: string]: string; // field_key -> field_id
}

// Cache for custom field mappings
let cachedMappings: CustomFieldMapping | null = null;
let cacheTimestamp = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

/**
 * Get Admin HighLevel settings from admin_highlevel_settings table
 * Returns null if inactive or missing required credentials
 */
export async function getAdminHighLevelSettings(
  supabaseAdmin: ReturnType<typeof createClient>
): Promise<AdminHighLevelSettings | null> {
  try {
    const { data, error } = await supabaseAdmin
      .from('admin_highlevel_settings')
      .select('*')
      .eq('id', 'admin')
      .single();

    if (error || !data) {
      console.log('Admin HL settings not found or error');
      return null;
    }

    // Integration is enabled ONLY when is_active=true AND token/location_id present
    if (!data.is_active || !data.private_integration_token || !data.location_id) {
      console.log('Admin HL integration not enabled');
      return null;
    }

    return {
      id: data.id,
      private_integration_token: data.private_integration_token,
      location_id: data.location_id,
      is_active: data.is_active,
      custom_field_mappings: data.custom_field_mappings || {}
    };
  } catch (error) {
    console.error('Error fetching Admin HL settings:', error);
    return null;
  }
}

/**
 * Get custom field mappings for Admin HL (cached)
 */
async function getAdminCustomFieldMappings(
  locationId: string,
  token: string
): Promise<CustomFieldMapping> {
  const now = Date.now();
  
  // Return cached if still valid
  if (cachedMappings && (now - cacheTimestamp) < CACHE_DURATION) {
    return cachedMappings;
  }

  // Define the fields we're looking for
  const targetFields = [
    'reseller_credit_balance',
    'reseller_low_credit_threshold',
    'reseller_credit_alert_reason',
    'reseller_credit_alert_triggered_at',
    'reseller_name',
    'reseller_buy_credits_url'
  ];

  try {
    const response = await fetch(
      `${HIGHLEVEL_API_BASE}/locations/${locationId}/customFields`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Version': '2021-07-28',
          'Content-Type': 'application/json'
        }
      }
    );

    if (!response.ok) {
      console.error('Failed to fetch custom fields:', response.status);
      return cachedMappings || {};
    }

    const data = await response.json();
    const fields = data.customFields || [];
    
    console.log('Admin HL raw fields sample:', fields.slice(0, 3).map((f: { fieldKey?: string; name?: string; id?: string }) => ({
      fieldKey: f.fieldKey,
      name: f.name,
      id: f.id ? maskId(f.id) : null
    })));
    
    const mapping: CustomFieldMapping = {};
    for (const field of fields) {
      const fieldKey = field.fieldKey || field.key || '';
      // Strip 'contact.' prefix if present (HighLevel UI-created fields use this format)
      const strippedKey = fieldKey.replace(/^contact\./, '');
      // Normalize name: "Reseller Credit Balance" → "reseller_credit_balance"
      const fieldName = (field.name || '').toLowerCase().replace(/\s+/g, '_');
      const fieldId = field.id;
      
      if (!fieldId) continue;
      
      // Match against target fields using multiple strategies
      for (const targetField of targetFields) {
        if (fieldKey === targetField || strippedKey === targetField || fieldName === targetField) {
          mapping[targetField] = fieldId;
          break;
        }
      }
    }

    cachedMappings = mapping;
    cacheTimestamp = now;
    
    // Debug logging - show what was found and what's missing
    console.log('Admin HL field mapping result:', {
      found: Object.keys(mapping),
      missing: targetFields.filter(f => !mapping[f])
    });
    
    return mapping;
  } catch (error) {
    console.error('Error fetching custom field mappings:', error);
    return cachedMappings || {};
  }
}

/**
 * Upsert reseller contact in Admin HL (by email, fallback create)
 */
export async function upsertAdminResellerContact(
  token: string,
  locationId: string,
  reseller: { id: string; name: string; email: string }
): Promise<{ contactId: string | null; isNew: boolean }> {
  try {
    console.log('Upserting Admin HL contact for reseller:', maskId(reseller.id), 'email:', reseller.email);

    // First try to find existing contact by email using the lookup endpoint
    const lookupResponse = await fetch(
      `${HIGHLEVEL_API_BASE}/contacts/lookup?locationId=${locationId}&email=${encodeURIComponent(reseller.email)}`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Version': '2021-07-28',
          'Content-Type': 'application/json'
        }
      }
    );

    if (lookupResponse.ok) {
      const lookupData = await lookupResponse.json();
      const contacts = lookupData.contacts || [];
      
      console.log('Contact lookup result for reseller:', {
        resellerId: maskId(reseller.id),
        email: reseller.email,
        contactsFound: contacts.length
      });
      
      if (contacts.length > 0) {
        const contactId = contacts[0].id;
        console.log('Found existing Admin HL contact via lookup:', maskId(contactId));
        return { contactId, isNew: false };
      }
    } else {
      console.log('Lookup endpoint failed, trying duplicate search:', lookupResponse.status);
    }

    // Fallback: try the duplicate search endpoint
    const searchResponse = await fetch(
      `${HIGHLEVEL_API_BASE}/contacts/search/duplicate?locationId=${locationId}&email=${encodeURIComponent(reseller.email)}`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Version': '2021-07-28',
          'Content-Type': 'application/json'
        }
      }
    );

    if (searchResponse.ok) {
      const searchData = await searchResponse.json();
      const contacts = searchData.contacts || [];
      
      console.log('Duplicate search result for reseller:', {
        resellerId: maskId(reseller.id),
        contactsFound: contacts.length
      });
      
      if (contacts.length > 0) {
        const contactId = contacts[0].id;
        console.log('Found existing Admin HL contact via duplicate search:', maskId(contactId));
        return { contactId, isNew: false };
      }
    }

    // Contact not found, create new one using upsert endpoint
    console.log('No existing contact found, creating new one for:', reseller.email);
    const createResponse = await fetch(
      `${HIGHLEVEL_API_BASE}/contacts/upsert`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Version': '2021-07-28',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          locationId,
          email: reseller.email,
          name: reseller.name,
          firstName: reseller.name.split(' ')[0] || reseller.name,
          lastName: reseller.name.split(' ').slice(1).join(' ') || undefined,
          tags: ['reseller', 'low_credit_alert']
        })
      }
    );

    if (!createResponse.ok) {
      const errorText = await createResponse.text();
      console.error('Failed to create Admin HL contact:', createResponse.status, errorText);
      return { contactId: null, isNew: false };
    }

    const createData = await createResponse.json();
    const contactId = createData.contact?.id;
    
    if (contactId) {
      console.log('Created new Admin HL contact:', maskId(contactId));
      return { contactId, isNew: true };
    }

    return { contactId: null, isNew: false };
  } catch (error) {
    console.error('Error upserting Admin HL contact:', error);
    return { contactId: null, isNew: false };
  }
}

/**
 * Update reseller alert fields in Admin HL
 * NEVER sends blank strings - uses undefined to skip fields
 */
export async function updateAdminResellerAlertFields(
  contactId: string,
  token: string,
  locationId: string,
  fields: AdminResellerAlertFields
): Promise<{ success: boolean; error?: string }> {
  try {
    console.log('Updating Admin HL alert fields for contact:', maskId(contactId));

    // Get custom field mappings
    const mapping = await getAdminCustomFieldMappings(locationId, token);
    
    // Build custom fields array with both id and key for maximum compatibility
    // NEVER send blank strings - use undefined to skip fields
    const customFields: Array<{ id: string; key: string; field_value: string }> = [];
    
    const addField = (key: string, value: string | undefined) => {
      if (!value) return; // Skip undefined or empty strings - NEVER send blank
      const fieldId = mapping[key];
      if (fieldId) {
        customFields.push({ id: fieldId, key, field_value: value });
      } else {
        console.log(`Custom field '${key}' not found in Admin HL location`);
      }
    };

    addField('reseller_credit_balance', fields.reseller_credit_balance);
    addField('reseller_low_credit_threshold', fields.reseller_low_credit_threshold);
    addField('reseller_credit_alert_reason', fields.reseller_credit_alert_reason);
    addField('reseller_credit_alert_triggered_at', fields.reseller_credit_alert_triggered_at);
    addField('reseller_name', fields.reseller_name);
    addField('reseller_buy_credits_url', fields.reseller_buy_credits_url);

    if (customFields.length === 0) {
      console.log('No custom fields to update');
      return { success: true };
    }

    console.log('Sending custom fields update:', {
      contactId: maskId(contactId),
      fieldsCount: customFields.length,
      fieldKeys: customFields.map(f => f.key)
    });

    const response = await fetch(
      `${HIGHLEVEL_API_BASE}/contacts/${contactId}`,
      {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Version': '2021-07-28',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          customFields
        })
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Failed to update Admin HL contact fields:', response.status, errorText);
      return { success: false, error: `HTTP ${response.status}` };
    }

    console.log('Successfully updated Admin HL contact fields');
    return { success: true };
  } catch (error) {
    console.error('Error updating Admin HL contact fields:', error);
    return { success: false, error: String(error) };
  }
}

/**
 * Test Admin HL connection by fetching custom fields
 */
export async function testAdminHighLevelConnection(
  token: string,
  locationId: string
): Promise<{ success: boolean; fieldCount?: number; error?: string }> {
  try {
    const response = await fetch(
      `${HIGHLEVEL_API_BASE}/locations/${locationId}/customFields`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Version': '2021-07-28',
          'Content-Type': 'application/json'
        }
      }
    );

    if (!response.ok) {
      return { success: false, error: `HTTP ${response.status}` };
    }

    const data = await response.json();
    const fieldCount = (data.customFields || []).length;
    
    return { success: true, fieldCount };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

// HighLevel API v2 Helper
// Uses Private Integration Token for authentication
// Handles custom field mapping (key -> id) and contact updates

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const supabase = createClient(supabaseUrl, supabaseServiceKey)

export interface HighLevelContactFields {
  provision_status: 'success' | 'failed';
  service_expiration?: string; // YYYY-MM-DD
  provision_error?: string;
  total_connections?: string;
  // Connection 1
  service_username_1?: string;
  service_password_1?: string;
  service_m3u_url_1?: string;
  // Connection 2
  service_username_2?: string;
  service_password_2?: string;
  service_m3u_url_2?: string;
  // Connection 3
  service_username_3?: string;
  service_password_3?: string;
  service_m3u_url_3?: string;
}

export interface HighLevelUpdateResult {
  success: boolean;
  error?: string;
}

// Tags to add on failure
const PROVISION_FAILED_TAG = 'provision_failed';

interface CustomFieldMapping {
  [key: string]: string; // key -> field ID
}

interface HighLevelSettings {
  token: string;
  locationId: string;
  isActive: boolean;
}

// Get reseller's HighLevel settings (service role - bypasses RLS)
export async function getHighLevelSettings(resellerId: string): Promise<HighLevelSettings | null> {
  try {
    const { data, error } = await supabase
      .from('reseller_highlevel_settings')
      .select('private_integration_token, location_id, is_active')
      .eq('reseller_id', resellerId)
      .single();

    if (error || !data) return null;
    if (!data.is_active || !data.private_integration_token) return null;

    return {
      token: data.private_integration_token,
      locationId: data.location_id,
      isActive: data.is_active
    };
  } catch (error) {
    console.error('❌ Error fetching HighLevel settings:', error);
    return null;
  }
}

// Fetch custom field IDs from HighLevel and cache them
async function getCustomFieldMappings(
  locationId: string,
  token: string,
  resellerId: string
): Promise<CustomFieldMapping> {
  // First check cache in database
  const { data: settings } = await supabase
    .from('reseller_highlevel_settings')
    .select('custom_field_mappings')
    .eq('reseller_id', resellerId)
    .single();

  const cachedMappings = settings?.custom_field_mappings as CustomFieldMapping | null;
  
  const requiredFields = [
    'provision_status',
    'service_expiration',
    'provision_error',
    'total_connections',
    'service_username_1', 'service_password_1', 'service_m3u_url_1',
    'service_username_2', 'service_password_2', 'service_m3u_url_2',
    'service_username_3', 'service_password_3', 'service_m3u_url_3'
  ];
  
  // Check if cache has all required fields
  if (cachedMappings && requiredFields.every(f => cachedMappings[f])) {
    console.log('📦 Using cached custom field mappings');
    return cachedMappings;
  }

  console.log('🔄 Fetching custom field mappings from HighLevel...');
  
  try {
    const response = await fetch(
      `https://services.leadconnectorhq.com/locations/${locationId}/customFields`,
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
      console.error('❌ Failed to fetch custom fields:', response.status);
      return cachedMappings || {};
    }

    const data = await response.json();
    const customFields = data.customFields || [];
    
    const mapping: CustomFieldMapping = {};
    for (const field of customFields) {
      const fieldKey = field.fieldKey || field.key || '';
      const fieldName = (field.name || '').toLowerCase().replace(/\s+/g, '_');
      const fieldId = field.id;
      
      if (fieldId) {
        // Core fields
        if (fieldKey === 'provision_status' || fieldName === 'provision_status') {
          mapping['provision_status'] = fieldId;
        } else if (fieldKey === 'service_expiration' || fieldName === 'service_expiration') {
          mapping['service_expiration'] = fieldId;
        } else if (fieldKey === 'provision_error' || fieldName === 'provision_error') {
          mapping['provision_error'] = fieldId;
        } else if (fieldKey === 'total_connections' || fieldName === 'total_connections') {
          mapping['total_connections'] = fieldId;
        }
        // Connection 1
        else if (fieldKey === 'service_username_1' || fieldName === 'service_username_1') {
          mapping['service_username_1'] = fieldId;
        } else if (fieldKey === 'service_password_1' || fieldName === 'service_password_1') {
          mapping['service_password_1'] = fieldId;
        } else if (fieldKey === 'service_m3u_url_1' || fieldName === 'service_m3u_url_1') {
          mapping['service_m3u_url_1'] = fieldId;
        }
        // Connection 2
        else if (fieldKey === 'service_username_2' || fieldName === 'service_username_2') {
          mapping['service_username_2'] = fieldId;
        } else if (fieldKey === 'service_password_2' || fieldName === 'service_password_2') {
          mapping['service_password_2'] = fieldId;
        } else if (fieldKey === 'service_m3u_url_2' || fieldName === 'service_m3u_url_2') {
          mapping['service_m3u_url_2'] = fieldId;
        }
        // Connection 3
        else if (fieldKey === 'service_username_3' || fieldName === 'service_username_3') {
          mapping['service_username_3'] = fieldId;
        } else if (fieldKey === 'service_password_3' || fieldName === 'service_password_3') {
          mapping['service_password_3'] = fieldId;
        } else if (fieldKey === 'service_m3u_url_3' || fieldName === 'service_m3u_url_3') {
          mapping['service_m3u_url_3'] = fieldId;
        }
      }
    }

    console.log('📋 Custom field mapping result:', {
      fieldsFound: Object.keys(mapping).length,
      mappedFields: Object.keys(mapping)
    });

    // Cache the mappings in database
    if (Object.keys(mapping).length > 0) {
      await supabase
        .from('reseller_highlevel_settings')
        .update({ custom_field_mappings: mapping })
        .eq('reseller_id', resellerId);
      console.log('💾 Custom field mappings cached');
    }

    return mapping;
  } catch (error) {
    console.error('❌ Error fetching custom fields:', error);
    return cachedMappings || {};
  }
}

// Build customFields payload with id, key, and field_value
function buildCustomFieldsPayload(
  fields: HighLevelContactFields,
  mapping: CustomFieldMapping
): Array<{ id?: string; key: string; field_value: string }> {
  const customFields: Array<{ id?: string; key: string; field_value: string }> = [];

  const addField = (key: string, value: string | undefined) => {
    if (!value) return;
    const fieldPayload: { id?: string; key: string; field_value: string } = {
      key,
      field_value: value
    };
    // Include field ID if we have it (more robust)
    if (mapping[key]) {
      fieldPayload.id = mapping[key];
    }
    customFields.push(fieldPayload);
  };

  // Core fields
  addField('provision_status', fields.provision_status);
  addField('service_expiration', fields.service_expiration);
  addField('provision_error', fields.provision_error);
  addField('total_connections', fields.total_connections);
  
  // Connection 1
  addField('service_username_1', fields.service_username_1);
  addField('service_password_1', fields.service_password_1);
  addField('service_m3u_url_1', fields.service_m3u_url_1);
  
  // Connection 2
  addField('service_username_2', fields.service_username_2);
  addField('service_password_2', fields.service_password_2);
  addField('service_m3u_url_2', fields.service_m3u_url_2);
  
  // Connection 3
  addField('service_username_3', fields.service_username_3);
  addField('service_password_3', fields.service_password_3);
  addField('service_m3u_url_3', fields.service_m3u_url_3);

  return customFields;
}

// Update HighLevel contact with custom fields
export async function updateHighLevelContact(
  contactId: string,
  token: string,
  locationId: string,
  resellerId: string,
  fields: HighLevelContactFields,
  addTags?: string[]
): Promise<HighLevelUpdateResult> {
  // SANITIZED LOGGING - never log token, password, or m3u_url
  console.log('🔗 HighLevel Update Request:', {
    contactId,
    hasToken: !!token,
    tokenLength: token?.length || 0,
    provision_status: fields.provision_status,
    totalConnections: fields.total_connections,
    hasUsername1: !!fields.service_username_1,
    hasUsername2: !!fields.service_username_2,
    hasUsername3: !!fields.service_username_3,
    hasExpiration: !!fields.service_expiration,
    hasError: !!fields.provision_error,
    tagsToAdd: addTags?.length || 0
  });

  try {
    // Get cached or fresh field mappings
    const mapping = await getCustomFieldMappings(locationId, token, resellerId);
    const customFields = buildCustomFieldsPayload(fields, mapping);

    if (customFields.length === 0) {
      console.log('⏭️ No custom fields to update');
      return { success: true };
    }

    console.log('📤 Sending custom fields update:', {
      fieldsCount: customFields.length,
      fieldKeys: customFields.map(f => f.key),
      hasFieldIds: customFields.filter(f => f.id).length,
      tagsToAdd: addTags
    });

    // Build the request body
    const requestBody: { customFields: typeof customFields; tags?: string[] } = { customFields };
    
    // Add tags if provided (additive - HighLevel API adds to existing tags)
    if (addTags && addTags.length > 0) {
      requestBody.tags = addTags;
    }

    const response = await fetch(
      `https://services.leadconnectorhq.com/contacts/${contactId}`,
      {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Version': '2021-07-28',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      }
    );

    // SANITIZED LOGGING
    console.log('📡 HighLevel Update Response:', {
      contactId,
      status: response.status,
      ok: response.ok
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ HighLevel API error:', {
        status: response.status,
        statusText: response.statusText,
        hasErrorBody: !!errorText
      });
      return {
        success: false,
        error: `HighLevel API error: ${response.status} ${response.statusText}`
      };
    }

    return { success: true };
  } catch (error) {
    console.error('❌ HighLevel API exception:', error instanceof Error ? error.message : 'Unknown error');
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}


import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface GetFieldsAndTagsRequest {
  resellerId: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    console.log('🔍 Getting HighLevel custom fields and tags');

    const { resellerId }: GetFieldsAndTagsRequest = await req.json();

    if (!resellerId) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Reseller ID is required' 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get Supabase client
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Get reseller's HighLevel settings
    const { data: hlSettings, error: hlError } = await supabase
      .from('reseller_highlevel_settings')
      .select('location_id, location_api_key')
      .eq('reseller_id', resellerId)
      .eq('is_active', true)
      .single();

    if (hlError || !hlSettings) {
      console.error('❌ No HighLevel settings found for reseller:', resellerId);
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'HighLevel integration not configured for this reseller' 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!hlSettings.location_api_key) {
      console.error('❌ No Location API Key configured for reseller:', resellerId);
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'HighLevel Location API Key not configured for this reseller' 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const locationApiKey = hlSettings.location_api_key;
    const locationId = hlSettings.location_id;

    console.log('🔐 Using Location API credentials for fetching fields and tags');

    const headers = {
      'Authorization': `Bearer ${locationApiKey}`,
      'Content-Type': 'application/json'
    };

    // Fetch custom fields
    console.log('📋 Fetching custom fields...');
    const customFieldsResponse = await fetch(`https://rest.gohighlevel.com/v1/custom-fields/?locationId=${locationId}`, {
      method: 'GET',
      headers: headers
    });

    let customFields = [];
    if (customFieldsResponse.ok) {
      const customFieldsData = await customFieldsResponse.json();
      customFields = customFieldsData.customFields || [];
      console.log('✅ Custom fields fetched successfully:', customFields.length, 'fields');
    } else {
      const errorText = await customFieldsResponse.text();
      console.error('❌ Failed to fetch custom fields:', customFieldsResponse.status, errorText);
    }

    // Fetch tags by getting a sample of contacts to extract existing tags
    console.log('🏷️ Fetching existing tags...');
    const contactsResponse = await fetch(`https://rest.gohighlevel.com/v1/contacts/?locationId=${locationId}&limit=100`, {
      method: 'GET',
      headers: headers
    });

    let allTags = new Set<string>();
    if (contactsResponse.ok) {
      const contactsData = await contactsResponse.json();
      const contacts = contactsData.contacts || [];
      
      // Extract all unique tags from contacts
      contacts.forEach((contact: any) => {
        if (contact.tags && Array.isArray(contact.tags)) {
          contact.tags.forEach((tag: string) => {
            if (tag && tag.trim()) {
              allTags.add(tag.trim());
            }
          });
        }
      });
      
      console.log('✅ Tags extracted successfully:', allTags.size, 'unique tags');
    } else {
      const errorText = await contactsResponse.text();
      console.error('❌ Failed to fetch contacts for tag extraction:', contactsResponse.status, errorText);
    }

    const result = {
      customFields: customFields.map((field: any) => ({
        id: field.id,
        name: field.name,
        fieldKey: field.fieldKey,
        dataType: field.dataType
      })),
      tags: Array.from(allTags).sort()
    };

    console.log('🎉 Successfully fetched fields and tags:', {
      customFieldsCount: result.customFields.length,
      tagsCount: result.tags.length
    });

    return new Response(JSON.stringify({ 
      success: true, 
      data: result
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('💥 Error in get HighLevel fields and tags function:', error);
    return new Response(JSON.stringify({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error',
      details: error instanceof Error ? error.stack : 'No additional details available'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

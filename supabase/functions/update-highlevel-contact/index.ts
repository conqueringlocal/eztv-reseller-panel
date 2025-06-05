
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface UpdateContactRequest {
  contactId: string;
  customFields?: Array<{ key: string; value: string }>;
  notes?: Array<{ body: string; type?: string }>;
  tagsToAdd?: string[];
  tagsToRemove?: string[];
  resellerId: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    console.log('🔄 HighLevel contact update function called');

    const { 
      contactId, 
      customFields = [], 
      notes = [], 
      tagsToAdd = [], 
      tagsToRemove = [],
      resellerId
    }: UpdateContactRequest = await req.json();

    console.log('📋 Update request:', { contactId, customFields, notes, tagsToAdd, tagsToRemove, resellerId });

    if (!contactId || !resellerId) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Contact ID and Reseller ID are required' 
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

    // Get reseller's location ID from settings
    const { data: hlSettings, error: hlError } = await supabase
      .from('reseller_highlevel_settings')
      .select('location_id')
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

    // Get the global Agency API Key from system settings
    const { data: systemSettings, error: systemError } = await supabase
      .from('system_settings')
      .select('value')
      .eq('id', 'highlevel_agency_api_key')
      .single();

    if (systemError || !systemSettings?.value) {
      console.error('❌ No global HighLevel Agency API Key found:', systemError);
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'HighLevel Agency API Key not configured at system level' 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const agencyApiKey = systemSettings.value;
    const locationId = hlSettings.location_id;
    const baseUrl = 'https://rest.gohighlevel.com/v1';
    
    const headers = {
      'Authorization': `Bearer ${agencyApiKey}`,
      'Content-Type': 'application/json'
    };

    console.log('🔐 Using global Agency API credentials:', {
      hasApiKey: !!agencyApiKey,
      apiKeyLength: agencyApiKey?.length || 0,
      locationId: locationId
    });

    const results = {
      customFields: false,
      notes: [] as boolean[],
      tagsAdded: false,
      tagsRemoved: false
    };

    // Update custom fields if provided
    if (customFields.length > 0) {
      console.log('🏷️ Updating custom fields...');
      const customFieldsObj = customFields.reduce((acc, field) => {
        acc[field.key] = field.value;
        return acc;
      }, {} as Record<string, string>);

      const customFieldsResponse = await fetch(`${baseUrl}/contacts/${contactId}`, {
        method: 'PUT',
        headers: headers,
        body: JSON.stringify({
          customFields: customFieldsObj,
          locationId: locationId
        })
      });

      if (customFieldsResponse.ok) {
        results.customFields = true;
        console.log('✅ Custom fields updated successfully');
      } else {
        const errorText = await customFieldsResponse.text();
        console.error('❌ Failed to update custom fields:', customFieldsResponse.status, errorText);
      }
    }

    // Add notes if provided
    if (notes.length > 0) {
      console.log('📝 Adding notes...');
      for (const note of notes) {
        const noteResponse = await fetch(`${baseUrl}/conversations/messages`, {
          method: 'POST',
          headers: headers,
          body: JSON.stringify({
            type: 'Email',
            contactId: contactId,
            message: note.body,
            locationId: locationId,
            subject: `Note: ${note.type || 'general'}`
          })
        });

        const success = noteResponse.ok;
        results.notes.push(success);
        
        if (success) {
          console.log('✅ Note added successfully');
        } else {
          const errorText = await noteResponse.text();
          console.error('❌ Failed to add note:', noteResponse.status, errorText);
        }
      }
    }

    // Add tags if provided
    if (tagsToAdd.length > 0) {
      console.log('🏷️ Adding tags...');
      const addTagsResponse = await fetch(`${baseUrl}/contacts/${contactId}`, {
        method: 'PUT',
        headers: headers,
        body: JSON.stringify({
          tags: tagsToAdd,
          locationId: locationId
        })
      });

      if (addTagsResponse.ok) {
        results.tagsAdded = true;
        console.log('✅ Tags added successfully');
      } else {
        const errorText = await addTagsResponse.text();
        console.error('❌ Failed to add tags:', addTagsResponse.status, errorText);
      }
    }

    // Remove tags if provided
    if (tagsToRemove.length > 0) {
      console.log('🗑️ Removing tags...');
      
      const getResponse = await fetch(`${baseUrl}/contacts/${contactId}?locationId=${locationId}`, {
        method: 'GET',
        headers: headers
      });

      if (getResponse.ok) {
        const contactData = await getResponse.json();
        const currentTags = contactData.contact?.tags || [];
        const updatedTags = currentTags.filter((tag: string) => !tagsToRemove.includes(tag));

        const removeTagsResponse = await fetch(`${baseUrl}/contacts/${contactId}`, {
          method: 'PUT',
          headers: headers,
          body: JSON.stringify({
            tags: updatedTags,
            locationId: locationId
          })
        });

        if (removeTagsResponse.ok) {
          results.tagsRemoved = true;
          console.log('✅ Tags removed successfully');
        } else {
          const errorText = await removeTagsResponse.text();
          console.error('❌ Failed to remove tags:', removeTagsResponse.status, errorText);
        }
      } else {
        const errorText = await getResponse.text();
        console.error('❌ Failed to fetch current contact tags:', getResponse.status, errorText);
      }
    }

    console.log('✅ Contact update completed:', results);

    return new Response(JSON.stringify({ 
      success: true, 
      results,
      message: 'Contact updated successfully'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('💥 Error in HighLevel contact update function:', error);
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

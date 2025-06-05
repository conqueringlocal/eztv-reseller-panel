
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

    // Get reseller's HighLevel credentials
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { data: hlSettings, error: hlError } = await supabase
      .from('reseller_highlevel_settings')
      .select('api_key, location_id')
      .eq('reseller_id', resellerId)
      .eq('is_active', true)
      .single();

    if (hlError || !hlSettings) {
      console.error('❌ No HighLevel settings found for reseller:', resellerId);
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'HighLevel credentials not configured for this reseller' 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { api_key: apiKey, location_id: locationId } = hlSettings;
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

      const customFieldsResponse = await fetch(`https://services.leadconnectorhq.com/contacts/${contactId}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'Version': '2021-07-28'
        },
        body: JSON.stringify({
          customFields: customFieldsObj
        })
      });

      results.customFields = customFieldsResponse.ok;
      if (!customFieldsResponse.ok) {
        console.error('❌ Failed to update custom fields:', await customFieldsResponse.text());
      }
    }

    // Add notes if provided
    if (notes.length > 0) {
      console.log('📝 Adding notes...');
      for (const note of notes) {
        const noteResponse = await fetch('https://services.leadconnectorhq.com/conversations/messages', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'Version': '2021-07-28'
          },
          body: JSON.stringify({
            type: 'Email',
            contactId: contactId,
            message: note.body,
            locationId: locationId,
            subject: `Note: ${note.type || 'general'}`
          })
        });

        results.notes.push(noteResponse.ok);
        if (!noteResponse.ok) {
          console.error('❌ Failed to add note:', await noteResponse.text());
        }
      }
    }

    // Add tags if provided
    if (tagsToAdd.length > 0) {
      console.log('🏷️ Adding tags...');
      const addTagsResponse = await fetch(`https://services.leadconnectorhq.com/contacts/${contactId}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'Version': '2021-07-28'
        },
        body: JSON.stringify({
          tags: tagsToAdd
        })
      });

      results.tagsAdded = addTagsResponse.ok;
      if (!addTagsResponse.ok) {
        console.error('❌ Failed to add tags:', await addTagsResponse.text());
      }
    }

    // Remove tags if provided
    if (tagsToRemove.length > 0) {
      console.log('🗑️ Removing tags...');
      
      // First get current contact to see existing tags
      const getResponse = await fetch(`https://services.leadconnectorhq.com/contacts/${contactId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Version': '2021-07-28'
        }
      });

      if (getResponse.ok) {
        const contactData = await getResponse.json();
        const currentTags = contactData.contact?.tags || [];
        const updatedTags = currentTags.filter((tag: string) => !tagsToRemove.includes(tag));

        const removeTagsResponse = await fetch(`https://services.leadconnectorhq.com/contacts/${contactId}`, {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'Version': '2021-07-28'
          },
          body: JSON.stringify({
            tags: updatedTags
          })
        });

        results.tagsRemoved = removeTagsResponse.ok;
        if (!removeTagsResponse.ok) {
          console.error('❌ Failed to remove tags:', await removeTagsResponse.text());
        }
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
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

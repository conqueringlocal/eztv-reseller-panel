import { corsHeaders } from '../_shared/cors.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

interface ChannelInfo {
  game: string;
  time: string;
  channel: string;
}

function formatUpdateForSocial(sportCategory: string, channelInfo: ChannelInfo[], gameDate: string): string {
  const header = `🏆 ${sportCategory} Updates - ${new Date(gameDate).toLocaleDateString()}`;
  
  const gamesList = channelInfo.map(info => 
    `📺 ${info.game} - ${info.time} - ${info.channel}`
  ).join('\n');
  
  return `${header}\n\n${gamesList}\n\n#sports #${sportCategory.toLowerCase()} #live`;
}

async function postToHighLevel(resellerId: string, message: string) {
  try {
    // Get reseller's HighLevel settings
    const { data: hlSettings, error: settingsError } = await supabase
      .from('reseller_highlevel_settings')
      .select('location_id, location_api_key, is_active')
      .eq('reseller_id', resellerId)
      .eq('is_active', true)
      .single();

    if (settingsError || !hlSettings) {
      console.log(`No active HighLevel settings for reseller ${resellerId}`);
      return false;
    }

    // Call the existing HighLevel contact creation function (can be adapted for posting)
    const postResponse = await fetch(`https://services.leadconnectorhq.com/conversations/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${hlSettings.location_api_key}`,
        'Content-Type': 'application/json',
        'Version': '2021-07-28'
      },
      body: JSON.stringify({
        type: 'SMS',
        contactId: hlSettings.location_id, // This would need to be adapted for community posting
        message: message
      })
    });

    if (!postResponse.ok) {
      console.error('HighLevel API error:', await postResponse.text());
      return false;
    }

    console.log('Successfully posted to HighLevel for reseller:', resellerId);
    return true;
  } catch (error) {
    console.error('Error posting to HighLevel:', error);
    return false;
  }
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { update_id } = await req.json();

    if (!update_id) {
      return new Response('Missing update_id', { 
        status: 400,
        headers: corsHeaders 
      });
    }

    // Get the sports update
    const { data: update, error: updateError } = await supabase
      .from('sports_ppv_updates')
      .select('*')
      .eq('id', update_id)
      .single();

    if (updateError || !update) {
      console.error('Update not found:', updateError);
      return new Response('Update not found', { 
        status: 404,
        headers: corsHeaders 
      });
    }

    // Check if already posted
    if (update.posted_to_highlevel) {
      console.log('Update already posted to HighLevel');
      return new Response(JSON.stringify({ status: 'already_posted' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Format the message for social posting
    const socialMessage = formatUpdateForSocial(
      update.sport_category,
      update.channel_info,
      update.game_date
    );

    // Get all resellers with active HighLevel settings
    const { data: resellers, error: resellersError } = await supabase
      .from('reseller_highlevel_settings')
      .select('reseller_id')
      .eq('is_active', true);

    if (resellersError) {
      console.error('Error fetching resellers:', resellersError);
      return new Response('Error fetching resellers', { 
        status: 500,
        headers: corsHeaders 
      });
    }

    // Post to HighLevel for each active reseller
    let successCount = 0;
    for (const reseller of resellers || []) {
      const posted = await postToHighLevel(reseller.reseller_id, socialMessage);
      if (posted) successCount++;
    }

    // Mark as posted
    const { error: markError } = await supabase
      .from('sports_ppv_updates')
      .update({ posted_to_highlevel: true })
      .eq('id', update_id);

    if (markError) {
      console.error('Error marking as posted:', markError);
    }

    console.log(`Posted to ${successCount} HighLevel accounts`);

    return new Response(JSON.stringify({ 
      status: 'success',
      posted_count: successCount 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in auto-post function:', error);
    return new Response(JSON.stringify({ 
      error: 'Internal server error',
      details: error.message 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
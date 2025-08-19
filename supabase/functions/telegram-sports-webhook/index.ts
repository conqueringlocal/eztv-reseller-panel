import { corsHeaders } from '../_shared/cors.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const telegramBotToken = Deno.env.get('TELEGRAM_BOTFATHER_TOKEN')!;

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    date: number;
    text?: string;
    chat: {
      id: number;
      type: string;
    };
    from?: {
      id: number;
      first_name: string;
      username?: string;
    };
  };
}

interface ParsedSportsUpdate {
  sport_category: string;
  channel_info: Array<{
    game: string;
    time: string;
    channel: string;
  }>;
}

function parseMessageContent(text: string): ParsedSportsUpdate {
  console.log('Parsing message:', text);
  
  // Extract sport category from the message
  let sport_category = 'GENERAL';
  const upperText = text.toUpperCase();
  
  if (upperText.includes('MLB') || upperText.includes('BASEBALL')) {
    sport_category = 'MLB';
  } else if (upperText.includes('NBA') || upperText.includes('BASKETBALL')) {
    sport_category = 'NBA';
  } else if (upperText.includes('NFL') || upperText.includes('FOOTBALL')) {
    sport_category = 'NFL';
  } else if (upperText.includes('TENNIS')) {
    sport_category = 'TENNIS';
  } else if (upperText.includes('PPV') || upperText.includes('PAY-PER-VIEW')) {
    sport_category = 'PPV';
  } else if (upperText.includes('SOCCER') || upperText.includes('FOOTBALL')) {
    sport_category = 'SOCCER';
  }

  // Parse game information and channels
  const channel_info: Array<{game: string, time: string, channel: string}> = [];
  const lines = text.split('\n').filter(line => line.trim());
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Skip header lines and empty lines
    if (!line || line.includes('Updates') || line.includes('----') || line.length < 10) {
      continue;
    }
    
    // Look for patterns like "Team vs Team - Time - Channel XXX"
    const gamePattern = /(.+?)\s*-\s*(\d{1,2}:\d{2}\s*[APap][Mm].*?)\s*-\s*.*(Channel\s*\d+|Ch\s*\d+)/i;
    const match = line.match(gamePattern);
    
    if (match) {
      const [, game, time, channel] = match;
      channel_info.push({
        game: game.trim(),
        time: time.trim(),
        channel: channel.trim()
      });
    } else {
      // Alternative pattern for different formats
      const altPattern = /(.+?)\s+(\d{1,2}:\d{2}\s*[APap][Mm].*?)\s+(Channel\s*\d+|Ch\s*\d+)/i;
      const altMatch = line.match(altPattern);
      
      if (altMatch) {
        const [, game, time, channel] = altMatch;
        channel_info.push({
          game: game.trim(),
          time: time.trim(),
          channel: channel.trim()
        });
      }
    }
  }

  console.log('Parsed result:', { sport_category, channel_info });
  return { sport_category, channel_info };
}

async function processUpdate(update: TelegramUpdate) {
  if (!update.message || !update.message.text) {
    console.log('No text message found in update');
    return;
  }

  const messageText = update.message.text;
  const messageId = update.message.message_id.toString();
  
  // Check if we've already processed this message
  const { data: existing } = await supabase
    .from('sports_ppv_updates')
    .select('id')
    .eq('telegram_message_id', messageId)
    .single();
    
  if (existing) {
    console.log('Message already processed:', messageId);
    return;
  }

  // Parse the message content
  const parsed = parseMessageContent(messageText);
  
  // Only process if we found channel information
  if (parsed.channel_info.length === 0) {
    console.log('No channel information found in message');
    return;
  }

  // Insert the sports update
  const { data, error } = await supabase
    .from('sports_ppv_updates')
    .insert({
      content: messageText,
      sport_category: parsed.sport_category,
      game_date: new Date().toISOString().split('T')[0], // Today's date
      channel_info: parsed.channel_info,
      telegram_message_id: messageId,
      posted_to_highlevel: false
    })
    .select()
    .single();

  if (error) {
    console.error('Error inserting sports update:', error);
    throw error;
  }

  console.log('Sports update inserted:', data);

  // Trigger HighLevel auto-posting
  try {
    const autoPostResponse = await supabase.functions.invoke('auto-post-sports-update', {
      body: { update_id: data.id }
    });
    
    if (autoPostResponse.error) {
      console.error('Error in auto-post function:', autoPostResponse.error);
    } else {
      console.log('Auto-post triggered successfully');
    }
  } catch (autoPostError) {
    console.error('Failed to trigger auto-post:', autoPostError);
  }
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Received webhook request');
    
    const body = await req.text();
    console.log('Webhook body:', body);
    
    let update: TelegramUpdate;
    
    try {
      update = JSON.parse(body);
    } catch (parseError) {
      console.error('Failed to parse webhook body:', parseError);
      return new Response('Invalid JSON', { 
        status: 400,
        headers: corsHeaders 
      });
    }

    await processUpdate(update);

    return new Response(JSON.stringify({ status: 'ok' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error processing webhook:', error);
    return new Response(JSON.stringify({ 
      error: 'Internal server error',
      details: error.message 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
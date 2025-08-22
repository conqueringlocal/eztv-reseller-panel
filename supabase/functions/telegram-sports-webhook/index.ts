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
  channel_post?: {
    message_id: number;
    date: number;
    text?: string;
    caption?: string;
    chat: {
      id: number;
      type: string;
    };
    sender_chat?: {
      id: number;
      title: string;
      username?: string;
      type: string;
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
  } else if (upperText.includes('MILB') || upperText.includes('MINOR LEAGUE BASEBALL')) {
    sport_category = 'MILB';
  } else if (upperText.includes('WNBA')) {
    sport_category = 'WNBA';
  } else if (upperText.includes('NBA') || upperText.includes('BASKETBALL')) {
    sport_category = 'NBA';
  } else if (upperText.includes('NFL') || upperText.includes('FOOTBALL')) {
    sport_category = 'NFL';
  } else if (upperText.includes('TENNIS')) {
    sport_category = 'TENNIS';
  } else if (upperText.includes('UEFA')) {
    sport_category = 'UEFA';
  } else if (upperText.includes('MLS') || upperText.includes('MAJOR LEAGUE SOCCER')) {
    sport_category = 'MLS';
  } else if (upperText.includes('PARAMOUNT+') || upperText.includes('PARAMOUNT')) {
    sport_category = 'PARAMOUNT+';
  } else if (upperText.includes('FLO COLLEGE') || upperText.includes('FLORACINGCOLLEGE')) {
    sport_category = 'FLO COLLEGE';
  } else if (upperText.includes('FLO RACING') || upperText.includes('FLORACING')) {
    sport_category = 'FLO RACING';
  } else if (upperText.includes('UFC') || (upperText.includes('DANA WHITE') && upperText.includes('CONTENDER SERIES') && !upperText.includes('LIVE EVENT'))) {
    sport_category = 'UFC';
  } else if (upperText.includes('DIRTVISION')) {
    sport_category = 'DIRTVISION';
  } else if (upperText.includes('PPV') || upperText.includes('PAY-PER-VIEW') || upperText.includes('LIVE EVENT') || upperText.includes('STAN EVENT')) {
    sport_category = 'PPV';
  } else {
    sport_category = 'PPV'; // Default fallback category
  }

  // Parse game information and channels
  const channel_info: Array<{game: string, time: string, channel: string}> = [];
  const lines = text.split('\n').filter(line => line.trim());
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Skip empty lines and footers
    if (!line || line.includes('Enjoy.') || line.length < 5) {
      continue;
    }
    
    // Parse MLB format: "MLB 1 | Brewers x Cubs start:2025-08-19 19:20:00 stop:2025-08-20 02:33:20"
    const mlbMatch = line.match(/^(MLB\s+\d+)\s*\|\s*(.+?)\s+start:(.+?)\s+stop:(.+?)$/);
    if (mlbMatch) {
      const [, channel, teams, startTime] = mlbMatch;
      channel_info.push({
        game: teams.trim(),
        time: startTime.trim(),
        channel: channel.trim()
      });
      continue;
    }
    
    // Parse MILB format: "MILB 1 | Team vs Team start:2025-08-19 19:20:00 stop:2025-08-20 02:33:20"
    const milbMatch = line.match(/^(MILB\s+\d+)\s*\|\s*(.+?)\s+start:(.+?)\s+stop:(.+?)$/);
    if (milbMatch) {
      const [, channel, teams, startTime] = milbMatch;
      channel_info.push({
        game: teams.trim(),
        time: startTime.trim(),
        channel: channel.trim()
      });
      continue;
    }
    
    // Parse Milb format: "Milb 01 :Team vs Team @ Aug 19 1:35 PM"
    const milbAltMatch = line.match(/^Milb\s+(\d+)\s*:(.+?)\s+@\s+(.+)$/);
    if (milbAltMatch) {
      const [, gameNumber, matchup, dateTime] = milbAltMatch;
      channel_info.push({
        game: matchup.trim(),
        time: dateTime.trim(),
        channel: `Milb ${gameNumber}`
      });
      continue;
    }
    
    // Parse WNBA format: "WNBA 1 Minnesota Lynx @ New York Liberty start:2025-08-20 00:00:00 stop:2025-08-20 02:00:00"
    const wnbaMatch = line.match(/^WNBA\s+(\d+)\s+(.+?)\s+start:(.+?)\s+stop:(.+?)$/);
    if (wnbaMatch) {
      const [, gameNumber, teams, startTime] = wnbaMatch;
      channel_info.push({
        game: teams.trim(),
        time: startTime.trim(),
        channel: `WNBA ${gameNumber}`
      });
      continue;
    }
    
    // Parse Tennis format: "Tennis 01 :US Open: Court 14 Qualifying (First Round) @ Aug 19 11:00 AM"
    const tennisMatch = line.match(/^Tennis\s+(\d+)\s*:(.+?)\s+@\s+(.+)$/);
    if (tennisMatch) {
      const [, gameNumber, eventName, dateTime] = tennisMatch;
      channel_info.push({
        game: eventName.trim(),
        time: dateTime.trim(),
        channel: `Tennis ${gameNumber}`
      });
      continue;
    }
    
    // Parse Paramount+ format: "Paramount+ 01 :English Football League: Luton Town vs Wigan Athletic @ Aug 19 2:35 PM"
    const paramountMatch = line.match(/^Paramount\+\s+(\d+)\s*:(.+?)\s+@\s+(.+)$/);
    if (paramountMatch) {
      const [, gameNumber, eventName, dateTime] = paramountMatch;
      channel_info.push({
        game: eventName.trim(),
        time: dateTime.trim(),
        channel: `Paramount+ ${gameNumber}`
      });
      continue;
    }
    
    // Parse Flo Racing format: "Flo Racing 01 :PBR RidePass @ Aug 19 5:00 PM"
    const floRacingMatch = line.match(/^Flo Racing\s+(\d+)\s*:(.+?)\s+@\s+(.+)$/);
    if (floRacingMatch) {
      const [, gameNumber, eventName, dateTime] = floRacingMatch;
      channel_info.push({
        game: eventName.trim(),
        time: dateTime.trim(),
        channel: `Flo Racing ${gameNumber}`
      });
      continue;
    }
    
    // Parse UEFA format: "UEFA  | 01 - Crvena zvesda vs Pafos 8:00pm"
    const uefaMatch = line.match(/^UEFA\s*\|\s*(\d+)\s*-\s*(.+?)\s+(\d{1,2}:\d{2}[ap]m)$/i);
    if (uefaMatch) {
      const [, gameNumber, matchup, time] = uefaMatch;
      channel_info.push({
        game: matchup.trim(),
        time: time.trim(),
        channel: `UEFA ${gameNumber.padStart(2, '0')}`
      });
      continue;
    }
    
    // Parse LIVE EVENT format: "LIVE EVENT 04 -8PM Dana Whites Contender Series Week 2"
    const liveEventMatch = line.match(/^LIVE EVENT\s+(\d+)\s+-(.+)$/);
    if (liveEventMatch) {
      const [, eventNumber, eventName] = liveEventMatch;
      channel_info.push({
        game: eventName.trim(),
        time: '', // Time is embedded in the event name
        channel: `LIVE EVENT ${eventNumber}`
      });
      continue;
    }
    
    // Parse STAN EVENT format: "STAN EVENT 02 | Vavassori/Errani v Rybakina/Fritz - Mixed Doubles R1 US Open 2025 // Tue 19 Aug 2025 16:00"
    const stanEventMatch = line.match(/^STAN EVENT\s+(\d+)\s*\|\s*(.+?)\s*\/\/\s*(.+)$/);
    if (stanEventMatch) {
      const [, eventNumber, eventName, dateTime] = stanEventMatch;
      channel_info.push({
        game: eventName.trim(),
        time: dateTime.trim(),
        channel: `STAN EVENT ${eventNumber}`
      });
      continue;
    }
    
    // Parse DIRTVISION format: "DIRTVISION 03 - Mississippi Thunder Speedway 7:15pm"
    const dirtvisionMatch = line.match(/^DIRTVISION\s+(\d+)\s+-\s*(.+)$/);
    if (dirtvisionMatch) {
      const [, channelNumber, eventName] = dirtvisionMatch;
      channel_info.push({
        game: eventName.trim(),
        time: '', // Time is embedded in the event name
        channel: `DIRTVISION ${channelNumber}`
      });
      continue;
    }
    
    // Parse US channel categories only: "US| MLB PPV" (filter out non-US channels)
    const channelMatch = line.match(/^US\|\s*(.+)$/);
    if (channelMatch) {
      const [, channelName] = channelMatch;
      channel_info.push({
        game: '',
        time: '',
        channel: `US | ${channelName.trim()}`
      });
      continue;
    }
    
    // Generic fallback for other sport formats with patterns like "Team vs Team - Time - Channel"
    const gamePattern = /(.+?)\s*-\s*(\d{1,2}:\d{2}\s*[APap][Mm].*?)\s*-\s*.*(Channel\s*\d+|Ch\s*\d+)/i;
    const match = line.match(gamePattern);
    
    if (match) {
      const [, game, time, channel] = match;
      channel_info.push({
        game: game.trim(),
        time: time.trim(),
        channel: channel.trim()
      });
    }
  }

  // Check if we have UK| DIRTVISION PPV and add US| DIRTVISION PPV automatically
  const hasUkDirtvision = channel_info.some(info => 
    info.channel && info.channel.includes('UK| DIRTVISION PPV')
  );
  
  if (hasUkDirtvision) {
    // Add US| DIRTVISION PPV channel category
    channel_info.push({
      game: '',
      time: '',
      channel: 'US | DIRTVISION PPV'
    });
  }

  console.log('Parsed result:', { sport_category, channel_info });
  return { sport_category, channel_info };
}

async function processUpdate(update: TelegramUpdate) {
  // Handle both regular messages and channel posts
  let messageText: string | undefined;
  let messageId: string;
  
  if (update.message?.text) {
    messageText = update.message.text;
    messageId = update.message.message_id.toString();
  } else if (update.channel_post?.text) {
    messageText = update.channel_post.text;
    messageId = update.channel_post.message_id.toString();
  } else if (update.channel_post?.caption) {
    messageText = update.channel_post.caption;
    messageId = update.channel_post.message_id.toString();
  } else {
    console.log('No text content found in update');
    return;
  }
  
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
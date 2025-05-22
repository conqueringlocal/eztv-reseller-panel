
// This is a Supabase Edge Function that creates the user_role type if it doesn't exist
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );
    
    // Check if the enum type exists
    const { data: enumCheck, error: enumError } = await supabaseClient
      .rpc('check_if_enum_exists', { enum_name: 'user_role' });
    
    if (enumError) {
      console.error('Error checking enum existence:', enumError);
      return new Response(JSON.stringify({ error: enumError.message }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      });
    }
    
    if (!enumCheck) {
      // Create the enum type
      const { data, error } = await supabaseClient
        .rpc('create_user_role_enum');
        
      if (error) {
        console.error('Error creating enum type:', error);
        return new Response(JSON.stringify({ error: error.message }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500,
        });
      }
      
      return new Response(
        JSON.stringify({ success: true, message: 'user_role enum type created' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } else {
      return new Response(
        JSON.stringify({ success: true, message: 'user_role enum type already exists' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
  } catch (error) {
    console.error('Unexpected error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});

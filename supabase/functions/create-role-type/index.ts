
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
    
    console.log('Creating user_role type directly with SQL');
    
    // Execute direct SQL to create the enum type if it doesn't exist
    const { data: createTypeResult, error: createTypeError } = await supabaseClient.rpc(
      'execute_sql',
      { 
        sql: "DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN CREATE TYPE user_role AS ENUM ('admin', 'reseller'); END IF; END $$;"
      }
    ).single();
    
    if (createTypeError) {
      console.error('Error creating type with direct SQL:', createTypeError);
      
      // Fallback to direct CREATE TYPE statement
      const { data: fallbackResult, error: fallbackError } = await supabaseClient
        .rpc('execute_sql', { 
          sql: "CREATE TYPE IF NOT EXISTS user_role AS ENUM ('admin', 'reseller');" 
        })
        .single();
        
      if (fallbackError) {
        console.error('Fallback type creation failed:', fallbackError);
        return new Response(JSON.stringify({ error: fallbackError.message }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500,
        });
      }
      
      console.log('Fallback type creation result:', fallbackResult);
      return new Response(
        JSON.stringify({ success: true, message: 'user_role enum type created via fallback' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    console.log('Type creation result:', createTypeResult);
    return new Response(
      JSON.stringify({ success: true, message: 'user_role enum type created or already exists' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Unexpected error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});

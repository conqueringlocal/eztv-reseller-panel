
// This is a Supabase Edge Function that creates the user_role type if it doesn't exist
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import * as postgres from 'https://deno.land/x/postgres@v0.17.0/mod.ts';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    console.log('Creating user_role type via Edge Function');
    
    // Connect directly to the database
    const databaseUrl = Deno.env.get('SUPABASE_DB_URL');
    if (!databaseUrl) {
      throw new Error('Database URL not found');
    }
    
    // Create a connection pool to the database
    const pool = new postgres.Pool(databaseUrl, 2, true);
    const connection = await pool.connect();
    
    try {
      // Execute direct SQL to create the type
      await connection.queryArray(`
        DO $$
        BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
            CREATE TYPE user_role AS ENUM ('admin', 'reseller');
          END IF;
        END
        $$;
      `);
      
      console.log('Successfully executed SQL to create user_role type');
    } finally {
      // Release the connection back to the pool
      connection.release();
      await pool.end();
    }

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

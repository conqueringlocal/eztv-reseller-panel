import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Create Supabase client with service role key for admin access
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Verify admin access through the request
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'No authorization header' }),
        { status: 401, headers: corsHeaders }
      );
    }

    // Create client with anon key for user verification
    const anonClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    );

    const token = authHeader.replace('Bearer ', '');
    const { data: userData, error: authError } = await anonClient.auth.getUser(token);
    
    if (authError || !userData.user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: corsHeaders }
      );
    }

    // Check if user is admin
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', userData.user.id)
      .single();

    if (!profile || profile.role !== 'admin') {
      return new Response(
        JSON.stringify({ error: 'Admin access required' }),
        { status: 403, headers: corsHeaders }
      );
    }

    // Call the MRR calculation function
    const { data: mrrData, error: mrrError } = await supabase
      .rpc('calculate_mrr_projections');

    if (mrrError) {
      console.error('Error calculating MRR:', mrrError);
      return new Response(
        JSON.stringify({ error: 'Failed to calculate MRR projections' }),
        { status: 500, headers: corsHeaders }
      );
    }

    // Get historical revenue data for trends (last 6 months)
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const { data: historicalData, error: histError } = await supabase
      .from('monthly_revenue_summary')
      .select('*')
      .gte('month_year', sixMonthsAgo.toISOString().split('T')[0])
      .order('month_year', { ascending: true });

    if (histError) {
      console.error('Error fetching historical data:', histError);
    }

    // Format the response
    const result = {
      mrr: mrrData[0] || {
        current_month_revenue: 0,
        projected_mrr: 0,
        growth_rate: 0,
        avg_sale_amount: 0,
        total_sales_count: 0
      },
      historical: historicalData || [],
      timestamp: new Date().toISOString()
    };

    console.log('MRR calculation result:', result);

    return new Response(
      JSON.stringify(result),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error('Error in calculate-mrr-projections:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: corsHeaders }
    );
  }
});
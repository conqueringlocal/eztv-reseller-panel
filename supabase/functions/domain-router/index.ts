import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const host = req.headers.get('host') || '';
    
    console.log(`[Domain Router] Request from host: ${host}, path: ${url.pathname}`);
    
    // Check if this is a request to funnels.streamlo.tv
    if (host === 'funnels.streamlo.tv') {
      console.log(`[Domain Router] Routing funnels.streamlo.tv request to funnel-router`);
      
      // Forward the request to the funnel-router function
      const supabase = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      );
      
      // Extract subdomain from path
      const subdomain = url.pathname.startsWith('/') ? url.pathname.slice(1) : url.pathname;
      const actualSubdomain = subdomain.split('/')[0];
      
      console.log(`[Domain Router] Extracted subdomain: "${actualSubdomain}"`);
      
      if (!actualSubdomain || actualSubdomain.length === 0) {
        return new Response(
          JSON.stringify({
            error: "Subdomain missing or invalid",
            fullUrl: url.href,
            pathname: url.pathname,
            parsedSubdomain: actualSubdomain
          }),
          { 
            status: 400, 
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
          }
        );
      }
      
      // Look up funnel by subdomain
      const { data: funnel, error } = await supabase
        .from('funnels')
        .select('*')
        .eq('subdomain', actualSubdomain)
        .eq('is_published', true)
        .single();

      if (error || !funnel) {
        console.log(`[Domain Router] Funnel not found for subdomain: ${actualSubdomain}`, error);
        return new Response(
          JSON.stringify({
            error: "Funnel not found or not published",
            subdomain: actualSubdomain
          }),
          {
            status: 404,
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
          }
        );
      }

      // Return the funnel HTML
      const html = funnel.html_content || '';
      
      console.log(`[Domain Router] Found funnel: ${funnel.name} (subdomain: ${actualSubdomain})`);
      console.log(`[Domain Router] HTML length: ${html.length} characters`);

      return new Response(html, {
        status: 200,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-cache',
          'X-Content-Type-Options': 'nosniff',
          ...corsHeaders,
        },
      });
    }
    
    // For other domains, return a 404
    return new Response('Domain not configured', {
      status: 404,
      headers: corsHeaders
    });

  } catch (error) {
    console.error('[Domain Router] Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
      },
    });
  }
});
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
    const pathname = url.pathname;
    
    console.log(`[Catch-All] Request from host: ${host}, path: ${pathname}, full URL: ${url.href}`);
    
    // Handle ALL requests to funnels.streamlo.tv
    if (host === 'funnels.streamlo.tv' || host.includes('streamlo.tv')) {
      console.log(`[Catch-All] Processing funnel request`);
      
      const supabase = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      );
      
      // Extract subdomain from path
      let subdomain = pathname.startsWith('/') ? pathname.slice(1) : pathname;
      
      // Clean up the subdomain (remove any trailing slashes or query params)
      subdomain = subdomain.split('/')[0].split('?')[0];
      
      console.log(`[Catch-All] Extracted subdomain: "${subdomain}"`);
      
      if (!subdomain || subdomain.length === 0) {
        return new Response(
          JSON.stringify({
            error: "Subdomain missing - please provide a funnel subdomain",
            example: "https://funnels.streamlo.tv/your-subdomain",
            provided: pathname
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
        .eq('subdomain', subdomain)
        .eq('is_published', true)
        .single();

      if (error || !funnel) {
        console.log(`[Catch-All] Funnel not found for subdomain: ${subdomain}`, error);
        return new Response(
          JSON.stringify({
            error: "Funnel not found or not published",
            subdomain: subdomain,
            available_at: `https://funnels.streamlo.tv/${subdomain}`
          }),
          {
            status: 404,
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
          }
        );
      }

      // Return the funnel HTML
      const html = funnel.html_content || '<html><body><h1>Funnel content not available</h1></body></html>';
      
      console.log(`[Catch-All] Serving funnel: ${funnel.name} (subdomain: ${subdomain})`);
      console.log(`[Catch-All] HTML length: ${html.length} characters`);

      return new Response(html, {
        status: 200,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0',
          'X-Content-Type-Options': 'nosniff',
          'X-Frame-Options': 'DENY',
          'X-XSS-Protection': '1; mode=block',
          ...corsHeaders,
        },
      });
    }
    
    // For other requests, return a redirect or basic response
    return new Response('This domain serves funnels only. Visit https://funnels.streamlo.tv/your-subdomain', {
      status: 200,
      headers: { 'Content-Type': 'text/plain', ...corsHeaders }
    });

  } catch (error) {
    console.error('[Catch-All] Error:', error);
    return new Response(JSON.stringify({ 
      error: 'Internal server error',
      message: error.message,
      service: 'catch-all-router'
    }), {
      status: 500,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
      },
    });
  }
});
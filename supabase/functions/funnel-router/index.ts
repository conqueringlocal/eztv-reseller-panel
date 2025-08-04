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
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const url = new URL(req.url);
    
    // Debug logging: log the full pathname first
    console.log("[Funnel Router] Full pathname:", url.pathname);
    console.log("[Funnel Router] Full URL:", url.href);
    
    // Extract subdomain from pathname - simplified path parsing
    const subdomain = url.pathname.startsWith('/') ? url.pathname.slice(1) : url.pathname;
    const subdomainParts = subdomain.split('/');
    const actualSubdomain = subdomainParts[0];
    
    // Debug logging before potential error
    console.log("[Funnel Router] Parsed subdomain:", actualSubdomain);
    console.log("[Funnel Router] Full subdomain string:", subdomain);
    console.log("[Funnel Router] Subdomain parts:", subdomainParts);
    
    // Error handling: return 400 if subdomain is missing
    if (!actualSubdomain || actualSubdomain.length === 0) {
      console.log("[Funnel Router] Invalid request. Parsed subdomain:", actualSubdomain);
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
    
    console.log(`[Funnel Router] Extracted subdomain: "${actualSubdomain}"`);

    // Database query: simplified to use subdomain and is_published
    const { data: funnel, error } = await supabase
      .from('funnels')
      .select('*')
      .eq('subdomain', actualSubdomain)
      .eq('is_published', true)
      .single();

    // Return 404 if funnel not found or not published
    if (error || !funnel) {
      console.log(`[Funnel Router] Funnel not found for subdomain: ${actualSubdomain}`, error);
      return new Response('Not Found: Funnel not found or not published', {
        status: 404,
        headers: corsHeaders
      });
    }

    // Get the HTML content
    const html = funnel.html_content || '';
    
    // Helpful logs
    console.log(`[Funnel Router] Found funnel: ${funnel.name} (subdomain: ${actualSubdomain})`);
    console.log(`[Funnel Router] HTML length: ${html.length} characters`);

    // Return HTML with correct headers
    return new Response(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-cache',
        'X-Content-Type-Options': 'nosniff',
        ...corsHeaders,
      },
    });

  } catch (error) {
    console.error('[Funnel Router] Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
      },
    });
  }
});
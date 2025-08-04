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
    
    console.log(`[CATCH-ALL TEST] Host: ${host}, Path: ${pathname}, URL: ${url.href}`);
    
    // Return plain text for testing - this should catch ALL requests
    const testResponse = `HELLO FROM CATCH-ALL!
    
Host: ${host}
Path: ${pathname}
Full URL: ${url.href}
Method: ${req.method}
Time: ${new Date().toISOString()}

This confirms the catch-all function is working and routing is bypassing static hosting.`;

    return new Response(testResponse, {
      status: 200,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        ...corsHeaders,
      },
    });

  } catch (error) {
    console.error('[CATCH-ALL TEST] Error:', error);
    return new Response(`ERROR IN CATCH-ALL: ${error.message}`, {
      status: 500,
      headers: {
        'Content-Type': 'text/plain',
        ...corsHeaders,
      },
    });
  }
});
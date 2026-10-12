/** Retired integrations must never read credentials, provision accounts, or contact a CRM. */
export function retiredCrmResponse(req: Request): Response {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
  };
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  return new Response(JSON.stringify({
    success: false,
    code: 'INTEGRATION_RETIRED',
    error: 'This integration has been retired. Manage customers and credits in the reseller dashboard.',
  }), { status: 410, headers });
}

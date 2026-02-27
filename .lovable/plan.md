

## Fix: PayPal Edge Function Not Working

### Root Causes

1. **Missing CORS headers** — Both `create-paypal-order` and `verify-paypal-order` are missing the newer Supabase client headers (`x-supabase-client-platform`, etc.) in their `Access-Control-Allow-Headers`. This causes the browser's CORS preflight to fail with a non-2xx status.

2. **Possible deployment issue** — Zero logs suggest the function may not have been deployed successfully. We will redeploy both functions after fixing the CORS headers.

### Changes

**File: `supabase/functions/create-paypal-order/index.ts`** (line 5)
- Update `Access-Control-Allow-Headers` to include all required Supabase client headers:
  ```
  authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version
  ```

**File: `supabase/functions/verify-paypal-order/index.ts`** (line 6)
- Same CORS header fix.

**Deploy** both `create-paypal-order` and `verify-paypal-order` edge functions.


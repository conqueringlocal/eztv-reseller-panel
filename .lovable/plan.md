

# Fix: Import Customers to HighLevel - 404 Error

## Root Cause

The `supabase/config.toml` has a **catch-all wildcard route** at the top:

```
[[routes]]
path = "/*"
function = "catch-all"
```

This intercepts ALL requests before they reach the `import-customers-to-highlevel` function. The catch-all function doesn't know how to handle it, so it returns a 404.

## Solution

Add a specific route for `import-customers-to-highlevel` **above** the catch-all wildcard route in `supabase/config.toml`. Supabase routes are matched in order, so specific routes must come before the wildcard.

## File to Modify

**`supabase/config.toml`** -- Add a route entry before the catch-all:

```toml
[[routes]]
path = "/import-customers-to-highlevel"
function = "import-customers-to-highlevel"

# Route all unmatched paths to catch-all function
[[routes]]
path = "/*"
function = "catch-all"
```

## Deployment

After updating the config, the `import-customers-to-highlevel` function will need to be redeployed so the routing change takes effect.

## Why Other Functions Work

Other functions like `reseller-credit-monitor` likely also suffer from this same routing issue unless they have explicit route entries. Any function that needs to be called directly by the frontend should have a specific route listed above the catch-all.


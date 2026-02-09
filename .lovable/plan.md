

# Fix: Stale HighLevel Contact IDs Causing "Contact not found" Errors

## Root Cause

The error is **not** a field mapping issue. The actual error from HighLevel is:

```
"Contact not found for id:4fZuBILywT69pHTnPsYk"
```

The `highlevel_contact_id` values stored in your database are **stale** -- those contacts no longer exist in HighLevel (likely deleted or from a different location). The import function currently trusts existing contact IDs blindly and skips the upsert/creation step, going straight to updating custom fields, which fails.

## Solution

Add a **retry-on-stale-ID** mechanism: when the custom fields update returns a "Contact not found" error, clear the stale contact ID, re-run the upsert flow to get a fresh contact ID, save it to the database, and retry the field sync.

## Changes

**File: `supabase/functions/import-customers-to-highlevel/index.ts`**

In the section after the field sync call (around line 400), add logic to handle the "Contact not found" case:

1. After `updateHighLevelContact` returns `{ success: false }`, check if the error contains "Contact not found"
2. If so, clear `highlevel_contact_id` in the database
3. Re-run the upsert/search/create flow (same code used for customers without a contact ID)
4. Save the new contact ID to the database
5. Retry the field sync with the new contact ID

This will be implemented by extracting the upsert logic into a helper function to avoid code duplication, and wrapping the field sync in a retry block.

**File: `supabase/functions/_shared/highlevel-api.ts`**

Update `updateHighLevelContact` to include the error body text in its return value so the caller can distinguish "Contact not found" from other errors:

```typescript
return {
  success: false,
  error: `HighLevel API error: ${response.status} ${response.statusText}`,
  errorBody: errorText  // Add this
};
```

## Technical Details

```text
Current flow (broken):
  Customer has stale contact ID
    -> Skip upsert
    -> Try field update
    -> 400 "Contact not found"
    -> Mark as failed

Fixed flow:
  Customer has stale contact ID
    -> Skip upsert
    -> Try field update
    -> 400 "Contact not found"
    -> Clear stale ID in DB
    -> Run upsert to get fresh ID
    -> Save new ID to DB
    -> Retry field update
    -> Success
```

## Deployment

Redeploy `import-customers-to-highlevel` after the changes.

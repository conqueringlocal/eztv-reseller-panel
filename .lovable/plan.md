
# Import Existing Customers to HighLevel - Implementation

## Overview
Implementing the approved plan to create an admin-only edge function that imports existing customers from the database into HighLevel CRM, with two additional safety tweaks.

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `supabase/functions/import-customers-to-highlevel/index.ts` | CREATE | New edge function for HighLevel import |
| `supabase/config.toml` | MODIFY | Add function config entry (line 60) |
| `src/pages/admin/AdminResellerDetail.tsx` | MODIFY | Add import button + confirmation dialog |

---

## Safety Tweaks Applied

### 1. Never Send Blank Strings
Use `undefined` instead of `''` for missing values so `buildCustomFieldsPayload` doesn't overwrite existing HL fields:
```typescript
const fields: HighLevelContactFields = {
  provision_status: 'success',
  service_expiration: serviceExpiration || undefined,
  total_connections: totalConnections || undefined,
  service_username_1: connections[0]?.username || undefined,
  service_password_1: connections[0]?.password || undefined,
  service_m3u_url_1: connections[0]?.m3u_url || undefined,
  // ... connections 2 and 3
};
```

### 2. Duplicate Email Protection
Track normalized emails in a Set within the import run:
```typescript
const seenEmails = new Set<string>();

// In customer loop:
if (seenEmails.has(email)) {
  duplicateEmailSkipped++;
  continue;
}
seenEmails.add(email);
```

Response includes new counter: `duplicateEmailSkipped`

---

## Edge Function: `import-customers-to-highlevel/index.ts`

**Features:**
- Admin-only (JWT + `has_role('admin')`)
- Requires HighLevel configured via `getHighLevelSettings(resellerId)`
- Processes customers in batches of 200
- 150ms delay around EACH HighLevel API call (rate limiting)
- Idempotent: uses email-based upsert, handles existing contact IDs
- Sanitized logging (masked IDs, no passwords/tokens/URLs)

**Input Body:**
```typescript
{
  reseller_id: string;   // Required
  limit?: number;        // Optional: max customers
  dry_run?: boolean;     // Optional: skip writes
}
```

**Safe Expiration Formatting:**
```typescript
const expRaw = customer.expiration_date;
const serviceExpiration =
  typeof expRaw === 'string'
    ? expRaw.split('T')[0]
    : expRaw instanceof Date
      ? expRaw.toISOString().split('T')[0]
      : '';
```

**Email Normalization:**
```typescript
const email = (customer.email || '').trim().toLowerCase();
if (!email) {
  skippedNoEmail++;
  continue;
}
```

**Contact Resolution:**
1. If `customer.highlevel_contact_id` exists → use it
2. Try `POST /contacts/upsert` with email/name
3. Fallback: `GET /contacts/search/duplicate?email=...`
4. Fallback: `POST /contacts` create new
5. Save `highlevel_contact_id` to DB (unless dry_run)

**Response JSON:**
```json
{
  "success": true,
  "resellerId": "uuid",
  "processed": 150,
  "createdContacts": 45,
  "updatedContacts": 100,
  "skippedNoEmail": 5,
  "duplicateEmailSkipped": 2,
  "updatedDbContactId": 45,
  "hlSynced": 145,
  "hlFailed": 0,
  "dryRun": false
}
```

---

## Config.toml Update

Add after line 59:
```toml
[functions.import-customers-to-highlevel]
verify_jwt = false
```

---

## AdminResellerDetail.tsx Changes

**Add imports (line 16):**
```typescript
import { ArrowLeft, Users, DollarSign, Activity, Calendar, Key, Trash2, ArrowRight, Upload, Loader2 } from 'lucide-react';
```

**Add state (after line 47):**
```typescript
const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
const [isImporting, setIsImporting] = useState(false);
```

**Add import handler (after line 193):**
```typescript
const handleImportToHighLevel = async () => {
  if (!id) return;
  
  setIsImporting(true);
  try {
    const { data, error } = await supabase.functions.invoke('import-customers-to-highlevel', {
      body: { reseller_id: id }
    });

    if (error) throw error;

    if (data?.success) {
      toast.success(
        `Import complete! Processed: ${data.processed}, ` +
        `New contacts: ${data.createdContacts}, ` +
        `Synced: ${data.hlSynced}, ` +
        `Failed: ${data.hlFailed}`
      );
      setIsImportDialogOpen(false);
    } else {
      toast.error(data?.error || 'Import failed');
    }
  } catch (error: any) {
    console.error('Import error:', error);
    toast.error(error.message || 'Failed to import customers to HighLevel');
  } finally {
    setIsImporting(false);
  }
};
```

**Add UI Card (after M3UDomainSettings, around line 292):**
```tsx
<div className="mb-6">
  <Card>
    <CardHeader>
      <CardTitle className="flex items-center gap-2">
        <Upload className="h-5 w-5" />
        Import Customers to HighLevel
      </CardTitle>
      <CardDescription>
        Sync existing customers to HighLevel CRM with their credentials
      </CardDescription>
    </CardHeader>
    <CardContent>
      <Button 
        onClick={() => setIsImportDialogOpen(true)}
        disabled={isImporting}
        className="bg-eztv-700 hover:bg-eztv-800"
      >
        {isImporting ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Importing...
          </>
        ) : (
          <>
            <Upload className="h-4 w-4 mr-2" />
            Import Customers to HighLevel
          </>
        )}
      </Button>
      <p className="text-sm text-muted-foreground mt-2">
        Creates contacts in HighLevel for customers without a contact ID 
        and syncs their credentials. Safe to re-run (uses email-based upsert).
      </p>
    </CardContent>
  </Card>
</div>
```

**Add confirmation dialog (before closing DashboardLayout):**
```tsx
{/* Import to HighLevel Confirmation Dialog */}
<AlertDialog open={isImportDialogOpen} onOpenChange={setIsImportDialogOpen}>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>Import Customers to HighLevel</AlertDialogTitle>
      <AlertDialogDescription asChild>
        <div className="space-y-3">
          <p>
            This will sync all {resellerCustomers.length} customer(s) 
            for <strong>{reseller.name}</strong> to HighLevel:
          </p>
          <ul className="list-disc list-inside text-sm space-y-1">
            <li>Create new contacts for customers without a HighLevel contact ID</li>
            <li>Update credentials and expiration dates for all customers</li>
            <li>Use email-based upsert to avoid duplicates</li>
          </ul>
          <p className="text-amber-600 font-medium">
            Ensure HighLevel integration is configured before proceeding.
          </p>
        </div>
      </AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel disabled={isImporting}>Cancel</AlertDialogCancel>
      <AlertDialogAction
        onClick={handleImportToHighLevel}
        disabled={isImporting}
        className="bg-eztv-700 hover:bg-eztv-800"
      >
        {isImporting ? 'Importing...' : 'Start Import'}
      </AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

---

## Deployment

Edge function will auto-deploy on save.

---

## Test cURL

```bash
curl -X POST "https://hddnqgggjjlildufirof.supabase.co/functions/v1/import-customers-to-highlevel" \
  -H "Authorization: Bearer YOUR_ADMIN_JWT" \
  -H "Content-Type: application/json" \
  -d '{"reseller_id": "uuid-here"}'
```

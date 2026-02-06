

# Add M3U Domain Settings UI Component

## Problem
The M3U Domain Override feature backend was implemented, but the frontend component to manage it was never created. The `M3UDomainSettings.tsx` component is missing from the codebase.

## Current State
- Database column `m3u_domain_override` exists on `profiles` table
- Edge function correctly uses the domain override
- **Missing:** Frontend component to edit the setting
- **Missing:** Import and placement in AdminResellerDetail page

---

## Implementation

### 1. Create M3UDomainSettings Component

**New File:** `src/components/resellers/M3UDomainSettings.tsx`

A simple admin-only card component with:
- Text input for the domain override
- Helper text explaining the feature
- Save button to update `profiles.m3u_domain_override`
- Clear button to remove the override
- Loads existing value on mount

```text
+------------------------------------------+
| M3U Domain Override Settings             |
| ---------------------------------------- |
| Configure custom domain for M3U URLs     |
| ---------------------------------------- |
|                                          |
| Custom M3U Domain (optional)             |
| [_________________________]              |
|                                          |
| Helper: "Used for M3U URLs and customer  |
| login links. Leave empty to use default  |
| platform domain (vpn.eztvclub.online)"   |
|                                          |
| [Save Settings]  [Clear Override]        |
+------------------------------------------+
```

### 2. Add Import and Component to AdminResellerDetail

**File:** `src/pages/admin/AdminResellerDetail.tsx`

Add import:
```typescript
import { M3UDomainSettings } from '@/components/resellers/M3UDomainSettings';
```

Insert component after HighLevelSettings (after line 287):
```tsx
<div className="mb-6">
  <M3UDomainSettings resellerId={id!} />
</div>
```

---

## Location in Admin UI

The M3U Domain Override settings will appear on the **individual reseller detail page**:

**Path:** Admin Dashboard → Resellers → Click on a reseller → M3U Domain Override Settings card

It will be positioned between:
- CRM Integration Settings (HighLevelSettings)
- API Key Manager

---

## Files to Create/Modify

| File | Action |
|------|--------|
| `src/components/resellers/M3UDomainSettings.tsx` | CREATE |
| `src/pages/admin/AdminResellerDetail.tsx` | ADD import + component |


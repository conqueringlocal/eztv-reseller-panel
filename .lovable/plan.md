
# Final Implementation: HighLevel Private Integration Token Migration

## Summary of Final Adjustments

Based on your requirements, this implementation includes:
1. **Admin-only UI** - Remove reseller access to HighLevelSettings, replace with read-only status component
2. **Explicit SQL security** - REVOKE table access from authenticated role, admin-only RLS
3. **Clear cached mappings on update** - Reset `custom_field_mappings` when token or location changes
4. **No webhook logic changes** - Add HL sync as planned, no other modifications

---

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `supabase/migrations/[timestamp]_highlevel_private_token.sql` | CREATE | Add columns, lock down security, create view |
| `supabase/functions/_shared/highlevel-api.ts` | CREATE | HighLevel API v2 helper with field mapping |
| `supabase/functions/webhook/enhancedWebhookHandler.ts` | MODIFY | Add HL sync after create/renew |
| `src/components/resellers/HighLevelSettings.tsx` | MODIFY | Admin-only, Private Integration Token field |
| `src/components/resellers/HighLevelStatusBadge.tsx` | CREATE | Read-only reseller status component |
| `src/pages/reseller/ResellerSettings.tsx` | MODIFY | Replace HighLevelSettings with status badge |
| `src/pages/admin/AdminResellerDetail.tsx` | MODIFY | Remove isAdminView prop |

---

## 1. Database Migration

**File: `supabase/migrations/[timestamp]_highlevel_private_token.sql`**

```sql
-- Migration: Add Private Integration Token support for HighLevel
-- Security: Admin-only access to reseller_highlevel_settings table

-- 1. Add private_integration_token column
ALTER TABLE public.reseller_highlevel_settings
ADD COLUMN IF NOT EXISTS private_integration_token text;

-- 2. Add custom_field_mappings column (cache for HighLevel field IDs)
ALTER TABLE public.reseller_highlevel_settings
ADD COLUMN IF NOT EXISTS custom_field_mappings jsonb DEFAULT '{}'::jsonb;

-- 3. SECURITY: Drop ALL existing policies on this table
DROP POLICY IF EXISTS "Resellers and admins can view HighLevel settings" ON public.reseller_highlevel_settings;
DROP POLICY IF EXISTS "Resellers and admins can insert HighLevel settings" ON public.reseller_highlevel_settings;
DROP POLICY IF EXISTS "Resellers and admins can update HighLevel settings" ON public.reseller_highlevel_settings;
DROP POLICY IF EXISTS "Resellers and admins can delete HighLevel settings" ON public.reseller_highlevel_settings;
DROP POLICY IF EXISTS "Admins can view all HighLevel settings" ON public.reseller_highlevel_settings;
DROP POLICY IF EXISTS "Admins only - full access to HighLevel settings" ON public.reseller_highlevel_settings;

-- 4. SECURITY: Revoke ALL table access from non-admin roles
REVOKE ALL ON public.reseller_highlevel_settings FROM anon;
REVOKE ALL ON public.reseller_highlevel_settings FROM authenticated;

-- 5. Create admin-only policy (using security definer function pattern)
CREATE POLICY "Admins only - full access"
ON public.reseller_highlevel_settings
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = 'admin'
  )
);

-- 6. Create reseller-safe view (no token or mappings exposed)
DROP VIEW IF EXISTS public.reseller_highlevel_status;

CREATE VIEW public.reseller_highlevel_status 
WITH (security_invoker = true)
AS
SELECT 
  reseller_id,
  location_id,
  is_active,
  (private_integration_token IS NOT NULL AND private_integration_token != '') AS is_connected,
  created_at,
  updated_at
FROM public.reseller_highlevel_settings;

-- 7. Grant SELECT on view to authenticated users (resellers can see their status)
GRANT SELECT ON public.reseller_highlevel_status TO authenticated;

-- 8. Create RLS policy for the view (resellers can only see their own status)
-- Note: Views with security_invoker respect base table RLS, but we need a separate approach
-- Since base table is admin-only, we use a function instead

-- Create function to get reseller's HighLevel status
CREATE OR REPLACE FUNCTION public.get_highlevel_status(p_reseller_id uuid)
RETURNS TABLE (
  reseller_id uuid,
  location_id text,
  is_active boolean,
  is_connected boolean
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    reseller_id,
    location_id,
    is_active,
    (private_integration_token IS NOT NULL AND private_integration_token != '') AS is_connected
  FROM public.reseller_highlevel_settings
  WHERE reseller_id = p_reseller_id
  LIMIT 1;
$$;

-- 9. Add comments for documentation
COMMENT ON COLUMN public.reseller_highlevel_settings.private_integration_token 
IS 'HighLevel Private Integration Token. Admin-only access.';

COMMENT ON COLUMN public.reseller_highlevel_settings.custom_field_mappings 
IS 'Cached HighLevel custom field key->id mappings. Reset on token/location change.';

COMMENT ON VIEW public.reseller_highlevel_status 
IS 'Read-only view for resellers. Does not expose token or mappings.';

COMMENT ON FUNCTION public.get_highlevel_status 
IS 'Security definer function for resellers to check their HL connection status.';
```

---

## 2. HighLevel API Helper (Edge Function)

**New File: `supabase/functions/_shared/highlevel-api.ts`**

```typescript
// HighLevel API v2 Helper
// Uses Private Integration Token for authentication
// Handles custom field mapping (key -> id) and contact updates

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const supabase = createClient(supabaseUrl, supabaseServiceKey)

export interface HighLevelContactFields {
  provision_status: 'success' | 'failed';
  service_username?: string;
  service_password?: string;
  service_m3u_url?: string;
  service_expiration?: string; // YYYY-MM-DD
  provision_error?: string;
}

export interface HighLevelUpdateResult {
  success: boolean;
  error?: string;
}

interface CustomFieldMapping {
  [key: string]: string; // key -> field ID
}

interface HighLevelSettings {
  token: string;
  locationId: string;
  isActive: boolean;
}

// Get reseller's HighLevel settings (service role - bypasses RLS)
export async function getHighLevelSettings(resellerId: string): Promise<HighLevelSettings | null> {
  try {
    const { data, error } = await supabase
      .from('reseller_highlevel_settings')
      .select('private_integration_token, location_id, is_active')
      .eq('reseller_id', resellerId)
      .single();

    if (error || !data) return null;
    if (!data.is_active || !data.private_integration_token) return null;

    return {
      token: data.private_integration_token,
      locationId: data.location_id,
      isActive: data.is_active
    };
  } catch (error) {
    console.error('❌ Error fetching HighLevel settings:', error);
    return null;
  }
}

// Fetch custom field IDs from HighLevel and cache them
async function getCustomFieldMappings(
  locationId: string,
  token: string,
  resellerId: string
): Promise<CustomFieldMapping> {
  // First check cache in database
  const { data: settings } = await supabase
    .from('reseller_highlevel_settings')
    .select('custom_field_mappings')
    .eq('reseller_id', resellerId)
    .single();

  const cachedMappings = settings?.custom_field_mappings as CustomFieldMapping | null;
  
  const requiredFields = [
    'provision_status',
    'service_username', 
    'service_password',
    'service_m3u_url',
    'service_expiration',
    'provision_error'
  ];
  
  // Check if cache has all required fields
  if (cachedMappings && requiredFields.every(f => cachedMappings[f])) {
    console.log('📦 Using cached custom field mappings');
    return cachedMappings;
  }

  console.log('🔄 Fetching custom field mappings from HighLevel...');
  
  try {
    const response = await fetch(
      `https://services.leadconnectorhq.com/locations/${locationId}/customFields`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Version': '2021-07-28',
          'Content-Type': 'application/json'
        }
      }
    );

    if (!response.ok) {
      console.error('❌ Failed to fetch custom fields:', response.status);
      return cachedMappings || {};
    }

    const data = await response.json();
    const customFields = data.customFields || [];
    
    const mapping: CustomFieldMapping = {};
    for (const field of customFields) {
      const fieldKey = field.fieldKey || field.key || '';
      const fieldName = (field.name || '').toLowerCase().replace(/\s+/g, '_');
      const fieldId = field.id;
      
      if (fieldId) {
        // Match by fieldKey or normalized name
        if (fieldKey === 'provision_status' || fieldName === 'provision_status') {
          mapping['provision_status'] = fieldId;
        } else if (fieldKey === 'service_username' || fieldName === 'service_username') {
          mapping['service_username'] = fieldId;
        } else if (fieldKey === 'service_password' || fieldName === 'service_password') {
          mapping['service_password'] = fieldId;
        } else if (fieldKey === 'service_m3u_url' || fieldName === 'service_m3u_url') {
          mapping['service_m3u_url'] = fieldId;
        } else if (fieldKey === 'service_expiration' || fieldName === 'service_expiration') {
          mapping['service_expiration'] = fieldId;
        } else if (fieldKey === 'provision_error' || fieldName === 'provision_error') {
          mapping['provision_error'] = fieldId;
        }
      }
    }

    console.log('📋 Custom field mapping result:', {
      fieldsFound: Object.keys(mapping).length,
      mappedFields: Object.keys(mapping)
    });

    // Cache the mappings in database
    if (Object.keys(mapping).length > 0) {
      await supabase
        .from('reseller_highlevel_settings')
        .update({ custom_field_mappings: mapping })
        .eq('reseller_id', resellerId);
      console.log('💾 Custom field mappings cached');
    }

    return mapping;
  } catch (error) {
    console.error('❌ Error fetching custom fields:', error);
    return cachedMappings || {};
  }
}

// Build customFields payload with id, key, and field_value
function buildCustomFieldsPayload(
  fields: HighLevelContactFields,
  mapping: CustomFieldMapping
): Array<{ id?: string; key: string; field_value: string }> {
  const customFields: Array<{ id?: string; key: string; field_value: string }> = [];

  const addField = (key: string, value: string | undefined) => {
    if (!value) return;
    const fieldPayload: { id?: string; key: string; field_value: string } = {
      key,
      field_value: value
    };
    // Include field ID if we have it (more robust)
    if (mapping[key]) {
      fieldPayload.id = mapping[key];
    }
    customFields.push(fieldPayload);
  };

  addField('provision_status', fields.provision_status);
  addField('service_username', fields.service_username);
  addField('service_password', fields.service_password);
  addField('service_m3u_url', fields.service_m3u_url);
  addField('service_expiration', fields.service_expiration);
  addField('provision_error', fields.provision_error);

  return customFields;
}

// Update HighLevel contact with custom fields
export async function updateHighLevelContact(
  contactId: string,
  token: string,
  locationId: string,
  resellerId: string,
  fields: HighLevelContactFields
): Promise<HighLevelUpdateResult> {
  // SANITIZED LOGGING - never log token, password, or m3u_url
  console.log('🔗 HighLevel Update Request:', {
    contactId,
    hasToken: !!token,
    tokenLength: token?.length || 0,
    provision_status: fields.provision_status,
    hasUsername: !!fields.service_username,
    hasExpiration: !!fields.service_expiration,
    hasError: !!fields.provision_error
  });

  try {
    // Get cached or fresh field mappings
    const mapping = await getCustomFieldMappings(locationId, token, resellerId);
    const customFields = buildCustomFieldsPayload(fields, mapping);

    if (customFields.length === 0) {
      console.log('⏭️ No custom fields to update');
      return { success: true };
    }

    console.log('📤 Sending custom fields update:', {
      fieldsCount: customFields.length,
      fieldKeys: customFields.map(f => f.key),
      hasFieldIds: customFields.filter(f => f.id).length
    });

    const response = await fetch(
      `https://services.leadconnectorhq.com/contacts/${contactId}`,
      {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Version': '2021-07-28',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ customFields })
      }
    );

    // SANITIZED LOGGING
    console.log('📡 HighLevel Update Response:', {
      contactId,
      status: response.status,
      ok: response.ok
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ HighLevel API error:', {
        status: response.status,
        statusText: response.statusText,
        hasErrorBody: !!errorText
      });
      return {
        success: false,
        error: `HighLevel API error: ${response.status} ${response.statusText}`
      };
    }

    return { success: true };
  } catch (error) {
    console.error('❌ HighLevel API exception:', error instanceof Error ? error.message : 'Unknown error');
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}
```

---

## 3. Webhook Handler Updates

**File: `supabase/functions/webhook/enhancedWebhookHandler.ts`**

### 3.1 Add Import (line 2)
```typescript
import { updateHighLevelContact, getHighLevelSettings, HighLevelContactFields } from '../_shared/highlevel-api.ts';
```

### 3.2 Add syncHighLevelContact helper (after line 109)
```typescript
// Sync provisioning result to HighLevel contact (NON-BLOCKING)
// Never logs tokens, passwords, or m3u_url
async function syncHighLevelContact(
  resellerId: string,
  contactId: string | undefined,
  success: boolean,
  credentials?: { username?: string; password?: string; m3u_url?: string },
  expirationDate?: string,
  errorMessage?: string
): Promise<void> {
  if (!contactId) {
    console.log('⏭️ No contact_id provided, skipping HighLevel sync');
    return;
  }

  try {
    const hlSettings = await getHighLevelSettings(resellerId);
    
    if (!hlSettings) {
      console.log('⏭️ HighLevel not configured or inactive for reseller, skipping sync');
      return;
    }

    const fields: HighLevelContactFields = {
      provision_status: success ? 'success' : 'failed'
    };

    if (success && credentials) {
      fields.service_username = credentials.username;
      fields.service_password = credentials.password;
      fields.service_m3u_url = credentials.m3u_url;
    }

    if (success && expirationDate) {
      fields.service_expiration = expirationDate;
    }

    if (!success && errorMessage) {
      fields.provision_error = errorMessage;
    }

    const result = await updateHighLevelContact(
      contactId,
      hlSettings.token,
      hlSettings.locationId,
      resellerId,
      fields
    );

    if (result.success) {
      console.log('✅ HighLevel contact synced successfully:', { contactId });
    } else {
      console.log('⚠️ HighLevel sync failed (non-blocking):', { contactId, error: result.error });
    }
  } catch (error) {
    // NON-BLOCKING - log and continue
    console.error('⚠️ HighLevel sync exception (non-blocking):', 
      error instanceof Error ? error.message : 'Unknown error'
    );
  }
}
```

### 3.3 Update createConsolidatedAccount - Add failure sync (after line 218)
```typescript
    // Check credits
    if (resellerData.credits < creditsRequired) {
      // Sync failure to HighLevel (non-blocking)
      await syncHighLevelContact(
        resellerId,
        payload.contact_id,
        false,
        undefined,
        undefined,
        `Insufficient credits. Required: ${creditsRequired}, Available: ${resellerData.credits}`
      );
      
      return {
        success: false,
        message: `Insufficient credits...`,
        errors: ['insufficient_credits']
      };
    }
```

### 3.4 Update createConsolidatedAccount - Add success sync (before line 372 return)
```typescript
    // Sync to HighLevel after successful provisioning (non-blocking)
    if (payload.contact_id) {
      const expirationDateStr = expirationDate.toISOString().split('T')[0];
      await syncHighLevelContact(
        resellerId,
        payload.contact_id,
        true,
        {
          username: consolidatedConnectionDetails[0]?.username,
          password: consolidatedConnectionDetails[0]?.password,
          m3u_url: consolidatedConnectionDetails[0]?.m3u_url
        },
        expirationDateStr
      );
    }

    return response;
```

### 3.5 Update renewCustomerGroup - Persist contact_id (after line 412)
```typescript
    const customer = customers[0];

    // Persist contact_id if provided via webhook
    if (payload.contact_id && customer.id) {
      await supabase
        .from('customers')
        .update({ highlevel_contact_id: payload.contact_id })
        .eq('id', customer.id);
    }
```

### 3.6 Update renewCustomerGroup - Add failure sync (at line 404)
```typescript
    if (findError || !customers || customers.length === 0) {
      // Sync failure to HighLevel (non-blocking)
      await syncHighLevelContact(
        resellerId,
        payload.contact_id,
        false,
        undefined,
        undefined,
        `No customer found with name "${payload.customer.name}" and email "${payload.customer.email}"`
      );
      
      return {
        success: false,
        message: `No customer found...`,
        errors: ['customer_not_found']
      };
    }
```

### 3.7 Update renewCustomerGroup - Add success sync (before line 448 return)
```typescript
    // Sync to HighLevel after successful renewal (non-blocking)
    const contactIdToUse = payload.contact_id || customer.highlevel_contact_id;
    if (contactIdToUse) {
      await syncHighLevelContact(
        resellerId,
        contactIdToUse,
        true,
        {
          username: customer.username || customer.connection_list?.[0]?.username,
          password: customer.password || customer.connection_list?.[0]?.password,
          m3u_url: customer.m3u_url || customer.connection_list?.[0]?.m3u_url
        },
        newExpiry.toISOString().split('T')[0]
      );
    }

    return {
      success: true,
      ...
    };
```

---

## 4. Admin UI - HighLevelSettings Component

**File: `src/components/resellers/HighLevelSettings.tsx`**

Complete rewrite - Admin-only, Private Integration Token, clears cache on update:

```typescript
import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle, Eye, EyeOff, Info, Shield } from 'lucide-react';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from '@/components/ui/form';

const highLevelSettingsSchema = z.object({
  locationId: z.string().min(1, 'HighLevel Location ID is required'),
  privateIntegrationToken: z.string().min(1, 'Private Integration Token is required'),
});

type HighLevelSettingsFormData = z.infer<typeof highLevelSettingsSchema>;

interface HighLevelSettingsProps {
  resellerId: string;
}

// ADMIN-ONLY COMPONENT
// Resellers cannot view or edit these settings
export function HighLevelSettings({ resellerId }: HighLevelSettingsProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [hasSettings, setHasSettings] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [originalLocationId, setOriginalLocationId] = useState('');
  const [originalToken, setOriginalToken] = useState('');

  const form = useForm<HighLevelSettingsFormData>({
    resolver: zodResolver(highLevelSettingsSchema),
    defaultValues: {
      locationId: '',
      privateIntegrationToken: '',
    },
  });

  // Load existing settings (admin-only via RLS)
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const { data, error } = await supabase
          .from('reseller_highlevel_settings')
          .select('location_id, private_integration_token, is_active')
          .eq('reseller_id', resellerId)
          .single();

        if (data && !error) {
          setHasSettings(true);
          setOriginalLocationId(data.location_id);
          setOriginalToken(data.private_integration_token || '');
          form.setValue('locationId', data.location_id);
          form.setValue('privateIntegrationToken', data.private_integration_token || '');
        }
      } catch (error) {
        console.error('Error loading HighLevel settings:', error);
      }
    };

    loadSettings();
  }, [resellerId, form]);

  const onSubmit = async (data: HighLevelSettingsFormData) => {
    setIsLoading(true);
    try {
      // Check if location_id or token changed -> clear cached mappings
      const locationChanged = data.locationId !== originalLocationId;
      const tokenChanged = data.privateIntegrationToken !== originalToken;
      const shouldClearCache = locationChanged || tokenChanged;

      const updateData: any = {
        location_id: data.locationId,
        private_integration_token: data.privateIntegrationToken,
        is_active: true,
      };

      // Clear custom_field_mappings if token or location changed
      if (shouldClearCache) {
        updateData.custom_field_mappings = {};
        console.log('🔄 Clearing cached custom field mappings due to config change');
      }

      if (hasSettings) {
        const { error } = await supabase
          .from('reseller_highlevel_settings')
          .update(updateData)
          .eq('reseller_id', resellerId);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('reseller_highlevel_settings')
          .insert({
            reseller_id: resellerId,
            ...updateData,
            custom_field_mappings: {}
          });

        if (error) throw error;
        setHasSettings(true);
      }

      // Update original values for next comparison
      setOriginalLocationId(data.locationId);
      setOriginalToken(data.privateIntegrationToken);

      toast.success('HighLevel settings saved successfully');
    } catch (error) {
      console.error('Error saving HighLevel settings:', error);
      toast.error('Failed to save HighLevel settings');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDisableIntegration = async () => {
    if (!hasSettings) return;

    setIsLoading(true);
    try {
      const { error } = await supabase
        .from('reseller_highlevel_settings')
        .update({ is_active: false })
        .eq('reseller_id', resellerId);

      if (error) throw error;

      toast.success('HighLevel integration disabled');
      form.reset();
      setHasSettings(false);
    } catch (error) {
      console.error('Error disabling HighLevel integration:', error);
      toast.error('Failed to disable HighLevel integration');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5" />
          CRM Integration Settings
        </CardTitle>
        <CardDescription>
          Configure HighLevel Private Integration Token for this reseller. 
          These settings are admin-managed and not visible to resellers.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Alert className="mb-4">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            <strong>Admin Only:</strong> Enter the reseller's HighLevel Location ID and 
            Private Integration Token. Create the token in HighLevel under 
            Settings → Integrations → Private Integrations.
          </AlertDescription>
        </Alert>

        <Alert className="mb-4 border-blue-200 bg-blue-50">
          <Info className="h-4 w-4 text-blue-600" />
          <AlertDescription className="text-blue-800">
            <strong>Required Custom Fields in HighLevel:</strong>
            <ul className="mt-2 ml-4 list-disc text-sm">
              <li><code>provision_status</code> - Success or failed status</li>
              <li><code>service_username</code> - IPTV username</li>
              <li><code>service_password</code> - IPTV password</li>
              <li><code>service_m3u_url</code> - M3U streaming URL</li>
              <li><code>service_expiration</code> - Expiration date (YYYY-MM-DD)</li>
              <li><code>provision_error</code> - Error message if failed</li>
            </ul>
          </AlertDescription>
        </Alert>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="locationId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>HighLevel Location ID</FormLabel>
                  <FormControl>
                    <Input placeholder="Enter HighLevel Location ID" {...field} />
                  </FormControl>
                  <FormDescription>
                    The Location ID from the reseller's HighLevel sub-account
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="privateIntegrationToken"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Private Integration Token</FormLabel>
                  <FormControl>
                    <div className="flex gap-2">
                      <Input 
                        type={showToken ? "text" : "password"}
                        placeholder="Enter Private Integration Token" 
                        className="flex-1"
                        {...field} 
                      />
                      <Button 
                        type="button"
                        variant="outline" 
                        onClick={() => setShowToken(!showToken)}
                      >
                        {showToken ? <EyeOff size={16} /> : <Eye size={16} />}
                      </Button>
                    </div>
                  </FormControl>
                  <FormDescription>
                    Private Integration Token from HighLevel Settings → Integrations
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex gap-2">
              <Button 
                type="submit" 
                disabled={isLoading}
                className="bg-eztv-700 hover:bg-eztv-800"
              >
                {isLoading ? 'Saving...' : hasSettings ? 'Update Settings' : 'Save Settings'}
              </Button>
              
              {hasSettings && (
                <Button 
                  type="button"
                  variant="outline"
                  onClick={handleDisableIntegration}
                  disabled={isLoading}
                >
                  Disable Integration
                </Button>
              )}
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
```

---

## 5. New Reseller Status Component (Read-Only)

**New File: `src/components/resellers/HighLevelStatusBadge.tsx`**

```typescript
import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, XCircle, Info } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface HighLevelStatusBadgeProps {
  resellerId: string;
}

// READ-ONLY component for resellers to see their HighLevel connection status
// Uses get_highlevel_status() function - does not expose token
export function HighLevelStatusBadge({ resellerId }: HighLevelStatusBadgeProps) {
  const [status, setStatus] = useState<{
    isConnected: boolean;
    isActive: boolean;
    loading: boolean;
  }>({ isConnected: false, isActive: false, loading: true });

  useEffect(() => {
    const loadStatus = async () => {
      try {
        // Use security definer function to get status
        const { data, error } = await supabase
          .rpc('get_highlevel_status', { p_reseller_id: resellerId });

        if (error) {
          console.error('Error loading HighLevel status:', error);
          setStatus({ isConnected: false, isActive: false, loading: false });
          return;
        }

        if (data && data.length > 0) {
          setStatus({
            isConnected: data[0].is_connected,
            isActive: data[0].is_active,
            loading: false
          });
        } else {
          setStatus({ isConnected: false, isActive: false, loading: false });
        }
      } catch (error) {
        console.error('Error loading HighLevel status:', error);
        setStatus({ isConnected: false, isActive: false, loading: false });
      }
    };

    loadStatus();
  }, [resellerId]);

  if (status.loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>CRM Integration</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse h-6 bg-gray-200 rounded w-32"></div>
        </CardContent>
      </Card>
    );
  }

  const isFullyConnected = status.isConnected && status.isActive;

  return (
    <Card>
      <CardHeader>
        <CardTitle>CRM Integration</CardTitle>
        <CardDescription>
          HighLevel integration status for automatic customer syncing
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-3 mb-4">
          {isFullyConnected ? (
            <>
              <CheckCircle className="h-5 w-5 text-green-600" />
              <Badge variant="default" className="bg-green-100 text-green-800">
                Connected
              </Badge>
            </>
          ) : (
            <>
              <XCircle className="h-5 w-5 text-gray-400" />
              <Badge variant="secondary">
                Not Connected
              </Badge>
            </>
          )}
        </div>

        <Alert className="border-blue-200 bg-blue-50">
          <Info className="h-4 w-4 text-blue-600" />
          <AlertDescription className="text-blue-800">
            {isFullyConnected ? (
              <>
                Your CRM integration is active. Customer credentials and status will be 
                automatically synced to HighLevel contacts when accounts are created or renewed.
              </>
            ) : (
              <>
                CRM integration is managed by your administrator. Contact your admin to 
                enable HighLevel integration for automatic customer syncing.
              </>
            )}
          </AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  );
}
```

---

## 6. Update Reseller Settings Page

**File: `src/pages/reseller/ResellerSettings.tsx`**

Replace the HighLevelSettings import and usage:

```typescript
// Line 12: Change import
import { HighLevelStatusBadge } from '@/components/resellers/HighLevelStatusBadge';

// Line 189: Replace component
{user?.id && <HighLevelStatusBadge resellerId={user.id} />}
```

---

## 7. Update Admin Reseller Detail Page

**File: `src/pages/admin/AdminResellerDetail.tsx`**

Remove `isAdminView` prop (no longer needed):

```typescript
// Line 286: Remove isAdminView prop
<HighLevelSettings resellerId={id!} />
```

---

## Security Summary

| Concern | Implementation |
|---------|----------------|
| Table access | `REVOKE ALL FROM authenticated` on `reseller_highlevel_settings` |
| RLS Policy | Admin-only policy using profiles.role check |
| Reseller access | Uses `get_highlevel_status()` security definer function |
| Token visibility | Never exposed to resellers |
| Cache invalidation | Clears `custom_field_mappings` on token/location change |
| Logging | Never logs tokens, passwords, or m3u_url |

---

## Test Checklist

1. **Admin: Configure Token**
   - Login as admin
   - Navigate to Admin → Resellers → [Reseller]
   - Enter Location ID and Private Integration Token
   - Save settings
   - Verify settings saved

2. **Reseller: Verify Status Only**
   - Login as reseller
   - Navigate to Settings
   - Verify only "Connected/Not Connected" status shows
   - Verify no token or location ID fields visible

3. **Webhook: Test Create**
   ```bash
   curl -X POST https://hddnqgggjjlildufirof.supabase.co/functions/v1/webhook \
     -H "Content-Type: application/json" \
     -d '{
       "api_key": "eztvclub_xxx",
       "action": "create",
       "connections": 1,
       "contact_id": "HIGHLEVEL_CONTACT_ID",
       "customer": {
         "name": "Test Customer",
         "email": "test@example.com",
         "device_type": "Smart TV",
         "plan_duration_months": 1
       }
     }'
   ```

4. **Verify HighLevel Contact Updated**
   - Open contact in HighLevel
   - Check custom fields populated

5. **Test Cache Clear**
   - Update Location ID or Token in admin
   - Verify `custom_field_mappings` is reset to `{}`
   - Next webhook triggers fresh field lookup

---

## HighLevel Custom Fields Required

Create these in HighLevel (Settings → Custom Fields):

| Field Key | Type | Purpose |
|-----------|------|---------|
| `provision_status` | Single Line Text | "success" or "failed" |
| `service_username` | Single Line Text | IPTV username |
| `service_password` | Single Line Text | IPTV password |
| `service_m3u_url` | Single Line Text | M3U URL |
| `service_expiration` | Single Line Text | YYYY-MM-DD |
| `provision_error` | Multi Line Text | Error message |

import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { ResellerApiCredentialsForm } from './ResellerApiCredentialsForm';

export function ResellerApiSetupDialog() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [mustSetup, setMustSetup] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!user || user.role !== 'reseller') return;
      const { data, error } = await supabase
        .from('profiles')
        .select('use_admin_api, api_key, panel_url')
        .eq('id', user.id)
        .single();
      if (error) return;
      const needs = data && data.use_admin_api === false && (!data.api_key || !data.panel_url);
      if (mounted) {
        setMustSetup(!!needs);
        setOpen(!!needs);
      }
    })();
    return () => { mounted = false; };
  }, [user]);

  const handleSaved = () => {
    setMustSetup(false);
    setOpen(false);
  };

  if (!user || user.role !== 'reseller') return null;

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!mustSetup) setOpen(next); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Set up your Streaming API credentials</DialogTitle>
          <DialogDescription>
            Please enter your IPTV provider API key and panel URL. This is required to manage customers with your own credentials.
          </DialogDescription>
        </DialogHeader>
        <ResellerApiCredentialsForm userId={user.id} onSaved={handleSaved} />
      </DialogContent>
    </Dialog>
  );
}

import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
const nowLocal = () => { const now = new Date(); return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 19); };
export function ProviderBalanceForm() {
  const queryClient = useQueryClient();
  const [credits, setCredits] = useState('');
  const [checked, setChecked] = useState(nowLocal);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const request = useRef({ body: '', id: crypto.randomUUID() });
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); if (busy) return;
    const args = { p_credits: Number(credits), p_checked_at: new Date(checked).toISOString(), p_note: note.trim() };
    const body = JSON.stringify(args);
    if (body !== request.current.body) request.current = { body, id: crypto.randomUUID() };
    setBusy(true);
    try {
      const { error } = await supabase.rpc('record_provider_balance', { p_id: request.current.id, ...args });
      if (error) throw error;
      toast.success('Trex balance check recorded.');
      setCredits(''); setChecked(nowLocal()); setNote('');
      await queryClient.invalidateQueries({ queryKey: ['business-dashboard'] });
    } catch (error) { toast.error((error as Error).message || 'Balance check could not be saved.'); }
    finally { setBusy(false); }
  };
  return <form className="space-y-4" onSubmit={submit}>
    <p className="text-sm text-muted-foreground">Open Trex and enter the available balance you actually see. Recording a purchase does not update this balance automatically.</p>
    <div className="grid sm:grid-cols-2 gap-4">
      <div><Label htmlFor="provider-credits">Available Trex credits</Label><Input id="provider-credits" type="number" min="0" max="1000000" step="0.01" required disabled={busy} value={credits} onChange={e => setCredits(e.target.value)} /></div>
      <div><Label htmlFor="provider-checked">Time checked (your local time)</Label><Input id="provider-checked" type="datetime-local" step="1" required disabled={busy} value={checked} onChange={e => setChecked(e.target.value)} /></div>
    </div>
    <div><Label htmlFor="provider-note">Note (optional)</Label><Input id="provider-note" maxLength={500} disabled={busy} value={note} onChange={e => setNote(e.target.value)} /></div>
    <Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Record checked balance'}</Button>
  </form>;
}

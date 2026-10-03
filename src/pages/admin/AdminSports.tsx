import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import {
  ProviderSportsFeed,
  sportsTime,
} from "@/components/sports/ProviderSportsFeed";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type State = {
  enabled: boolean;
  phase: string;
  source_id: string | null;
  source_title: string | null;
  source_timezone: string;
  channels: { id: string; title: string }[];
  last_seen_at: string | null;
  last_sync_at: string | null;
  last_error_code: string | null;
};
type Status = {
  state: State;
  job: { id: string; kind: string; status: string; created_at: string } | null;
};
const explanations: Record<string, string> = {
  setup_expired: "The connection step expired. Start the connection again.",
  invalid_code:
    "That login code was not accepted. Enter the latest Telegram code.",
  invalid_password: "The Telegram two-step password was not accepted.",
  code_expired: "The login code expired. Start the connection again.",
  invalid_config: "Check the API credentials and phone number.",
  telegram_unavailable:
    "Telegram could not complete the connection. Check your account, then retry the current step.",
  flood_wait:
    "Telegram asked us to wait. The reader will respect its retry period.",
  session_revoked: "Telegram access was revoked. Reconnect the account.",
  channel_unavailable:
    "The account can no longer read the selected channel. Check its membership.",
  sync_failed: "The last import failed. The reader will retry automatically.",
};
async function call(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke("sports-reader", {
    body,
  });
  if (error) {
    let message =
      "Unable to complete this step. Refresh status before trying again.";
    try {
      const payload = await error.context?.json();
      if (typeof payload?.error === "string") message = payload.error;
    } catch {
      /* No response body. */
    }
    throw Error(message);
  }
  return data;
}
export default function AdminSports() {
  const status = useQuery({
    queryKey: ["sports-reader-admin"],
    queryFn: async () => (await call({ action: "status" })) as Status,
    refetchInterval: 5000,
  });
  const [busy, setBusy] = useState(false);
  const [apiId, setApiId] = useState(""),
    [apiHash, setApiHash] = useState(""),
    [phone, setPhone] = useState(""),
    [code, setCode] = useState(""),
    [password, setPassword] = useState("");
  const [source, setSource] = useState(""),
    [timezone, setTimezone] = useState("UTC"),
    [reconnect, setReconnect] = useState(false);
  const state = status.data?.state;
  useEffect(() => {
    if (state) {
      setSource(state.source_id || "");
      setTimezone(state.source_timezone);
    }
  }, [state?.source_id, state?.source_timezone]);
  const pending =
    busy || ["queued", "working"].includes(status.data?.job?.status || "");
  const online =
    state?.last_seen_at && Date.now() - Date.parse(state.last_seen_at) < 180000;
  const act = async (action: string, payload: Record<string, unknown> = {}) => {
    setBusy(true);
    try {
      await call({ action, id: crypto.randomUUID(), ...payload });
      setApiHash("");
      setCode("");
      setPassword("");
      setReconnect(false);
      toast.success(
        action === "source"
          ? "Channel settings saved"
          : "Connection step submitted",
      );
      await status.refetch();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <DashboardLayout>
      <div className="max-w-4xl space-y-8">
        <div>
          <h1 className="text-3xl font-bold">Sports Updates</h1>
          <p className="mt-2 text-muted-foreground">
            Connect a Telegram account once to import the provider’s daily posts
            automatically.
          </p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Telegram connection</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {status.isLoading && <p>Loading connection status…</p>}
            {status.isError && (
              <p role="alert" className="text-destructive">
                Connection status is unavailable.{" "}
                <button className="underline" onClick={() => status.refetch()}>
                  Retry
                </button>
              </p>
            )}
            {state && (
              <>
                <div className="text-sm space-y-1">
                  <p className="font-medium">
                    {state.phase === "ready"
                      ? "Telegram connected"
                      : state.phase === "waiting_code"
                        ? "Enter your Telegram login code"
                        : state.phase === "waiting_password"
                          ? "Enter your Telegram two-step password"
                          : "Connect your reader account"}
                  </p>
                  <p className="text-muted-foreground">
                    Reader:{" "}
                    {online ? "Online" : "Offline — connection steps will wait"}{" "}
                    · Last seen: {sportsTime(state.last_seen_at)}
                  </p>
                  {pending && (
                    <p role="status">
                      Processing your connection step. This can take a minute.
                    </p>
                  )}
                  {state.last_error_code && (
                    <p role="alert" className="text-amber-800">
                      {explanations[state.last_error_code] ||
                        "Connection needs attention."}
                    </p>
                  )}
                </div>
                {(reconnect ||
                  ["waiting_config", "error"].includes(state.phase)) && (
                  <form
                    className="space-y-4"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void act("configure", {
                        api_id: Number(apiId),
                        api_hash: apiHash.trim(),
                        phone: phone.trim(),
                      });
                    }}
                  >
                    <p className="text-sm">
                      Use a separate Telegram account that has joined the
                      provider’s original private channel. Creating a new
                      channel alone does not give access to those posts.
                    </p>
                    <p className="text-sm">
                      Create an API application under{" "}
                      <a
                        href="https://my.telegram.org/apps"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary underline"
                      >
                        Telegram API development tools
                      </a>
                      , then enter its credentials here. Keep login codes and
                      passwords out of chat.
                    </p>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <Label htmlFor="tg-api">API ID</Label>
                        <Input
                          id="tg-api"
                          inputMode="numeric"
                          required
                          value={apiId}
                          onChange={(e) => setApiId(e.target.value)}
                        />
                      </div>
                      <div>
                        <Label htmlFor="tg-hash">API hash</Label>
                        <Input
                          id="tg-hash"
                          type="password"
                          autoComplete="off"
                          required
                          value={apiHash}
                          onChange={(e) => setApiHash(e.target.value)}
                        />
                      </div>
                    </div>
                    <div>
                      <Label htmlFor="tg-phone">
                        Account phone number, including country code
                      </Label>
                      <Input
                        id="tg-phone"
                        type="tel"
                        placeholder="+1…"
                        autoComplete="off"
                        required
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Submitting requests a login code from Telegram.
                      Credentials are sent securely to the private reader;
                      resellers cannot access them.
                    </p>
                    <Button disabled={pending || !online}>
                      Send Telegram login code
                    </Button>
                  </form>
                )}
                {!reconnect && state.phase === "waiting_code" && (
                  <form
                    className="space-y-3"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void act("code", { code: code.trim() });
                    }}
                  >
                    <Label htmlFor="tg-code">Login code sent by Telegram</Label>
                    <Input
                      id="tg-code"
                      type="password"
                      inputMode="numeric"
                      autoComplete="off"
                      required
                      value={code}
                      onChange={(e) => setCode(e.target.value)}
                    />
                    <Button disabled={pending || !online}>Verify code</Button>
                  </form>
                )}
                {!reconnect && state.phase === "waiting_password" && (
                  <form
                    className="space-y-3"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void act("password", { password });
                    }}
                  >
                    <Label htmlFor="tg-password">
                      Telegram two-step verification password
                    </Label>
                    <Input
                      id="tg-password"
                      type="password"
                      autoComplete="off"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                    <Button disabled={pending || !online}>
                      Complete connection
                    </Button>
                  </form>
                )}
                {state.phase === "ready" && (
                  <div className="space-y-4 border-t pt-4">
                    <div>
                      <Label htmlFor="tg-source">Provider channel</Label>
                      <select
                        id="tg-source"
                        className="mt-1 w-full rounded-md border bg-background p-2 text-sm"
                        value={source}
                        onChange={(e) => setSource(e.target.value)}
                      >
                        <option value="">
                          Choose the channel with the original posts
                        </option>
                        {state.channels.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.title}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <Label htmlFor="tg-timezone">Provider timezone</Label>
                      <Input
                        id="tg-timezone"
                        value={timezone}
                        onChange={(e) => setTimezone(e.target.value)}
                        placeholder="America/New_York"
                      />
                      <p className="mt-1 text-xs text-muted-foreground">
                        Event times in the original posts are kept unchanged.
                        Publication times display in the viewer’s local
                        timezone.
                      </p>
                    </div>
                    <p className="text-sm">
                      Enabling imports starts with the past 48 hours, then
                      checks for new posts every minute. Choose only a channel
                      whose updates you are authorized to share with resellers.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        disabled={pending || !source || !online}
                        onClick={() =>
                          act("source", {
                            source_id: source,
                            timezone,
                            enabled: true,
                          })
                        }
                      >
                        {state.enabled
                          ? "Save channel settings"
                          : "Enable automatic updates"}
                      </Button>
                      {state.enabled && (
                        <Button
                          variant="outline"
                          disabled={pending}
                          onClick={() =>
                            act("source", {
                              source_id: state.source_id,
                              timezone: state.source_timezone,
                              enabled: false,
                            })
                          }
                        >
                          Pause imports
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        disabled={pending || !online}
                        onClick={() => act("channels")}
                      >
                        Refresh channel list
                      </Button>
                    </div>
                  </div>
                )}
                <div className="flex flex-wrap gap-2 border-t pt-4">
                  {state.phase !== "waiting_config" && (
                    <Button
                      variant="outline"
                      disabled={pending}
                      onClick={() => setReconnect(!reconnect)}
                    >
                      {reconnect ? "Cancel reconnect" : "Reconnect account"}
                    </Button>
                  )}
                  {state.phase !== "waiting_config" && (
                    <Button
                      variant="outline"
                      disabled={pending || !online}
                      onClick={() => act("disconnect")}
                    >
                      Disconnect and pause
                    </Button>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>
        <ProviderSportsFeed />
      </div>
    </DashboardLayout>
  );
}

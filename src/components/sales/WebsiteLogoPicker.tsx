import { useState } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { prepareWebsiteLogo } from "@/lib/websiteLogo";

export function WebsiteLogoPicker({
  value,
  brand,
  disabled,
  onChange,
  onBusyChange,
}: {
  value: string;
  brand: string;
  disabled: boolean;
  onChange: (value: string) => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const upload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || loading) return;
    setError("");
    setLoading(true);
    onBusyChange(true);
    try {
      onChange(await prepareWebsiteLogo(file));
    } catch (error) {
      setError((error as Error).message || "We could not prepare this logo.");
    } finally {
      setLoading(false);
      onBusyChange(false);
    }
  };
  return (
    <div className="space-y-3 rounded-lg border p-4">
      <Label htmlFor="website-logo">Landing page logo (optional)</Label>
      {value && (
        <div className="rounded border bg-white p-3">
          <img
            src={value}
            alt={`${brand || "Your business"} logo preview`}
            className="h-24 max-w-full object-contain object-left"
          />
        </div>
      )}
      <Input
        id="website-logo"
        type="file"
        accept="image/png,image/jpeg,image/webp"
        disabled={disabled || loading}
        onChange={(event) => void upload(event)}
        aria-describedby="website-logo-help"
      />
      <p id="website-logo-help" className="text-xs text-muted-foreground">
        PNG, JPG or WebP, up to 5 MB. We resize it for your landing page and
        preserve transparent backgrounds. Save your page below to keep the
        change.
      </p>
      {loading && (
        <p role="status" className="text-sm">
          Preparing your logo…
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {value && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled || loading}
          onClick={() => {
            onChange("");
            setError("");
          }}
        >
          Remove logo
        </Button>
      )}
    </div>
  );
}

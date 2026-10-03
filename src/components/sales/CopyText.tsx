import { useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
export function CopyText({
  text,
  label = "Copy message",
  disabled = false,
}: {
  text: string;
  label?: string;
  disabled?: boolean;
}) {
  const [fallback, setFallback] = useState(false);
  return (
    <div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled || !text}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(text);
            toast.success("Copied. Review before sharing.");
          } catch {
            setFallback(true);
          }
        }}
      >
        {label}
      </Button>
      {fallback && (
        <textarea
          aria-label="Text to copy"
          className="w-full border rounded p-2 mt-2 text-sm"
          value={text}
          readOnly
          rows={4}
          onFocus={(e) => e.target.select()}
        />
      )}
    </div>
  );
}

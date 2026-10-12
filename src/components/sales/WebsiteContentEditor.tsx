import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { WebsiteContent } from "@/lib/websiteContent";
export function WebsiteContentEditor({
  value,
  onChange,
  disabled,
}: {
  value: WebsiteContent;
  onChange: (value: WebsiteContent) => void;
  disabled: boolean;
}) {
  const faq = (index: number, key: "question" | "answer", text: string) =>
    onChange({
      ...value,
      faqs: value.faqs.map((item, i) =>
        i === index ? { ...item, [key]: text } : item,
      ),
    });
  return (
    <fieldset disabled={disabled} className="border-t pt-5 space-y-4">
      <legend className="font-semibold pt-5">Your page content</legend>
      <p className="text-sm text-muted-foreground">
        Make this template your own. Clear a section to hide it. All of this
        content is public when you publish.
      </p>
      {(
        [
          ["about", "About your service"],
          ["services", "What you can help with"],
          ["devices", "Device & app guidance"],
        ] as const
      ).map(([key, label]) => (
        <div key={key}>
          <Label htmlFor={`page-${key}`}>{label}</Label>
          <textarea
            id={`page-${key}`}
            rows={4}
            maxLength={2000}
            value={value[key]}
            onChange={(e) => onChange({ ...value, [key]: e.target.value })}
            className="w-full rounded border p-3 text-sm"
          />
        </div>
      ))}
      <label className="flex gap-3 text-sm">
        <input
          type="checkbox"
          checked={value.show_steps}
          onChange={(e) => onChange({ ...value, show_steps: e.target.checked })}
        />
        <span>
          Show “How it works”: send an inquiry, discuss your options, choose
          your next step.
        </span>
      </label>
      <h3 className="font-semibold">Frequently asked questions</h3>
      {value.faqs.map((item, index) => (
        <div key={index} className="border-t pt-4 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor={`faq-q-${index}`}>Question {index + 1}</Label>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() =>
                onChange({
                  ...value,
                  faqs: value.faqs.filter((_, i) => i !== index),
                })
              }
              aria-label={`Remove question ${index + 1}`}
            >
              Remove
            </Button>
          </div>
          <Input
            id={`faq-q-${index}`}
            value={item.question}
            minLength={2}
            maxLength={160}
            required
            onChange={(e) => faq(index, "question", e.target.value)}
          />
          <Label htmlFor={`faq-a-${index}`}>Answer {index + 1}</Label>
          <textarea
            id={`faq-a-${index}`}
            value={item.answer}
            rows={3}
            minLength={2}
            maxLength={1000}
            required
            onChange={(e) => faq(index, "answer", e.target.value)}
            className="w-full rounded border p-3 text-sm"
          />
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        disabled={value.faqs.length >= 6}
        onClick={() =>
          onChange({
            ...value,
            faqs: [...value.faqs, { question: "", answer: "" }],
          })
        }
      >
        Add question
      </Button>
    </fieldset>
  );
}

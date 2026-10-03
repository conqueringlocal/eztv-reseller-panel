import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { calculateSalesQuote } from "@/lib/sales";
import { money } from "@/lib/business";
import { CopyText } from "./CopyText";
import { salesSelect } from "./LeadEditor";
export function QuoteCalculator({ unitPrice }: { unitPrice: number }) {
  const [connections, setConnections] = useState(1),
    [months, setMonths] = useState(1);
  const [cost, setCost] = useState(String(unitPrice)),
    [price, setPrice] = useState(""),
    [percent, setPercent] = useState(""),
    [fee, setFee] = useState(""),
    [support, setSupport] = useState(""),
    [target, setTarget] = useState("");
  const optional = (s: string) => (s.trim() === "" ? null : Number(s));
  const result = calculateSalesQuote({
    connections,
    months,
    unitCost: Number(cost),
    price: Number(price),
    feePercent: optional(percent),
    fixedFee: optional(fee),
    supportCost: optional(support),
    targetProfit: optional(target),
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle>Quote & margin calculator</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <p className="text-sm text-muted-foreground">
          All amounts are USD. One connection for one month uses one credit. Use
          your actual credit cost, payment fees and support allowance. This is a
          planning estimate before tax, refunds and other overhead.
        </p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <Label htmlFor="quote-connections">Connections</Label>
            <Input
              id="quote-connections"
              type="number"
              min="1"
              max="5"
              step="1"
              value={connections}
              onChange={(e) => setConnections(Number(e.target.value))}
            />
          </div>
          <div>
            <Label htmlFor="quote-months">Months</Label>
            <select
              id="quote-months"
              className={salesSelect}
              value={months}
              onChange={(e) => setMonths(Number(e.target.value))}
            >
              {[1, 3, 6, 12].map((n) => (
                <option key={n} value={n}>
                  {n} months
                </option>
              ))}
            </select>
          </div>
          {[
            {
              id: "cost",
              label: "Your cost per credit",
              value: cost,
              set: setCost,
            },
            {
              id: "price",
              label: "Total customer price",
              value: price,
              set: setPrice,
            },
            {
              id: "percent",
              label: "Payment fee (%)",
              value: percent,
              set: setPercent,
            },
            { id: "fee", label: "Fixed payment fee", value: fee, set: setFee },
            {
              id: "support",
              label: "Support / referral allowance",
              value: support,
              set: setSupport,
            },
            {
              id: "target",
              label: "Desired contribution (optional)",
              value: target,
              set: setTarget,
            },
          ].map((f) => (
            <div key={f.id}>
              <Label htmlFor={`quote-${f.id}`}>{f.label}</Label>
              <Input
                id={`quote-${f.id}`}
                type="number"
                step="0.01"
                min={f.id === "cost" || f.id === "price" ? "0.01" : "0"}
                max={f.id === "percent" ? "99.99" : "1000000"}
                value={f.value}
                onChange={(e) => f.set(e.target.value)}
                placeholder={
                  f.id === "price"
                    ? "Enter your selling price"
                    : "Enter actual amount, including zero"
                }
              />
            </div>
          ))}
        </div>
        {!result ? (
          <p className="text-muted-foreground">
            Enter a selling price and valid connection, duration and cost values
            to calculate.
          </p>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="rounded bg-slate-50 p-4">
                <p className="text-sm">Credits needed</p>
                <p className="text-2xl font-semibold">{result.credits}</p>
                <p className="text-sm">Credit cost: {money(result.cost)}</p>
              </div>
              <div className="rounded bg-slate-50 p-4">
                <p className="text-sm">Before fees & support</p>
                <p className="text-2xl font-semibold">{money(result.gross)}</p>
              </div>
              <div className="rounded bg-slate-50 p-4">
                <p className="text-sm">Estimated contribution</p>
                <p className="text-2xl font-semibold">
                  {result.net === null ? "—" : money(result.net)}
                </p>
                <p className="text-sm">
                  {result.margin === null
                    ? "Enter fees and support to calculate"
                    : `${result.margin.toFixed(1)}% margin`}
                </p>
              </div>
            </div>
            {result.net !== null && result.net <= 0 && (
              <p
                role="alert"
                className="text-amber-900 rounded border border-amber-300 bg-amber-50 p-3"
              >
                This price does not leave a positive contribution after the
                costs entered.
              </p>
            )}
            {result.minimumPrice !== null && (
              <p className="font-medium">
                Price needed for your desired contribution:{" "}
                {money(result.minimumPrice)}
              </p>
            )}
            <CopyText
              label="Copy customer quote"
              text={`Service quote: ${connections} connection${connections === 1 ? "" : "s"} for ${months} month${months === 1 ? "" : "s"} — ${money(Number(price))} USD total. Please confirm your device and app before payment. I’ll confirm the setup and service dates with you.`}
            />
            <p className="text-sm text-muted-foreground">
              The copied quote contains the customer price only. It does not
              charge the customer or reserve provider credits.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

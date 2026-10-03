import { useSearchParams } from "react-router-dom";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useSalesWorkspace } from "@/hooks/useSalesWorkspace";
import { LeadPipeline } from "@/components/sales/LeadPipeline";
import { QuoteCalculator } from "@/components/sales/QuoteCalculator";
import { SetupKit } from "@/components/sales/SetupKit";
import { ReferralTools } from "@/components/sales/ReferralTools";
import { SalesPageEditor } from "@/components/sales/SalesPageEditor";
import { RenewalWorklist } from "@/components/business/RenewalWorklist";
import { money } from "@/lib/business";
const tabs = {
  leads: "Leads & trials",
  today: "Today",
  quote: "Quote calculator",
  setup: "Setup kit",
  referrals: "Referrals",
  page: "Page & setup settings",
};
export default function ResellerSales() {
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") || "leads";
  const query = useSalesWorkspace();
  const data = query.data;
  return (
    <DashboardLayout>
      <div className="flex flex-wrap gap-3 justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold">Sales tools</h1>
          <p className="text-muted-foreground">
            Turn inquiries into customers, plan follow-ups, and check your
            margin.
          </p>
        </div>
        <Button
          variant="outline"
          disabled={query.isFetching}
          onClick={() => void query.refetch()}
        >
          Refresh
        </Button>
      </div>
      <div className="flex flex-wrap gap-2 mb-5">
        {Object.entries(tabs).map(([id, label]) => (
          <Button
            key={id}
            variant={tab === id ? "default" : "outline"}
            size="sm"
            onClick={() => setParams({ tab: id })}
          >
            {label}
          </Button>
        ))}
      </div>
      {query.isPending && <p role="status">Loading your sales workspace…</p>}
      {query.isError && (
        <p role="alert" className="text-destructive mb-4">
          Sales records could not be refreshed. Try Refresh before making
          changes.
        </p>
      )}
      {data && (
        <>
          {(tab === "leads" || tab === "today") && (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
                {[
                  ["New leads / 30 days", String(data.metrics.leads_30d)],
                  [
                    "Trial cohort converted",
                    `${data.metrics.trial_paid_30d} / ${data.metrics.trial_cohort_30d}`,
                  ],
                  [
                    "Recorded paid sales / 30 days",
                    `${data.metrics.sales_30d} · ${money(data.metrics.paid_revenue_30d)}`,
                  ],
                  [
                    "Contact time logged / 30 days",
                    `${data.metrics.contact_minutes_30d} minutes`,
                  ],
                ].map(([label, value]) => (
                  <Card key={label}>
                    <CardContent className="pt-4">
                      <p className="text-sm text-muted-foreground">{label}</p>
                      <p className="text-xl font-semibold mt-1">{value}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mb-5">
                Trial cohort means the recorded trial start is in the past 30
                days; some are still running. Sales are payments recorded by
                you, excluding recorded full refunds. These figures are not
                profit or a complete payment ledger.
              </p>
            </>
          )}
          {(tab === "leads" || !(tab in tabs)) && <LeadPipeline data={data} />}
          {tab === "today" && (
            <div className="space-y-5">
              <LeadPipeline data={data} today />
              <RenewalWorklist />
            </div>
          )}
          {tab === "quote" && (
            <QuoteCalculator unitPrice={data.credit_unit_price} />
          )}
          {tab === "setup" && <SetupKit page={data.page} />}
          {tab === "referrals" && <ReferralTools data={data} />}
          {tab === "page" && (
            <SalesPageEditor key={data.page?.revision || 0} page={data.page} />
          )}
        </>
      )}
    </DashboardLayout>
  );
}

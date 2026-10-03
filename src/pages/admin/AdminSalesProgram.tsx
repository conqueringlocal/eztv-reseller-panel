import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { money } from "@/lib/business";
interface Row {
  reseller_id: string;
  name: string;
  leads_30d: number;
  trials_30d: number;
  trial_paid_30d: number;
  sales_30d: number;
  revenue_30d: number;
  minutes_30d: number;
  page_published: boolean;
}
export default function AdminSalesProgram() {
  const { user } = useAuth();
  const query = useQuery({
    queryKey: ["sales-program", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_sales_program_summary");
      if (error) throw error;
      return data as unknown as Row[];
    },
    refetchInterval: 60000,
  });
  return (
    <DashboardLayout>
      <div className="flex justify-between flex-wrap gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold">Reseller sales program</h1>
          <p className="text-muted-foreground">
            Review adoption and recorded outcomes over the past 30 days.
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
      {query.isPending && <p>Loading program results…</p>}
      {query.isError && <p role="alert">Results could not be refreshed.</p>}
      <Card>
        <CardHeader>
          <CardTitle>Sales activity by reseller</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            These are reseller-recorded first sales and follow-ups. They do not
            replace verified credit purchases in Finances. Trial conversion uses
            the recorded trial start in the last 30 days, including trials still
            running.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b">
                  {[
                    "Reseller",
                    "New leads",
                    "Trials → paid",
                    "Recorded sales",
                    "Recorded revenue",
                    "Contact time",
                    "Page",
                  ].map((h) => (
                    <th className="p-2" key={h}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {query.data?.map((r) => (
                  <tr key={r.reseller_id} className="border-b">
                    <td className="p-2">{r.name}</td>
                    <td className="p-2">{r.leads_30d}</td>
                    <td className="p-2">
                      {r.trials_30d} → {r.trial_paid_30d}
                    </td>
                    <td className="p-2">{r.sales_30d}</td>
                    <td className="p-2">{money(r.revenue_30d)}</td>
                    <td className="p-2">{r.minutes_30d} min</td>
                    <td className="p-2">
                      {r.page_published ? "Published" : "Draft / not set"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>30-day pilot checklist</CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-3">
          <p>
            Start with two willing resellers. Record the starting figures, then
            review the same measures weekly: trial conversion, paid sales,
            renewal opportunities, discount costs, referral costs and support
            time.
          </p>
          <p>
            Have each reseller configure their page, link existing trials, price
            an example quote, and review Today’s list daily. Discuss lost
            reasons and setup problems before changing offers.
          </p>
        </CardContent>
      </Card>
    </DashboardLayout>
  );
}

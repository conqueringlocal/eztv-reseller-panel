import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useSalesWorkspace } from "@/hooks/useSalesWorkspace";
import { needsFollowUp } from "@/lib/sales";
export function SalesTodaySummary() {
  const query = useSalesWorkspace();
  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle>Your sales follow-ups</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-wrap justify-between gap-3 items-center">
        <p className="text-sm">
          {query.isError
            ? "Follow-ups could not be refreshed."
            : query.data
              ? `${query.data.leads.filter((l) => needsFollowUp(l)).length} leads need a next action or trial follow-up.`
              : "Loading follow-ups…"}
        </p>
        <Button asChild>
          <Link to="/reseller/sales?tab=today">Open Today’s list</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

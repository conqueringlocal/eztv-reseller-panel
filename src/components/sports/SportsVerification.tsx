import { Badge } from "@/components/ui/badge";
export type EventCheck = {
  text: string;
  status: "verified" | "date_verified" | "review" | "unverified";
  reason: string;
  source_name?: string;
  source_url?: string;
  start_at?: string | null;
  event_state?: string;
};
export type Verification = {
  items: EventCheck[];
  checked_at: string | null;
  fresh: boolean;
};
const labels = {
  verified: "Schedule verified",
  date_verified: "Date verified",
  review: "Needs review",
  unverified: "Unverified",
};
const reasons: Record<string, string> = {
  matched:
    "Teams, date and supplied Eastern time match the source (within 15 minutes).",
  time_unknown:
    "Event and date confirmed. The provider’s time could not be independently matched.",
  time_mismatch:
    "The provider’s time differs from the schedule. This may be a broadcast start time.",
  different_date:
    "The matching event is scheduled on a different Eastern date. Check the source.",
  cancelled: "The schedule source reports this event cancelled.",
  postponed: "The schedule source reports this event postponed.",
  delayed: "The schedule source reports a delay or suspension.",
  not_found: "No matching event found in the checked schedule.",
  ambiguous: "More than one possible event matches this listing.",
  unsupported:
    "This event is outside the current NHL, NFL, NBA and MLB matching coverage.",
  source_unavailable: "The schedule source was unavailable during this check.",
  pending: "Waiting for an independent schedule check.",
  stale: "The previous check has expired. Waiting for a fresh schedule check.",
};
const states: Record<string, string> = {
  upcoming: "Upcoming",
  live: "Live",
  finished: "Finished",
  delayed: "Delayed",
  cancelled: "Cancelled",
  postponed: "Postponed",
};
const time = (s: string) =>
  new Date(s).toLocaleString([], {
    timeZone: "America/New_York",
    timeZoneName: "short",
  });
export function SportsVerification({
  verification,
  now,
}: {
  verification: Verification;
  now: number;
}) {
  const fresh =
    verification.fresh &&
    !!verification.checked_at &&
    now - Date.parse(verification.checked_at) < 30 * 60 * 1000;
  return (
    <div className="space-y-3">
      {verification.items.map((item, index) => {
        const status = fresh ? item.status : "unverified";
        const reason = fresh
          ? item.reason
          : verification.checked_at
            ? "stale"
            : "pending";
        const link =
          item.source_url &&
          /^https:\/\/www\.(nhl\.com|mlb\.com|espn\.com)\//.test(
            item.source_url,
          )
            ? item.source_url
            : null;
        return (
          <div key={index} className="rounded-md border p-3 space-y-2">
            <p className="break-words [overflow-wrap:anywhere] text-sm leading-relaxed">
              {item.text}
            </p>
            <div className="flex flex-wrap gap-2">
              <Badge
                variant="outline"
                className={
                  status === "verified" || status === "date_verified"
                    ? "border-green-300 bg-green-50 text-green-900"
                    : status === "review"
                      ? "border-amber-300 bg-amber-50 text-amber-900"
                      : ""
                }
              >
                {labels[status]}
              </Badge>
              {fresh && item.event_state && states[item.event_state] && (
                <Badge variant="secondary">{states[item.event_state]}</Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {reasons[reason] || reasons.not_found}
            </p>
            {fresh && item.start_at && (
              <p className="text-xs">Scheduled start: {time(item.start_at)}</p>
            )}
            {(link || verification.checked_at) && (
              <p className="text-xs text-muted-foreground">
                {link && (
                  <a
                    href={link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary underline"
                  >
                    {item.source_name} schedule
                  </a>
                )}
                {link && verification.checked_at && " · "}
                {verification.checked_at &&
                  `Checked ${time(verification.checked_at)}`}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

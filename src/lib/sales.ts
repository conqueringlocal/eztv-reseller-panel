export const stages = {
  new: "New inquiry",
  setup: "Setup needed",
  trial: "Trial running",
  follow_up: "Follow-up",
  paid: "Paid",
  lost: "Lost",
  refunded: "Refunded",
} as const;
export type LeadStage = keyof typeof stages;
export interface SalesLead {
  id: string;
  reseller_id: string;
  name: string;
  email: string;
  phone: string;
  device: string;
  source: string;
  stage: LeadStage;
  customer_id: string | null;
  referral_id: string | null;
  next_action: string;
  follow_up_at: string | null;
  trial_started_at: string | null;
  trial_ends_at: string | null;
  notes: string;
  lost_reason: string;
  paid_amount: number;
  payment_reference: string | null;
  paid_at: string | null;
  refund_reference: string | null;
  refunded_at: string | null;
  do_not_contact: boolean;
  contact_requested_at: string | null;
  marketing_opt_in_at: string | null;
  revision: number;
  created_at: string;
  updated_at: string;
}
export interface SalesPage {
  reseller_id: string;
  slug: string;
  brand_name: string;
  headline: string;
  description: string;
  contact_email: string;
  accent_color: string;
  setup_notes: string;
  tutorial_url: string;
  published: boolean;
  revision: number;
}
export interface SalesActivity {
  id: string;
  lead_id: string;
  kind: string;
  note: string;
  minutes: number;
  created_at: string;
}
export interface Referral {
  id: string;
  customer_id: string;
  label: string;
  enabled: boolean;
}
export interface Reward {
  lead_id: string;
  credits: number;
  cash_amount: number;
  reference: string;
  note: string;
}
export interface SalesWorkspace {
  leads: SalesLead[];
  lead_count: number;
  activities: SalesActivity[];
  page: SalesPage | null;
  referrals: Referral[];
  rewards: Reward[];
  credit_unit_price: number;
  customers: { id: string; name: string; is_trial: boolean }[];
  metrics: {
    leads_30d: number;
    trial_cohort_30d: number;
    trial_paid_30d: number;
    sales_30d: number;
    paid_revenue_30d: number;
    contact_minutes_30d: number;
  };
}
export type PublicSalesPage = Pick<
  SalesPage,
  | "slug"
  | "brand_name"
  | "headline"
  | "description"
  | "contact_email"
  | "accent_color"
>;
export const localDateTime = (value: string | null) => {
  if (!value) return "";
  const d = new Date(value);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
};
export const toISO = (value: string) =>
  value ? new Date(value).toISOString() : null;
export function needsFollowUp(lead: SalesLead, now = Date.now()) {
  if (lead.do_not_contact || ["paid", "lost", "refunded"].includes(lead.stage))
    return false;
  return (
    !lead.follow_up_at ||
    new Date(lead.follow_up_at).getTime() <= now ||
    (lead.stage === "trial" &&
      !!lead.trial_ends_at &&
      new Date(lead.trial_ends_at).getTime() <= now + 24 * 3600000)
  );
}
export function leadMessage(lead: SalesLead) {
  if (lead.do_not_contact) return "";
  if (lead.stage === "setup")
    return `Hi ${lead.name}, were you able to get set up? Let me know your device, app name, and what you see on screen so I can help.`;
  if (lead.stage === "trial")
    return `Hi ${lead.name}, how has your trial been? Did you get a chance to try it on your usual device? Let me know if you need help or would like me to confirm the subscription options.`;
  return `Hi ${lead.name}, I’m following up on your streaming service inquiry. What device would you like to use, and is there anything you would like me to clarify before you decide?`;
}
export interface QuoteInput {
  connections: number;
  months: number;
  unitCost: number;
  price: number;
  feePercent: number | null;
  fixedFee: number | null;
  supportCost: number | null;
  targetProfit: number | null;
}
export function calculateSalesQuote(input: QuoteInput) {
  const {
    connections,
    months,
    unitCost,
    price,
    feePercent,
    fixedFee,
    supportCost,
    targetProfit,
  } = input;
  if (
    !Number.isInteger(connections) ||
    connections < 1 ||
    connections > 5 ||
    ![1, 3, 6, 12].includes(months) ||
    !Number.isFinite(unitCost) ||
    unitCost <= 0 ||
    !Number.isFinite(price) ||
    price <= 0
  )
    return null;
  if (
    [feePercent, fixedFee, supportCost, targetProfit].some(
      (x) => x !== null && (!Number.isFinite(x) || x < 0),
    ) ||
    (feePercent !== null && feePercent >= 100)
  )
    return null;
  const credits = connections * months,
    cost = credits * unitCost;
  const complete =
    feePercent !== null && fixedFee !== null && supportCost !== null;
  const net = complete
    ? price - cost - (price * feePercent) / 100 - fixedFee - supportCost
    : null;
  return {
    credits,
    cost,
    gross: price - cost,
    net,
    margin: net === null ? null : (net / price) * 100,
    minimumPrice:
      complete && targetProfit !== null
        ? Math.ceil(
            ((cost + fixedFee + supportCost + targetProfit) /
              (1 - feePercent / 100)) *
              100,
          ) / 100
        : null,
  };
}

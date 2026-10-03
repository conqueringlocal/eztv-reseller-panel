export type EntryKind = 'sale' | 'payment_fee' | 'provider_purchase' | 'expense' | 'refund' | 'credit_loss' | 'complimentary' | 'owner_time';
export interface BusinessEntry {
  id: string; kind: EntryKind; occurred_on: string; amount: number; credits: number; unit_cost: number;
  reseller_id: string | null; reference: string; note: string; related_sale_id: string | null;
  source_request_id: string | null; voided_at: string | null; void_reason: string | null;
}
export interface RecordedSale { id: string; reference: string; reseller_id: string; amount: number; occurred_on: string; needs_fee: boolean }
export interface BusinessDashboard {
  month: string; unit_cost: number; planning_batch_credits: number; planning_batch_cost: number;
  outstanding_credits: number; held_credits: number; balance_needs_check: boolean;
  provider_balance: { credits: number; checked_at: string } | null;
  pending_payments: number; unresolved_operations: number; completed_credits_used: number; legacy_unpriced_additions: number;
  summary: { sales: number; credits_sold: number; fulfillment_estimate: number; fees: number; refunds: number;
    expenses: number; owner_time: number; provider_purchases: number; provider_credits: number;
    lost_credits: number; complimentary_credits: number; loss_estimate: number; missing_fees: number };
  entries: BusinessEntry[]; sales_for_review: RecordedSale[];
  resellers: { id: string; name: string; credits: number }[];
  by_reseller: { reseller_id: string; sales: number | null; credits_sold: number; contribution: number }[];
}
export interface RenewalItem {
  customer_id: string; customer_name: string; reseller_id: string; reseller_name: string;
  first_expiry: string; last_expiry: string; days_until: number; connections: number | null; review_reason: string | null; group_rows: number;
}
export const money = (value: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
export const todayUTC = () => new Date().toISOString().slice(0, 10);
export const entryLabels: Record<EntryKind, string> = {
  sale: 'Historical payment received', payment_fee: 'Actual payment fee', provider_purchase: 'Trex credit purchase',
  expense: 'Cash operating expense', refund: 'Cash refund paid', credit_loss: 'Confirmed lost credits',
  complimentary: 'Complimentary credits already issued', owner_time: 'Owner time value (non-cash)',
};
export function businessTotals(data: BusinessDashboard) {
  const s = data.summary;
  return {
    netCash: s.sales - s.fees - s.refunds - s.expenses - s.provider_purchases,
    contribution: s.sales - s.fees - s.refunds - s.fulfillment_estimate - s.loss_estimate,
    operatingEstimate: s.sales - s.fees - s.refunds - s.fulfillment_estimate - s.loss_estimate - s.expenses - s.owner_time,
  };
}
export function providerCoverage(data: BusinessDashboard) {
  const uncovered = data.provider_balance ? Math.max(0, data.outstanding_credits - data.provider_balance.credits) : null;
  const batches = uncovered === null ? null : Math.ceil(uncovered / data.planning_batch_credits);
  return { uncovered, batches, restockCash: batches === null ? null : batches * data.planning_batch_cost };
}
export function reminderText(item: RenewalItem) {
  return `Hi ${item.customer_name}, your EZTV service ${item.days_until < 0 ? 'had a recorded expiry of' : 'has a recorded expiry of'} ${item.first_expiry}${item.last_expiry !== item.first_expiry ? ` (other connections run through ${item.last_expiry})` : ''}. Please contact me if you would like to renew, and I can confirm your options and price.`;
}

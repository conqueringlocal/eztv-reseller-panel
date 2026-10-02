type CreationResult = {
  code?: string;
  requestId?: string;
  error?: string;
  needsReview?: boolean;
  customerCount?: number;
};

export function customerCreationFailure(result?: CreationResult | null): string {
  const reference = typeof result?.requestId === 'string' && /^[0-9a-f-]{36}$/i.test(result.requestId)
    ? ` Reference: ${result.requestId}.` : '';
  if (result?.needsReview || result?.code === 'request_already_pending') {
    const saved = Number.isInteger(result.customerCount) && result.customerCount! > 0
      ? `${result.customerCount} connection(s) were saved. ` : '';
    return `${saved}This attempt needs review. Do not create the customer again; contact support.${reference}`;
  }
  if (result?.code === 'insufficient_credits' && /^Insufficient credits\. Required: \d+, available: \d+\.$/.test(result.error || '')) {
    return result.error!;
  }
  if (result?.code === 'creation_paused') return 'Customer creation is temporarily paused. Contact support about an existing attempt.';
  if (result?.code === 'provider_configuration') return 'Trex connection settings are missing. Please contact support.';
  if (result?.code === 'invalid_request') return 'Please check the customer details, package, duration, and connection count.';
  if (result?.code === 'guard_unavailable' || result?.code === 'creation_unavailable') {
    return 'Customer creation is unavailable. No provider request was sent. Please contact support.';
  }
  // A failed network request or old backend response does not prove creation failed.
  // Never expose arbitrary provider error text: it can contain credentials or URLs.
  return `The creation result could not be confirmed. Do not create the customer again; contact support.${reference}`;
}

// Commerce (MOT-41/42/43): adapter states only. No provider access in this build => checkout unavailable.
export type OrderState = 'pending' | 'paid' | 'abandoned' | 'refunded' | 'fulfillment_failed';
export interface Order { id: string; state: OrderState; totalCents: number; currency: string; events: string[]; }

export function checkoutAvailable(): { available: false; reason: string } {
  return { available: false, reason: 'Checkout is unavailable: FCC Shop ordering is off and no payment provider is connected.' };
}

/** One correct state per event; duplicate webhooks never double-apply. Browser return never marks paid. */
export function applyOrderEvent(order: Order, event: 'provider_paid' | 'provider_abandoned' | 'provider_refunded' | 'fulfillment_failed' | 'browser_return'): Order {
  if (order.events.includes(event + ':' + order.state) && event === 'provider_paid' && order.state === 'paid') return order;
  const seen = new Set(order.events);
  const key = event;
  if (seen.has(key)) return order;
  const next: Order = { ...order, events: [...order.events, key] };
  if (event === 'browser_return') return next; // A browser return page never marks an order paid.
  if (event === 'provider_paid' && order.state === 'pending') next.state = 'paid';
  else if (event === 'provider_abandoned' && order.state === 'pending') next.state = 'abandoned';
  else if (event === 'provider_refunded' && order.state === 'paid') next.state = 'refunded';
  else if (event === 'fulfillment_failed' && order.state === 'paid') next.state = 'fulfillment_failed';
  return next;
}

/** Host ledger (MOT-42): share states only. Guest identity/address never enter this view. */
export type LedgerState = 'pending' | 'payable' | 'paid' | 'reversed';
export interface LedgerEntry { id: string; orderId: string; hostShareCents: number; state: LedgerState; }
export function ledgerFromOrder(order: Order, entry: LedgerEntry): LedgerEntry {
  if (order.state === 'refunded') return { ...entry, state: 'reversed' };
  if (order.state === 'paid') return { ...entry, state: 'payable' };
  return { ...entry, state: 'pending' };
}
export function hostLedgerView(entries: LedgerEntry[]): LedgerEntry[] {
  // Deliberately only money + state fields exist on LedgerEntry: no guest identity or address to leak.
  return entries.map((e) => ({ id: e.id, orderId: e.orderId, hostShareCents: e.hostShareCents, state: e.state }));
}

/** Photobook ordering (MOT-43): no partner account => unavailable with the reason. Sandbox is a labeled test adapter only. */
export function placePhotobookOrder(partner: 'none' | 'sandbox', sandbox: { reject?: string } = {}):
  { status: 'unavailable'; reason: string } | { status: 'sandbox_accepted'; label: string } | { status: 'rejected'; reason: string; label: string } {
  if (partner === 'none') return { status: 'unavailable', reason: 'Photobook ordering is unavailable: no partner account is connected.' };
  // A partner rejection is shown with the partner's reason, never retried silently.
  if (sandbox.reject) return { status: 'rejected', reason: sandbox.reject, label: 'Sandbox test adapter rejection (not a real partner)' };
  return { status: 'sandbox_accepted', label: 'Sandbox test order (labeled test adapter, not a real order)' };
}

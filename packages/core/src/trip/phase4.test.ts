import { describe, expect, it } from 'vitest';
import type { Actor } from '../doc/model.ts';
import { CommandError } from '../commands/define.ts';
import { createTrip } from './model.ts';
import { TripSession } from './session.ts';
import { runAutopilot } from './autopilot.ts';
import { itineraryHtml, memorabiliaHtml, photobookPages, posterSvg } from './render.ts';
import { applyOrderEvent, checkoutAvailable, hostLedgerView, ledgerFromOrder, placePhotobookOrder, type Order } from './commerce.ts';
import { runFakeAgent } from './agent-fake.ts';

const human: Actor = { kind: 'human', id: 'you', name: 'You' };
const agent: Actor = { kind: 'agent', id: 'agent:fake', name: 'Fake' };
let n = 1000; const nid = () => `p-${++n}`;
function make(mode: 'together' | 'autopilot' = 'autopilot') {
  const s = new TripSession(createTrip({ title: 'T', city: 'bangkok', timeZone: 'Asia/Bangkok', agentMode: mode, newId: nid }), { newId: nid });
  s.execute(human, 'trip_card_create', { kind: 'place', title: 'Market', scope: 'guide', provenance: 'host', location: { lat: 13.7, lng: 100.5, source: 'catalog' } });
  s.execute(human, 'trip_card_create', { kind: 'note', title: 'DiarySecret', scope: 'private' });
  return s;
}

describe('MOT-26 autopilot', () => {
  it('refuses off-list ops and stops on budget, saying so', async () => {
    const s = make();
    const p = (await runFakeAgent(s)).proposal;
    const evil = { ...p, id: 'ap-evil', ops: [{ command: 'trip_card_delete', input: { id: 'x' } }] };
    expect(() => runAutopilot(s, agent, [evil])).toThrowError(CommandError);
    const many = Array.from({ length: 5 }, (_, i) => ({ ...p, id: `ap-${i}` }));
    expect(runAutopilot(s, agent, many).stopped).toContain('Budget');
    const off = make('together'); const p2 = (await runFakeAgent(off)).proposal;
    expect(runAutopilot(off, agent, [p2]).stopped).toContain('Autopilot is off');
  });
});

describe('MOT-40 renders', () => {
  it('itinerary and memorabilia exclude private and excluded photos, without AI', () => {
    const s = make();
    expect(itineraryHtml(s.doc)).toContain('Market'); expect(itineraryHtml(s.doc)).not.toContain('DiarySecret');
    expect(memorabiliaHtml(s.doc, new Set(['a1']))).not.toContain('DiarySecret');
  });
  it('poster preflight at declared size; photobook flags low-res by spread', () => {
    const s = make();
    const poster = posterSvg(s.doc); expect(poster.widthMm).toBe(420); expect(poster.preflight.ok).toBe(true);
    const book = photobookPages(s.doc, new Map([['a1', 100]]));
    expect(book.pages.length).toBeGreaterThanOrEqual(24); expect(book.label).toContain('unverified');
  });
});

describe('MOT-41/42/43 commerce', () => {
  it('checkout unavailable; events give one correct state; browser return never pays; refund reverses share', () => {
    expect(checkoutAvailable().available).toBe(false);
    let order: Order = { id: 'o1', state: 'pending', totalCents: 1000, currency: 'THB', events: [] };
    order = applyOrderEvent(order, 'browser_return'); expect(order.state).toBe('pending');
    order = applyOrderEvent(order, 'provider_paid'); order = applyOrderEvent(order, 'provider_paid'); expect(order.state).toBe('paid');
    const entry = ledgerFromOrder(order, { id: 'l1', orderId: 'o1', hostShareCents: 200, state: 'pending' });
    expect(entry.state).toBe('payable');
    order = applyOrderEvent(order, 'provider_refunded');
    expect(ledgerFromOrder(order, entry).state).toBe('reversed');
    expect(hostLedgerView([entry])[0]).not.toHaveProperty('guest');
    expect(placePhotobookOrder('none').status).toBe('unavailable');
    expect(placePhotobookOrder('sandbox')).toMatchObject({ status: 'sandbox_accepted' });
  });
});

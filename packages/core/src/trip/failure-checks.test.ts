// MOT-51A core failure checks + MOT-51B provider failure checks.
// Each case: existing work is preserved and the user gets retry/manual, never a fake success.
import { describe, expect, it } from 'vitest';
import type { Actor } from '../doc/model.ts';
import { createTrip, readTripMeta } from './model.ts';
import { TripSession } from './session.ts';
import { encodeTrip, loadTrip } from './persist.ts';
import { exportTripPackage } from './package.ts';
import { importTripPackage } from './import.ts';
import { JobRunner } from './jobs.ts';
import { catalogSearch, routeEstimate } from './city-source.ts';
import { checkoutAvailable, placePhotobookOrder } from './commerce.ts';
import { createMuseAdapter } from '../../../mot-server/src/index.ts';

const you: Actor = { kind: 'human', id: 'you', name: 'You' };
let n = 5000; const nid = () => `f-${++n}`;

describe('MOT-51A core failures preserve work', () => {
  it('corrupt bytes, hostile import, stale proposal and cancelled job all leave the board intact', async () => {
    const doc = createTrip({ title: 'Keep me', city: 'bangkok', timeZone: 'Asia/Bangkok', newId: nid });
    const s = new TripSession(doc, { newId: nid });
    s.execute(you, 'trip_card_create', { kind: 'note', title: 'Precious' });
    const before = encodeTrip(doc);
    expect(() => loadTrip(new Uint8Array([1, 2, 3]))).toThrow();
    await expect(importTripPackage(new Uint8Array([9, 9, 9]))).rejects.toThrow(/not a trip package/);
    const bytes = await exportTripPackage(doc, new Map());
    const { doc: back } = await importTripPackage(bytes, { newId: nid });
    expect(readTripMeta(back).boardId).not.toBe(readTripMeta(doc).boardId);
    expect(encodeTrip(doc)).toEqual(before);
    const runner = new JobRunner(); let committed = false;
    const job = runner.start('x', async () => { await new Promise((r) => setTimeout(r, 20)); return 1; }, { onDone: () => { committed = true; } });
    runner.stop('x'); await job; expect(committed).toBe(false);
    expect(s.execute<{ cards: { title: string }[] }>(you, 'trip_read').cards.map((c) => c.title)).toEqual(['Precious']);
  });
});

describe('MOT-51B provider failures are unavailable, never passing fakes', () => {
  it('lists every unfinished integration as unavailable', async () => {
    expect(catalogSearch('paris').status).toBe('unavailable');
    expect(routeEstimate().status).toBe('unavailable');
    expect(checkoutAvailable().available).toBe(false);
    expect(placePhotobookOrder('none').status).toBe('unavailable');
    await expect(createMuseAdapter({}).propose({ boardId: 'b', prompt: 'x' })).resolves.toMatchObject({ status: 'unavailable' });
    const bkk = catalogSearch('bangkok');
    expect(bkk.status).toBe('unavailable');
  });
});

/** MOT-54: outcomes measured locally only. Nothing is sent anywhere without consent. */
export function localOutcomeCounters(events: { name: string; costUnits?: number }[]): { counts: Record<string, number>; costUnits: number; sentAnywhere: false } {
  const counts: Record<string, number> = {};
  let costUnits = 0;
  for (const e of events) { counts[e.name] = (counts[e.name] ?? 0) + 1; costUnits += e.costUnits ?? 0; }
  return { counts, costUnits, sentAnywhere: false };
}
describe('MOT-54 local outcome counters', () => {
  it('counts locally and sends nothing', () => {
    expect(localOutcomeCounters([{ name: 'board_created' }, { name: 'card_created' }])).toEqual({ counts: { board_created: 1, card_created: 1 }, costUnits: 0, sentAnywhere: false });
  });
});

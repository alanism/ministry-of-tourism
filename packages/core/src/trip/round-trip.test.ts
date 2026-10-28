// MOT-18: package round-trip in npm run check, incl. hostile package.
import { describe, expect, it } from 'vitest';
import { zipSync } from 'fflate';
import type { Actor } from '../doc/model.ts';
import { createTrip, readTripMeta } from './model.ts';
import { TripSession } from './session.ts';
import { exportTripPackage } from './package.ts';
import { importTripPackage } from './import.ts';
import { encodeTrip } from './persist.ts';

const you: Actor = { kind: 'human', id: 'you', name: 'You' };
const enc = (s: string) => new TextEncoder().encode(s);

describe('package round-trip', () => {
  it('export -> fresh import keeps layout and gives a new identity; hostile package changes nothing', async () => {
    let n = 0; const nid = () => `r-${++n}`;
    const doc = createTrip({ title: 'RT', city: 'bangkok', timeZone: 'Asia/Bangkok', newId: nid });
    const s = new TripSession(doc, { newId: nid });
    const { id } = s.execute<{ id: string }>(you, 'trip_card_create', { kind: 'place', title: 'Market', stage: 'explore', x: 42, y: 7, scope: 'guide', provenance: 'host' });
    s.execute(you, 'trip_card_create', { kind: 'note', title: 'PrivateDiary', scope: 'private' });
    const bytes = await exportTripPackage(doc, new Map(), { created: '2026-10-28T00:00:00Z' });
    const { doc: back } = await importTripPackage(bytes, { newId: nid });
    const cards = new TripSession(back, { newId: nid }).execute<{ cards: { id: string; x: number; y: number; title: string }[] }>(you, 'trip_read').cards;
    expect(cards).toEqual([expect.objectContaining({ id, x: 42, y: 7, title: 'Market' })]);
    expect(readTripMeta(back).boardId).not.toBe(readTripMeta(doc).boardId);
    const before = encodeTrip(doc);
    const hostile = zipSync({ 'manifest.json': enc('{}'), '../x': enc('y') });
    await expect(importTripPackage(hostile)).rejects.toThrow();
    expect(encodeTrip(doc)).toEqual(before);
  });
});

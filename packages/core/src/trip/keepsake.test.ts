import { describe, expect, it } from 'vitest';
import type { Actor } from '../doc/model.ts';
import { createTrip } from './model.ts';
import { TripSession } from './session.ts';
import { SnapshotStore, makeSnapshot, mapPins, postcardSvg } from './keepsake.ts';

const you: Actor = { kind: 'human', id: 'you', name: 'You' };
let n = 0; const nid = () => `k-${++n}`;

describe('MOT-33/34/35 keepsakes', () => {
  it('snapshot is a frozen copy, excludes private, and delete removes it', () => {
    const doc = createTrip({ title: 'T', city: 'bangkok', timeZone: 'Asia/Bangkok', newId: nid });
    const s = new TripSession(doc, { newId: nid });
    s.execute(you, 'trip_card_create', { kind: 'note', title: 'Public', scope: 'guide' });
    s.execute(you, 'trip_card_create', { kind: 'note', title: 'Hidden', scope: 'private' });
    const store = new SnapshotStore();
    store.put(makeSnapshot(doc, 'snap-1'));
    s.execute(you, 'trip_card_create', { kind: 'note', title: 'Later' });
    expect(store.get('snap-1')!.cards.map((c) => c.title)).toEqual(['Public']);
    expect(store.delete('snap-1')).toBe(true); expect(store.get('snap-1')).toBeUndefined();
  });
  it('every map pin traces to a source or traveler, with attribution', () => {
    const doc = createTrip({ title: 'T', city: 'bangkok', timeZone: 'Asia/Bangkok', newId: nid });
    const s = new TripSession(doc, { newId: nid });
    s.execute(you, 'trip_card_create', { kind: 'place', title: 'P', location: { lat: 13.7, lng: 100.5, source: 'traveler' } });
    const { pins, attribution } = mapPins(doc);
    expect(pins[0]?.trace).toBe('traveler:you'); expect(attribution).toContain('unknown');
  });
  it('low-res postcard warns and is never labeled print-ready', () => {
    const low = postcardSvg({ title: 'Hi', note: 'Miss you', imageHref: 'x.jpg', imageWidthPx: 100 });
    expect(low.warnings.length).toBeGreaterThan(0); expect(low.label).toContain('not print-ready');
    expect(low.widthMm).toBe(154); // 148 + 3mm bleed each side
    expect(low.svg).toContain('Derivative keepsake');
  });
});

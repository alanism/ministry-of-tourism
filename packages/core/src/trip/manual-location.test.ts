import { expect, it } from 'vitest';
import * as core from '../index.ts';
const actor = { kind: 'human' as const, id: 'traveler', name: 'Traveler' };
const agent = { kind: 'agent' as const, id: 'assistant', name: 'Assistant' };
function setup() {
  const session = new core.TripSession(core.createTrip({ title: 'Manual place', city: 'Aspen', timeZone: 'America/Denver' }));
  const { id } = session.execute<{ id: string }>(actor, 'trip_card_create', { kind: 'note', title: 'Meeting point', scope: 'stay' });
  return { session, id };
}
it('keeps user-saved address/link and manual pin through one-step Undo, revisions and native reopen', async () => {
  const { session: s, id } = setup(), before = s.boardRev;
  const location = { lat: 39.1911, lng: -106.8175, source: 'traveler' };
  s.execute(actor, 'trip_card_update', { id, address: 'Synthetic meeting point', mapUrl: 'https://maps.example.test/place?label=Aspen', location });
  expect(s.boardRev).toBeGreaterThan(before);
  expect(core.readCard(s.parts, id)).toMatchObject({ address: 'Synthetic meeting point', location });
  s.undo(actor.id); expect(core.readCard(s.parts, id)?.location).toBeUndefined();
  s.redo(actor.id);
  const copy = await core.importTripPackage(await core.exportTripPackage(s.doc, new Map(), { variant: 'private' }));
  expect(core.readCard(core.tripParts(copy.doc), id)).toMatchObject({ address: 'Synthetic meeting point', mapUrl: 'https://maps.example.test/place?label=Aspen', location });
  s.execute(actor, 'trip_card_update', { id, location: null });
  expect(core.readCard(s.parts, id)?.location).toBeUndefined();
  expect((core.readCard(s.parts, id) as unknown as { address: string }).address).toBe('Synthetic meeting point');
  s.execute(actor, 'trip_card_update', { id, address: null, mapUrl: null });
  expect((core.readCard(s.parts, id) as unknown as { address?: string }).address).toBeUndefined();
});
it('rejects unsafe links, malformed pins and agent claims before partial edits', () => {
  const { session: s, id } = setup(), before = core.encodeTrip(s.doc);
  for (const extra of [{ mapUrl: 'javascript:alert(1)' }, { mapUrl: 'https://name:secret@example.test' }, { location: { lat: 91, lng: 0, source: 'traveler' } }, { location: { lat: 0, source: 'traveler' } }]) {
    expect(() => s.execute(actor, 'trip_card_update', { id, title: 'SHOULD NOT LAND', ...extra })).toThrow();
  }
  expect(() => s.execute(agent, 'trip_card_update', { id, location: { lat: 0, lng: 0, source: 'traveler' } })).toThrow();
  expect(() => s.execute(agent, 'trip_card_create', { kind: 'note', address: 'Invented personal address' })).toThrow();
  expect(core.encodeTrip(s.doc)).toEqual(before);
});

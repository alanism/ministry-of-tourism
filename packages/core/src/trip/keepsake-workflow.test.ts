import { strToU8 } from 'fflate';
import { describe, expect, it } from 'vitest';
import { importTripPackage } from './import.ts';
import { memoryShortlist, reusableArt, reviewKeepsakePages } from './keepsake-workflow.ts';
import { createTrip, readAllCards, readPresentations, tripParts } from './model.ts';
import { exportTripPackage, sha256Hex } from './package.ts';
import { TripSession } from './session.ts';
import { routeWorkflow } from './workflow-routing.ts';

const owner = { kind: 'human' as const, id: 'owner', name: 'Owner' };
async function trip() {
  let n = 0;
  const session = new TripSession(createTrip({ title: 'Lisbon', city: 'Lisbon', cityId: 'lisbon', countryCode: 'PT', timeZone: 'Europe/Lisbon', boardId: 'memory-trip', dates: { start: '2026-11-10', end: '2026-11-14' } }), { newId: () => `id-${++n}` });
  const bytes = new Map<string, Uint8Array>();
  const photo = async (title: string, input: Record<string, unknown> = {}, credit?: string) => {
    const card = session.execute<{ id: string }>(owner, 'trip_card_create', { kind: 'photo', title, stage: 'remember', ...input }).id;
    const data = strToU8(`photo:${title}`), id = `asset-${title.replace(/\W/g, '')}`;
    bytes.set(id, data);
    session.execute(owner, 'trip_asset_attach', { cardId: card, asset: { id, hash: await sha256Hex(data), mime: 'image/webp', role: 'original', ...(credit ? { credit, rightsStatus: 'approved', source: { id: `fcc:${id}`, retrievedAt: '2026-11-01', provider: 'fcc', cityId: 'lisbon', kind: 'artwork' } } : {}) } });
    return { card, asset: id };
  };
  const blurry = await photo('Blurry tram at dusk', { day: '2026-11-11', travelerNote: 'Out of focus but we laughed.' });
  const sunset = await photo('Sunset', { day: '2026-11-12' });
  const secret = await photo('Hotel room', { scope: 'private' });
  const art = await photo('FCC Alfama print', { stage: 'plan' }, 'Ana Lima for FCC');
  const note = session.execute<{ id: string }>(owner, 'trip_card_create', { kind: 'note', title: 'Best day', body: 'Pastéis after the castle.', stage: 'remember' }).id;
  session.execute(owner, 'trip_presentation_create', { assetId: art.asset, cardId: art.card, x: 0.1, y: 0.1, width: 0.4, height: 0.4 });
  session.execute(owner, 'trip_presentation_create', { assetId: sunset.asset, cardId: sunset.card, x: 0.2, y: 0.2, width: 0.4, height: 0.4 });
  return { session, bytes, blurry, sunset, secret, art, note };
}

describe('MOT-115 post-trip memory selection', () => {
  it('routes an early keepsake request straight to memories, never to voting or planning', () => {
    const route = routeWorkflow({ text: 'make a keepsake from our photos' }, { meta: { city: 'Lisbon', dates: { start: '2026-11-10', end: '2026-11-14' }, timeZone: 'Europe/Lisbon', agentMode: 'together' }, now: new Date('2026-11-11T12:00:00Z') });
    expect(route).toMatchObject({ workflow: 'keepsake', questions: [] });
  });
  it('offers a first shortlist from permitted photos and notes, imperfect photos included, and honours reactions', async () => {
    const t = await trip();
    const first = memoryShortlist(t.session);
    expect(first.items.map(i => i.title)).toEqual(['Blurry tram at dusk', 'Sunset', 'FCC Alfama print', 'Best day']);
    expect(first.items[0]).toMatchObject({ note: 'Out of focus but we laughed.' });
    expect(JSON.stringify(first)).not.toContain('Hotel room');
    const reacted = memoryShortlist(t.session, { reactions: { [t.note]: 'keep', [t.blurry.card]: 'skip', [t.sunset.card]: 'maybe' } });
    expect(reacted.items.map(i => i.title)).toEqual(['Best day', 'Sunset', 'FCC Alfama print']);
    expect(memoryShortlist(t.session, { reactions: { [t.sunset.card]: 'maybe' }, limit: 1 }).items[0]!.cardId).toBe(t.sunset.card);
    expect(reacted.skipped).toEqual([t.blurry.card]);
  });
  it('pages through more memories while keeping reactions', async () => {
    const t = await trip();
    const page = memoryShortlist(t.session, { reactions: { [t.note]: 'keep' }, limit: 2 });
    expect(page).toMatchObject({ more: 2 });
    expect(page.items[0]!.cardId).toBe(t.note);
    expect(memoryShortlist(t.session, { reactions: { [t.note]: 'keep' }, limit: 4 }).items).toHaveLength(4);
  });
  it('reuses FCC art already on the trip with its credit and origin', async () => {
    const t = await trip();
    expect(reusableArt(t.session)).toEqual([{ assetId: t.art.asset, credit: 'Ana Lima for FCC', rightsStatus: 'approved', origin: 'FCC · lisbon', scope: 'stay', kind: 'fcc-artwork' }]);
  });
  it('finds missing images, wrong dates, likely clipping and overlapping art before keeping', async () => {
    const t = await trip();
    t.session.execute(owner, 'trip_card_update', { id: t.note, day: '2026-12-01', body: 'x'.repeat(950) });
    const review = reviewKeepsakePages(t.session, { cardIds: [t.blurry.card, t.sunset.card, t.art.card, t.note], hasBytes: id => id !== t.sunset.asset });
    expect(review.ok).toBe(false);
    expect(review.problems.map(p => p.kind).sort()).toEqual(['clipped_text', 'collision', 'missing_image', 'missing_image', 'wrong_detail']);
    expect(reviewKeepsakePages(t.session, { cardIds: [t.blurry.card], hasBytes: () => true })).toEqual({ ok: true, problems: [] });
  });
  it('keeps photos, notes, arrangement, provenance and privacy through the existing ZIP and a clean reopen', async () => {
    const t = await trip();
    const shared = await importTripPackage(await exportTripPackage(t.session.doc, t.bytes));
    const cards = readAllCards(tripParts(shared.doc));
    expect(cards.map(c => c.title).sort()).toEqual(['Best day', 'Blurry tram at dusk', 'FCC Alfama print', 'Sunset']);
    expect(cards.find(c => c.title === 'Blurry tram at dusk')).toMatchObject({ travelerNote: 'Out of focus but we laughed.', day: '2026-11-11' });
    expect(readPresentations(tripParts(shared.doc)).map(p => [p.x, p.y, p.width])).toEqual(readPresentations(t.session.parts).map(p => [p.x, p.y, p.width]));
    expect([...shared.assets.keys()].sort()).toEqual([t.art.asset, t.blurry.asset, t.sunset.asset].sort());
    expect(reusableArt(new TripSession(shared.doc))[0]).toMatchObject({ credit: 'Ana Lima for FCC', origin: 'FCC · lisbon' });
    const backup = await importTripPackage(await exportTripPackage(t.session.doc, t.bytes, { includePrivate: true }));
    expect(readAllCards(tripParts(backup.doc)).find(c => c.title === 'Hotel room')?.scope).toBe('private');
  });
  it('fails a package with a missing photo instead of pretending it is complete', async () => {
    const t = await trip();
    t.bytes.delete(t.sunset.asset);
    await expect(exportTripPackage(t.session.doc, t.bytes)).rejects.toThrow(/Missing asset bytes/);
    expect(readAllCards(t.session.parts)).toHaveLength(5);
  });
});

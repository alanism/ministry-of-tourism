import { expect, it } from 'vitest';
import { buildMagazine } from './magazine.ts';
import { createTrip, readAllCards } from './model.ts';
import { TripSession } from './session.ts';
import { encodeTrip } from './persist.ts';

const actor = { kind: 'human' as const, id: 'owner', name: 'Owner' };
const image = 'data:image/png;base64,iVBORw0KGgo=';
function fixture() {
  const s = new TripSession(createTrip({ title: 'Inventory proof', city: 'Aspen', timeZone: null }));
  const guide = s.execute<{id:string}>(actor, 'trip_card_create', { kind: 'note', title: 'Public guide', body: 'READING TAIL', scope: 'guide' }).id;
  const stay = s.execute<{id:string}>(actor, 'trip_card_create', { kind: 'note', title: 'Trip note', scope: 'stay' }).id;
  const secret = s.execute<{id:string}>(actor, 'trip_card_create', { kind: 'note', title: 'PRIVATE INVENTORY CANARY', scope: 'private' }).id;
  s.execute(actor, 'trip_asset_register', { asset: { id: 'photo', mime: 'image/png', hash: 'a'.repeat(64), role: 'original', width: 1000, height: 1000, source: { id: 'saved-source', version: 'v2', retrievedAt: '2026-11-02' } } });
  const first = s.execute<{id:string}>(actor, 'trip_presentation_create', { assetId: 'photo', scope: 'guide', crop: [0, 0, 1, 1] }).id;
  const second = s.execute<{id:string}>(actor, 'trip_presentation_create', { assetId: 'photo', scope: 'guide', crop: [.1, .1, .8, .8] }).id;
  const board = s.execute<{id:string}>(actor, 'trip_presentation_create', { assetId: 'photo', surface: 'board', scope: 'guide' }).id;
  const hidden = s.execute<{id:string}>(actor, 'trip_presentation_create', { cardId: secret, scope: 'private' }).id;
  return { s, guide, stay, secret, first, second, board, hidden };
}
it('accounts for scope and board-only material without exposing private identities', () => {
  const { s, stay, secret, board, hidden } = fixture(), before = encodeTrip(s.doc);
  const issue = buildMagazine(s.doc, { variant: 'guide', assetUrls: new Map([['photo', image]]) });
  expect(issue.selection).toHaveProperty('selectionRule');
  expect(issue.selection).toHaveProperty('excludedItems', expect.arrayContaining([
    expect.objectContaining({ kind: 'placement', id: board, reason: 'board-only' }),
  ]));
  expect(issue.selection).toHaveProperty('privateExcluded', { cards: 1, placements: 1 });
  const serialized = JSON.stringify(issue.selection);
  for (const canary of [stay, secret, hidden, 'PRIVATE INVENTORY CANARY']) expect(serialized).not.toContain(canary);
  expect(issue.reading?.map(item => item.id).sort()).toEqual(issue.selection?.cards.map(card => card.id).sort());
  expect(issue.selection?.assets[0]).toHaveProperty('source.version', 'v2');
  expect(encodeTrip(s.doc)).toEqual(before);
  expect(readAllCards(s.parts)).toHaveLength(3);
});
it('reports actual placement identity instead of claiming every crop of one asset was painted', () => {
  const { s, first, second } = fixture();
  const issue = buildMagazine(s.doc, { assetUrls: new Map([['photo', image]]) });
  for (const id of [first, second]) {
    const actualPages = issue.pages.filter(page => page.svg.includes(`data-placement="${id}"`)).map(page => page.id);
    expect(issue.selection?.placements.find(layer => layer.id === id)?.pageIds).toEqual(actualPages);
  }
  const absent = [first, second].find(id => !issue.pages.some(page => page.svg.includes(`data-placement="${id}"`)))!;
  expect(absent).toBeTruthy();
  expect(issue.selection).toHaveProperty('unresolved', expect.arrayContaining([expect.objectContaining({ kind: 'placement', id: absent, reason: 'placement-not-rendered' })]));
  expect(issue.warnings.join(' ')).toContain('Composition');
});
it('refuses missing selected image bytes instead of emitting a complete inventory', () => {
  const { s } = fixture();
  expect(() => buildMagazine(s.doc)).toThrow(/unavailable/i);
});
it('keeps stay-only identities and labels out of a guide manifest, even in excluded inventory', () => {
  const { s, stay } = fixture();
  const excluded = s.execute<{id:string}>(actor, 'trip_presentation_create', { cardId: stay, scope: 'stay' }).id;
  const issue = buildMagazine(s.doc, { variant: 'guide', assetUrls: new Map([['photo', image]]) });
  const serialized = JSON.stringify(issue.selection);
  for (const canary of [stay, excluded, 'Trip note']) expect(serialized).not.toContain(canary);
  expect(issue.selection).toHaveProperty('outsideScopeExcluded', { cards: 1, placements: 1 });
});

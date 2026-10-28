import { afterEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import { createTrip } from './model.ts';
import { TripSession } from './session.ts';
import { buildMagazine } from './render.ts';
import { OperationTracker, JobRunner } from './jobs.ts';
import { createDiagnostic, diagnosticText } from './diagnostics.ts';
import { buildPdf } from '../export/pdf.ts';

const human = { kind: 'human' as const, id: 'traveler', name: 'Traveler' };
const image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';
function trip() {
  let n = 0;
  const session = new TripSession(createTrip({ title: 'San Sebastián', city: 'san-sebastian', timeZone: 'Europe/Madrid', boardId: 'board-1' }), { newId: () => `card-${++n}` });
  return session;
}
function addArt(session: TripSession, cardId: string, id: string, rightsStatus = 'approved') {
  session.execute(human, 'trip_asset_attach', { cardId, asset: { id, hash: 'a'.repeat(64), mime: 'image/png', role: 'original' } });
  const asset = session.parts.assets.get(id)!;
  asset.set('credit', 'FCC artist'); asset.set('rightsStatus', rightsStatus);
  asset.set('source', { kind: 'artwork', cityId: 'san-sebastian' });
}

afterEach(() => vi.useRealTimers());
describe('MOT-72 operation receipts', () => {
  it('waits for durable persistence and reports only allowlisted diagnostic fields', async () => {
    let finish!: () => void;
    const events: string[] = [];
    const tracker = new OperationTracker({ id: 'request-1', boardId: 'board-1', revision: 2, appVersion: 'test', onChange: state => events.push(state.phase) });
    const pending = tracker.run('validating', 'persisted', () => new Promise<void>(resolve => { finish = resolve; }));
    expect(events).toEqual(['requested', 'validating']);
    finish(); await pending;
    expect(events).toEqual(['requested', 'validating', 'persisted']);
    const receipt = createDiagnostic({ operation: 'export', boardId: 'board-1', revision: 2, requestId: 'request-1', appVersion: 'test', error: new Error('GuestName stay-code SECRET notes'), sourceUrl: 'https://foreignclubberscorespondence.web.app/almanac/index.json?guest=SECRET' });
    const serialized = diagnosticText(receipt);
    expect(serialized).not.toMatch(/SECRET|GuestName|stay-code|notes|guest=/);
    expect(receipt).toMatchObject({ operation: 'export', errorClass: 'failed', boardId: 'board-1', revision: 2 });
  });
  it('cancel resolves an active legacy job even when its provider never settles', async () => {
    const runner = new JobRunner();
    const commit = vi.fn();
    const pending = runner.start('hung', () => new Promise<never>(() => {}), { onDone: commit });
    expect(runner.stop('hung')).toBe(true);
    expect(await Promise.race([pending.then(job => job.status), new Promise(resolve => setTimeout(() => resolve('still-running'), 20))])).toBe('cancelled');
    expect(commit).not.toHaveBeenCalled();
  });
  it('cancellation is terminal and cannot be relabeled exported by a late result', async () => {
    let finish!: () => void;
    const tracker = new OperationTracker({ id: 'export-1', boardId: 'board-1', revision: 3, appVersion: 'test' });
    const pending = tracker.run('exporting', 'exported', () => new Promise<void>(resolve => { finish = resolve; }));
    tracker.cancel(); finish();
    await expect(pending).rejects.toThrow(/cancel/i);
    expect(tracker.state.phase).toBe('cancelled');
    expect(tracker.state.diagnostic?.errorClass).toBe('cancelled');
  });
});

describe('MOT-89/93 magazine renderer', () => {
  it('uses all selected content without mandatory filler, keeps Unicode and excludes private text', () => {
    const session = trip();
    const longBody = Array.from({ length: 200 }, (_, i) => `word${i}`).join(' ');
    session.execute(human, 'trip_card_create', { kind: 'note', title: 'Pintxos & café', body: longBody, scope: 'guide' });
    session.execute(human, 'trip_card_create', { kind: 'note', title: 'PrivateName', body: 'PrivateStayCode', scope: 'private' });
    const magazine = buildMagazine(session.doc);
    expect(magazine.pages.length).toBeGreaterThan(0);
    expect(magazine.pages.length).toBeLessThan(24);
    const output = magazine.pages.map(page => page.svg).join('');
    expect(output).toContain('Pintxos &amp; café');
    expect(output).toContain('word199');
    expect(output).not.toMatch(/PrivateName|PrivateStayCode|placeholder/i);
    expect(magazine.pages.map(page => page.folio)).toEqual(magazine.pages.map((_, i) => i + 1));
  });
  it('fails honestly for missing visible image bytes rather than exporting an empty picture', () => {
    const session = trip();
    const { id } = session.execute<{id:string}>(human, 'trip_card_create', { kind: 'photo', title: 'Original art', scope: 'guide' });
    addArt(session, id, 'art-1');
    expect(() => buildMagazine(session.doc)).toThrow(/art-1.*unavailable|unavailable.*art-1/i);
    const magazine = buildMagazine(session.doc, { assetUrls: new Map([['art-1', image]]) });
    expect(magazine.pages[0]?.svg).toContain(image);
    expect(magazine.pages[0]?.credits).toContain('FCC artist');
  });
  it('keeps crop, rotation and every placement and rejects unsafe image URLs', () => {
    const session = trip();
    const { id } = session.execute<{id:string}>(human, 'trip_card_create', { kind: 'photo', title: 'City ink', scope: 'guide' });
    addArt(session, id, 'art-1');
    const layers = session.doc.getMap('tripPresentations');
    layers.set('layer-1', { id: 'layer-1', boardId: session.boardId, cardId: id, assetId: 'art-1', x: 0.1, y: 0.2, width: 0.3, height: 0.4, crop: [0.2, 0.1, 0.5, 0.6], rotation: 25, zIndex: 1, locked: true, scope: 'guide' });
    const rendered = buildMagazine(session.doc, { assetUrls: new Map([['art-1', image]]), assetDimensions: new Map([['art-1', { width: 1000, height: 800 }]]) });
    const output = rendered.pages.map(page => page.svg).join('');
    expect(output).toContain('data-placement="layer-1"');
    expect(output).toContain('data-crop="0.2,0.1,0.5,0.6"');
    expect(output).toMatch(/rotate\(25/);
    expect(() => buildMagazine(session.doc, { assetUrls: new Map([['art-1', 'javascript:alert(1)']]) })).toThrow(/image|asset/i);
  });
  it('shared output retains restricted art with real credit and refuses missing credit', () => {
    const session = trip();
    const { id } = session.execute<{id:string}>(human, 'trip_card_create', { kind: 'photo', title: 'Rights test', scope: 'guide' });
    addArt(session, id, 'restricted-art', 'restricted');
    expect(buildMagazine(session.doc, { assetUrls: new Map([['restricted-art', image]]) }).pages[0]?.credits).toContain('FCC artist');
    const personal = buildMagazine(session.doc, { includePrivate: true, assetUrls: new Map([['restricted-art', image]]) });
    expect(personal.pages[0]?.svg).toContain(image);
    session.parts.assets.get('restricted-art')!.delete('credit');
    expect(() => buildMagazine(session.doc, { assetUrls: new Map([['restricted-art', image]]) })).toThrow(/credit/i);
  });
  it('renders a text-only card placement without requiring image bytes', () => {
    const session = trip();
    const { id } = session.execute<{id:string}>(human, 'trip_card_create', { kind: 'note', title: 'A letter', body: 'Keep this traveler note.', scope: 'guide' });
    session.doc.getMap('tripPresentations').set('text-layer', { id: 'text-layer', boardId: session.boardId, cardId: id, x: 0.1, y: 0.2, width: 0.6, height: 0.4, crop: [0,0,1,1], rotation: 0, zIndex: 0, locked: false, scope: 'guide' });
    const rendered = buildMagazine(session.doc);
    expect(rendered.pages.some(p=>p.svg.includes('data-placement="text-layer"'))).toBe(true);
    expect(rendered.pages.some(p=>p.svg.includes('Keep this traveler note.'))).toBe(true);
  });
  it('produces A5 image PDF pages at the same aspect ratio as the SVG preview', () => {
    const bytes = buildPdf([{ kind: 'image', jpeg: new Uint8Array([255,216,255,217]), width: 1184, height: 1680, pageSize: [419.53,595.28], fullBleed: true }], 'Trip magazine');
    const text = new TextDecoder('latin1').decode(bytes);
    expect(text).toContain('/MediaBox [0 0 419.53 595.28]');
    expect(text).toContain('/Count 1');
    expect(text).toContain('/Subtype /Image');
  });
});

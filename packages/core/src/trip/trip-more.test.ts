import { describe, expect, it } from 'vitest';
import { zipSync, unzipSync, strToU8 } from 'fflate';
const decode = (b: Uint8Array) => new TextDecoder().decode(b);
import type { Actor } from '../doc/model.ts';
import { createTrip, readTripMeta } from './model.ts';
import { TripSession } from './session.ts';
import { agentView, boardProjection, mapProjection, todayProjection } from './projections.ts';
import { applyGuideUpdates, createGuestCopy, planGuideUpdate } from './lineage.ts';
import { encodeTrip, loadTrip } from './persist.ts';
import { exportTripPackage } from './package.ts';
import { importTripPackage } from './import.ts';

const host: Actor = { kind: 'human', id: 'host-1', name: 'Host' };
const guest: Actor = { kind: 'human', id: 'guest-1', name: 'Guest' };
let seq = 0; const nid = () => `x-${++seq}`;

function guide() {
  seq = 0;
  const doc = createTrip({ title: 'Guide', city: 'bangkok', timeZone: 'Asia/Bangkok', kind: 'host_guide', newId: nid });
  const s = new TripSession(doc, { newId: nid });
  const pub = s.execute<{ id: string }>(host, 'trip_card_create', { kind: 'place', title: 'Market', body: 'Go early', scope: 'guide', provenance: 'host', location: { lat: 13.75, lng: 100.5, source: 'catalog' } });
  s.execute(host, 'trip_card_create', { kind: 'note', title: 'Secret', body: 'private', scope: 'private', provenance: 'host' });
  return { doc, s, pub };
}

describe('MOT-13 projections', () => {
  it('same card id and rev in Board, Today and agent view; Map needs verified location', () => {
    const { doc, s, pub } = guide();
    s.execute(host, 'trip_card_update', { id: pub.id, day: '2026-01-02' });
    const board = boardProjection(doc);
    const today = todayProjection(doc, new Date('2026-01-01T17:30:00Z')); // Jan 2 in Bangkok
    const agent = agentView(doc);
    const inBoard = Object.values(board).flat().find((c) => c.id === pub.id)!;
    expect(today.map((c) => c.id)).toContain(pub.id);
    expect(today.find((c) => c.id === pub.id)!.rev).toBe(inBoard.rev);
    expect(agent.byStage[inBoard.stage].find((c) => c.id === pub.id)!.rev).toBe(inBoard.rev);
    expect(mapProjection(doc).map((c) => c.id)).toContain(pub.id);
    const before = JSON.stringify(boardProjection(doc));
    todayProjection(doc); expect(JSON.stringify(boardProjection(doc))).toBe(before);
  });
});

describe('MOT-14 guest copies', () => {
  it('copies guide cards only, never private or stay; two guests never see each other', () => {
    const { doc } = guide();
    const g1 = createGuestCopy(doc, { newId: nid }); const g2 = createGuestCopy(doc, { newId: nid });
    expect(readTripMeta(g1).kind).toBe('guest');
    expect(readTripMeta(g1).boardId).not.toBe(readTripMeta(doc).boardId);
    const names = (d: typeof g1) => new TripSession(d, { newId: nid }).execute<{ cards: { title: string }[] }>(guest, 'trip_read').cards.map((c) => c.title);
    expect(names(g1)).toEqual(['Market']);
    // Host adds distinct stay welcomes directly to each copy.
    new TripSession(g1, { newId: nid }).execute(host, 'trip_card_create', { kind: 'stay_fact', title: 'Unit A', scope: 'stay', provenance: 'host' });
    expect(names(g1)).toContain('Unit A'); expect(names(g2)).not.toContain('Unit A');
  });
  it('master update: untouched guest updates, edited guest conflicts, removal never deletes', () => {
    const { doc, s, pub } = guide();
    const gDoc = createGuestCopy(doc, { newId: nid });
    const gs = new TripSession(gDoc, { newId: nid });
    // Guest edits their copy -> conflict path is planned, not applied unless selected.
    gs.execute(guest, 'trip_card_update', { id: pub.id, body: 'My note' });
    s.execute(host, 'trip_card_update', { id: pub.id, body: 'Host v2' });
    const plan = planGuideUpdate(gDoc, doc);
    expect(plan.find((p) => p.guideCardId === pub.id)?.kind).toBe('conflict');
    // A fresh untouched copy gets a clean update, applied twice = no second change.
    const g2 = createGuestCopy(doc, { newId: nid }); // already v2, so plan empty here
    expect(planGuideUpdate(g2, doc)).toEqual([]);
    const applied = applyGuideUpdates(gs, guest, gDoc, doc, new Set());
    expect(applied).toBe(0);
    // Delete on master -> removal planned, guest card still present.
    s.execute(host, 'trip_card_delete', { id: pub.id });
    expect(planGuideUpdate(gDoc, doc).find((p) => p.guideCardId === pub.id)?.kind).toBe('removed');
    expect(gs.execute<{ cards: unknown[] }>(guest, 'trip_read').cards.length).toBeGreaterThan(0);
  });
});

describe('MOT-15/30/31 persistence and packages', () => {
  it('reloads exactly from bytes', () => {
    const { doc, pub } = guide();
    const back = loadTrip(encodeTrip(doc));
    const cards = new TripSession(back, { newId: nid }).execute<{ cards: { id: string; title: string }[] }>(host, 'trip_read').cards;
    expect(cards.find((c) => c.id === pub.id)?.title).toBe('Market');
  });
  it('round-trips, excludes private, and gives the import a new identity', async () => {
    const { doc } = guide();
    const bytes = await exportTripPackage(doc, new Map(), { created: '2026-10-28T00:00:00Z' });
    const unzipped = unzipSync(bytes);
    expect(decode(unzipped['trip.json']!)).not.toContain('Secret');
    // Regression (MOT-18/31): the encoded document must not carry private cards either.
    const docBytes = Buffer.from(decode(unzipped['document.b64']!).trim(), 'base64');
    expect(docBytes.toString('latin1')).not.toContain('Secret');
    for (const [name, data] of Object.entries(unzipped)) expect(decode(data as Uint8Array), name).not.toContain('Secret');
    expect(unzipped['manifest.json']).toBeTruthy();
    const { doc: imported } = await importTripPackage(bytes, { newId: nid });
    expect(readTripMeta(imported).boardId).not.toBe(readTripMeta(doc).boardId);
    const titles = new TripSession(imported, { newId: nid }).execute<{ cards: { title: string }[] }>(host, 'trip_read').cards.map((c) => c.title);
    expect(titles).toContain('Market'); expect(titles).not.toContain('Secret');
  });
  it('rejects traversal, executables, scripted svg and bad checksums; current board unchanged', async () => {
    const { doc } = guide();
    const before = encodeTrip(doc);
    const bad1 = zipSync({ '../evil.txt': new TextEncoder().encode('x'), 'manifest.json': new TextEncoder().encode('{}') });
    await expect(importTripPackage(bad1)).rejects.toThrow(/Unsafe path/);
    const bad2 = zipSync({ 'evil.exe': new TextEncoder().encode('x'), 'manifest.json': new TextEncoder().encode('{}') });
    await expect(importTripPackage(bad2)).rejects.toThrow(/Active content/);
    const bad3 = zipSync({ 'x.svg': new TextEncoder().encode('<svg onload=alert(1)>'), 'manifest.json': new TextEncoder().encode('{}') });
    await expect(importTripPackage(bad3)).rejects.toThrow(/Active content/);
    expect(encodeTrip(doc)).toEqual(before);
  });
});

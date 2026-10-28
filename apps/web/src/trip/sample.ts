// Sample boards and shared formatting. Sample content is labelled once, in the footnote.
import type { Actor, BoardKind, Stage, TripCard, TripMeta, TripSession } from '@writers-board/core';
import { attachPhoto } from './trip-assets';
import type { NewTrip } from './trip-store';
import { samplePhotoUrl, type SamplePhoto } from './sample-media';

/** Seeding runs as its own actor, so the person's Undo never removes the sample. */
const SAMPLE_ACTOR: Actor = { kind: 'human', id: 'sample', name: 'Sample trip' };

interface SampleCard { card: Record<string, unknown>; photo?: SamplePhoto; }

const BRIEF_BODY = 'Base: Talat Noi\nInterests: Street food, River, Art\nNotes: Slow days, good food, local neighbourhoods and a bit of art.';

const TRAVELER: SampleCard[] = [
  { card: { kind: 'brief', title: 'Trip brief', body: BRIEF_BODY, stage: 'plan' } },
  { card: { kind: 'task', title: 'Wishlist', body: "Places and experiences we shouldn't miss.", stage: 'plan', status: 'open' } },
  { card: { kind: 'task', title: 'Get a local SIM', body: 'Pick up at the airport or a nearby shop.', stage: 'prepare', status: 'open', day: '2026-11-13', time: '10:00' } },
  { card: { kind: 'place', title: 'Welcome to Talat Noi', body: 'Quick intro, walking tips and a few nearby spots.', stage: 'arrive', scope: 'guide', provenance: 'host' } },
  { card: { kind: 'note', title: 'Check-in notes', body: 'Address, entry details and what to do if we arrive early.', stage: 'arrive', scope: 'private', day: '2026-11-13', time: '14:00' } },
  { card: { kind: 'note', title: 'Saturday walk', body: 'Talat Noi, then the river.', stage: 'explore', day: '2026-11-14', time: '16:00' } },
  { card: { kind: 'place', title: 'Street art', body: 'Colourful lanes and local art around Talat Noi.', stage: 'explore', scope: 'guide', provenance: 'host', day: '2026-11-14', time: '17:00' }, photo: 'street-art' },
  { card: { kind: 'photo', title: 'A moment on the river', body: 'Sunset from the river.', stage: 'remember', day: '2026-11-13', time: '18:30' }, photo: 'river' },
];

const HOST: SampleCard[] = [
  { card: { kind: 'place', title: 'Welcome to the neighborhood', body: 'A quiet introduction to Talat Noi: riverside walks, street art, good food and local stories.', stage: 'arrive', scope: 'guide', provenance: 'host' }, photo: 'doorway' },
  { card: { kind: 'stay_fact', title: 'House notes', body: 'Keys, house rules, Wi-Fi and other practical details for your stay.', stage: 'prepare', scope: 'stay', provenance: 'host' }, photo: 'room' },
  { card: { kind: 'note', title: 'Private host note', body: 'Internal notes. Not shared with guests.', stage: 'prepare', scope: 'private', provenance: 'host' } },
  { card: { kind: 'place', title: 'Talat Noi street art', body: 'Colourful lanes, old shophouses and hidden art around Talat Noi.', stage: 'explore', scope: 'guide', provenance: 'host' }, photo: 'street-art' },
  { card: { kind: 'place', title: 'Riverside afternoon', body: 'A relaxed afternoon by the river with cafés, boats and sunset views.', stage: 'explore', scope: 'guide', provenance: 'host' }, photo: 'river' },
];

export function sampleTrip(kind: BoardKind): NewTrip {
  return kind === 'host_guide'
    ? { title: 'Talat Noi welcome guide', city: 'bangkok', timeZone: 'Asia/Bangkok', kind }
    : { title: 'Bangkok, our way', city: 'bangkok', timeZone: 'Asia/Bangkok', kind, dates: { start: '2026-11-13', end: '2026-11-16' }, party: 'couple' };
}

const sampleKey = (boardId: string) => 'mot-sample:' + boardId;
export function isSample(boardId: string): boolean { try { return localStorage.getItem(sampleKey(boardId)) === '1'; } catch { return false; } }

/** Fills a new, empty board with the sample cards and photos. Photos that fail to load are skipped, not faked. */
export async function seedSample(session: TripSession, kind: BoardKind): Promise<void> {
  try { localStorage.setItem(sampleKey(session.boardId), '1'); } catch { /* label only */ }
  const photos = new Map<SamplePhoto, Blob>();
  await Promise.all((['river', 'street-art', 'doorway', 'room'] as const).map(async (p) => {
    const url = samplePhotoUrl(p);
    if (!url) return;
    try {
      const r = await fetch(url, { credentials: 'omit' });
      if (r.ok) { const blob = await r.blob(); if (blob.type.startsWith('image/')) photos.set(p, blob); }
    } catch { /* Optional photos are skipped; sample notes remain usable. */ }
  }));
  for (const [i, s] of (kind === 'host_guide' ? HOST : TRAVELER).entries()) {
    const blob = s.photo && photos.get(s.photo);
    const kind = s.card.kind === 'photo' && !blob ? 'note' : s.card.kind;
    const { id } = session.execute<{ id: string }>(SAMPLE_ACTOR, 'trip_card_create', { ...s.card, kind, y: i * 10 });
    if (blob) await attachPhoto(session, SAMPLE_ACTOR, id, blob);
  }
}

// Trip brief: one 'brief' card, written as "Key: value" lines, so agents read it first (MOT-13).
export interface Brief { base?: string; interests: string[]; notes?: string; }
export function parseBrief(body: string): Brief {
  const brief: Brief = { interests: [] };
  for (const line of body.split('\n')) {
    const m = /^\s*(base|interests|notes)\s*:\s*(.*)$/i.exec(line);
    if (!m) continue;
    const key = m[1]!.toLowerCase(), value = m[2]!.trim();
    if (key === 'base') brief.base = value;
    else if (key === 'notes') brief.notes = value;
    else brief.interests = value.split(',').map((s) => s.trim()).filter(Boolean);
  }
  return brief;
}
export const BRIEF_TEMPLATE = 'Base: \nInterests: \nNotes: ';

export const cityLabel = (city: string) => city.split(/[-\s]/).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

/** "13 – 16 Nov · Couple", from the trip's own fields. Nothing shown that the trip doesn't say. */
export function tripSubtitle(meta: TripMeta): string {
  const parts: string[] = [];
  if (meta.dates) parts.push(dateRange(meta.dates.start, meta.dates.end));
  if (meta.party) parts.push(cityLabel(meta.party));
  if (meta.kind === 'host_guide') parts.push('Host workspace · Master guide');
  if (meta.kind === 'guest') parts.push('Guest copy');
  return parts.join(' · ');
}

const asDate = (day: string) => new Date(`${day}T12:00:00Z`);
export function dateRange(start: string, end: string): string {
  const a = asDate(start), b = asDate(end);
  const month = (d: Date) => d.toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' });
  return month(a) === month(b) ? `${a.getUTCDate()} – ${b.getUTCDate()} ${month(b)}` : `${a.getUTCDate()} ${month(a)} – ${b.getUTCDate()} ${month(b)}`;
}
export const dayLabel = (day: string) => asDate(day).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
export const longDayLabel = (day: string) => asDate(day).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });

export const STAGE_NAME: Record<Stage, string> = { plan: 'Plan', prepare: 'Prepare', arrive: 'Arrive', explore: 'Explore', remember: 'Remember' };
/** A host guide is three lanes: what guests see first, how the stay works, what to do nearby. */
export const HOST_LANES: { stage: Stage; name: string }[] = [
  { stage: 'arrive', name: 'Welcome' }, { stage: 'prepare', name: 'Stay information' }, { stage: 'explore', name: 'Local recommendations' },
];

export const PROVENANCE_LABEL: Record<TripCard['provenance'], string> = { traveler: 'Traveler', host: 'Host guide', fcc: 'FCC', agent: 'Muse suggestion', provider: 'Provider' };

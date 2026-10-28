// Keepsakes and sharing primitives (MOT-32/33/34/35): copies, never live views of the board.
import type * as Y from 'yjs';
import { readAllCards, readTripMeta, tripParts } from './model.ts';
import { mapProjection } from './projections.ts';

/** MOT-34: every pin traces to a source or traveler entry; attribution travels with it. */
export function mapPins(doc: Y.Doc): { pins: { cardId: string; title: string; lat: number; lng: number; trace: string }[]; attribution: string } {
  const pins = mapProjection(doc).map((c) => ({
    cardId: c.id, title: c.title, lat: c.location!.lat, lng: c.location!.lng,
    trace: c.source ? `source:${c.source.id}` : `traveler:${c.createdBy}`,
  }));
  return { pins, attribution: 'Map data: sources as listed per pin. No route or travel time unless a verified provider supplies it; otherwise unknown.' };
}

/** MOT-33: a sanitized snapshot is a frozen copy. Editing or deleting the board cannot change or revive it. */
export interface Snapshot { id: string; boardTitle: string; created: string; cards: { title: string; stage: string; body: string }[]; note: string; }
export function makeSnapshot(doc: Y.Doc, id: string, includePrivate = false): Snapshot {
  const cards = readAllCards(tripParts(doc))
    .filter((c) => includePrivate || c.scope !== 'private')
    .map((c) => ({ title: c.title, stage: c.stage, body: c.body }));
  return { id, boardTitle: readTripMeta(doc).title, created: new Date().toISOString(), cards, note: 'Snapshot copy. It holds no board credentials and cannot unlock the board.' };
}
export class SnapshotStore {
  private map = new Map<string, Snapshot>();
  put(s: Snapshot): void { this.map.set(s.id, structuredClone(s)); }
  get(id: string): Snapshot | undefined { const s = this.map.get(id); return s ? structuredClone(s) : undefined; }
  delete(id: string): boolean { return this.map.delete(id); }
}

/** MOT-35: postcard SVG from a photo card + note. Declared size with bleed; low-res warns, never "print-ready". */
export const POSTCARD = { widthMm: 148, heightMm: 105, bleedMm: 3, dpi: 300 } as const;
export function postcardSvg(input: { title: string; note: string; imageHref?: string; imageWidthPx?: number }): { svg: string; widthMm: number; heightMm: number; warnings: string[]; label: string } {
  const warnings: string[] = [];
  const neededPx = Math.round(((POSTCARD.widthMm + POSTCARD.bleedMm * 2) / 25.4) * POSTCARD.dpi);
  if (input.imageHref && (input.imageWidthPx ?? 0) < neededPx) warnings.push(`Photo is ${input.imageWidthPx ?? 0}px wide; ${neededPx}px is needed at 300dpi. Not print-ready.`);
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const w = POSTCARD.widthMm + POSTCARD.bleedMm * 2, h = POSTCARD.heightMm + POSTCARD.bleedMm * 2;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}mm" height="${h}mm" viewBox="0 0 ${w * 4} ${h * 4}">${input.imageHref ? `<image href="${esc(input.imageHref)}" width="${w * 4}" height="${h * 3}"/>` : ''}<rect y="${h * 3}" width="${w * 4}" height="${h}" fill="white"/><text x="24" y="${h * 3 + 42}" font-family="sans-serif" font-size="28">${esc(input.title)}</text><text x="24" y="${h * 3 + 76}" font-family="sans-serif" font-size="20">${esc(input.note)}</text><text x="24" y="${h * 4 - 16}" font-family="sans-serif" font-size="14">Derivative keepsake — original photo kept unchanged.</text></svg>`;
  return { svg, widthMm: w, heightMm: h, warnings, label: warnings.length ? 'Keepsake preview (not print-ready)' : 'Keepsake preview' };
}

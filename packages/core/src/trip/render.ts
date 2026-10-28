// Page + poster + photobook renders (MOT-40A/B/C/D): pure, no AI, private/excluded never render.
import type * as Y from 'yjs';
import { readAllCards, readTripMeta, tripParts } from './model.ts';
import { boardProjection, todayProjection } from './projections.ts';
import { mapPins } from './keepsake.ts';
import { PRESENTATION_PATTERNS } from './schema.ts';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** MOT-40A: itinerary options page from a fixture or live trip, without AI. */
export function itineraryHtml(doc: Y.Doc): string {
  const meta = readTripMeta(doc);
  const byStage = boardProjection(doc);
  const sections = Object.entries(byStage).map(([stage, cards]) =>
    `<section><h2>${esc(stage)}</h2>${cards.filter((c) => c.scope !== 'private').map((c) => `<article><h3>${esc(c.title)}</h3><p>${esc(c.body)}</p>${c.day ? `<p>${esc(c.day)} ${esc(c.time ?? '')}</p>` : ''}</article>`).join('')}</section>`).join('');
  return `<!doctype html><title>${esc(meta.title)} itinerary</title><h1>${esc(meta.title)}</h1><p>${esc(meta.city)} · rendered without AI · private cards excluded</p>${sections}`;
}

/** MOT-40B: memorabilia page. An excluded photo never appears, even if requested. */
export function memorabiliaHtml(doc: Y.Doc, excludedAssetIds: Set<string> = new Set()): string {
  const cards = readAllCards(tripParts(doc)).filter((c) => c.scope !== 'private');
  const items = cards.map((c) => {
    const assets = c.assetIds.filter((a) => !excludedAssetIds.has(a));
    return `<article><h3>${esc(c.title)}</h3><p>${esc(c.body)}</p>${assets.map((a) => `<figure data-asset="${esc(a)}">Photo ${esc(a)}</figure>`).join('')}</article>`;
  }).join('');
  return `<!doctype html><title>Trip memorabilia</title><h1>Memorabilia</h1><p>Rendered without AI. Excluded photos never appear.</p>${items}`;
}

/** MOT-40C: route/stay-pin poster SVG at a declared size. Preflight = exact mm + traced pins. */
export const POSTER = { widthMm: 420, heightMm: 594 } as const;
export function posterSvg(doc: Y.Doc): { svg: string; preflight: { ok: boolean; problems: string[] }; widthMm: number; heightMm: number } {
  const mapped = mapPins(doc);
  const publicIds = new Set(readAllCards(tripParts(doc)).filter((c) => c.scope !== 'private').map((c) => c.id));
  const pins = mapped.pins.filter((p) => publicIds.has(p.cardId));
  const attribution = mapped.attribution;
  const problems: string[] = [];
  if (!pins.length) problems.push('No traced pins: poster would be empty.');
  const w = POSTER.widthMm * 4, h = POSTER.heightMm * 4;
  const minLng = Math.min(...pins.map((p) => p.lng)), maxLng = Math.max(...pins.map((p) => p.lng));
  const minLat = Math.min(...pins.map((p) => p.lat)), maxLat = Math.max(...pins.map((p) => p.lat));
  const scale = Math.min((w - 400) / (maxLng - minLng || 1), (h - 600) / (maxLat - minLat || 1));
  const circles = pins.map((p) => {
    const x = w / 2 + (p.lng - (minLng + maxLng) / 2) * scale;
    const y = h / 2 - (p.lat - (minLat + maxLat) / 2) * scale;
    return `<g data-lat="${p.lat}" data-lng="${p.lng}"><circle cx="${x}" cy="${y}" r="10" fill="#CC0000"/><text x="${x + 16}" y="${y + 4}" font-size="18">${esc(p.title)} (${esc(p.trace)})</text></g>`;
  }).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${POSTER.widthMm}mm" height="${POSTER.heightMm}mm" viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}" fill="white"/><text x="60" y="70" font-size="36">Trip places</text><text x="60" y="110" font-size="18">Coordinate diagram · north up · basemap and route unavailable</text>${circles}<text x="60" y="${h - 40}" font-size="14">${esc(attribution)}</text></svg>`;
  return { svg, preflight: { ok: problems.length === 0, problems }, widthMm: POSTER.widthMm, heightMm: POSTER.heightMm };
}

/** MOT-40D: photobook pages per docs/PHOTOBOOK.md sample spec (labeled unverified). */
export const BOOK = { pagePx: 2551, minPages: 24, label: 'Sample layout — partner spec unverified' } as const;
export function photobookPages(doc: Y.Doc, photoPx: Map<string, number> = new Map(), photoUrls: Map<string, string> = new Map()): { pages: string[]; cover: string; flags: string[]; label: string } {
  const cards = readAllCards(tripParts(doc)).filter((c) => c.scope !== 'private');
  const meta = readTripMeta(doc);
  const flags: string[] = [];
  const spreads: string[] = [];
  const page = (content: string) => `<svg xmlns="http://www.w3.org/2000/svg" width="${BOOK.pagePx}" height="${BOOK.pagePx}"><rect width="100%" height="100%" fill="white"/>${content}<text x="160" y="2390" font-size="28">${esc(BOOK.label)}</text></svg>`;
  cards.forEach((c, i) => {
    for (const a of c.assetIds) { const px = photoPx.get(a) ?? 0; if (px < BOOK.pagePx) flags.push(`Spread ${Math.floor(i / 2) + 1}: photo ${a} is ${px}px, needs ${BOOK.pagePx}px.`); }
    const image = photoUrls.get(c.assetIds[c.assetIds.length - 1] ?? '');
    const safeImage = image && /^data:image\/(png|jpeg|webp);base64,[a-z\d+/=]+$/i.test(image);
    spreads.push(page(`<text x="160" y="190" font-size="36">${esc(meta.title)} · ${esc(c.day ?? '')}</text><text x="160" y="310" font-size="64">${esc(c.title)}</text>${safeImage ? `<image href="${image}" x="160" y="430" width="2231" height="1500" preserveAspectRatio="xMidYMid slice"/>` : ''}<text x="160" y="2100" font-size="36">${esc(c.body.slice(0, 80))}</text>`));
  });
  const count = Math.max(BOOK.minPages, Math.ceil(spreads.length / 4) * 4);
  while (spreads.length < count) spreads.push(page(''));
  const cover = page(`<text x="160" y="1100" font-size="96">${esc(meta.title)}</text><text x="160" y="1250" font-size="48">${esc(meta.city)}</text><text x="160" y="1380" font-size="36">Sample cover · partner spine template unavailable</text>`);
  return { pages: spreads, cover, flags, label: BOOK.label };
}

export function todayText(doc: Y.Doc): string { return todayProjection(doc).map((c) => `${c.time ?? '--:--'} ${c.title}`).join('\n'); }

// One semantic magazine renderer supplies both the reader and PDF.
export * from './magazine.ts';

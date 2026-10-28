// Quote links tie a card to an exact passage in the manuscript or a pasted
// source. They are anchored with Yjs relative positions, so they keep pointing
// at the same words while the text around them is edited.
import * as Y from 'yjs';
import type { BoardParts } from './model.ts';

export type LinkTarget = { kind: 'manuscript' } | { kind: 'source'; sourceId: string };

export type LinkStatus =
  /** The linked words are exactly as quoted. */
  | 'intact'
  /** Someone edited inside the quote; `current` shows what is there now. */
  | 'edited'
  /** The quoted words were deleted. */
  | 'gone';

export function targetText(parts: BoardParts, target: LinkTarget): Y.Text | undefined {
  if (target.kind === 'manuscript') return parts.manuscript;
  const text = parts.sources.get(target.sourceId)?.get('text');
  return text instanceof Y.Text ? text : undefined;
}

export type QuoteMatch = { ok: true; index: number } | { ok: false; reason: 'not_found' | 'ambiguous'; count: number };

/**
 * Finds a verbatim quote. With no occurrence given, the quote must appear exactly
 * once; otherwise `occurrence` (1-based) picks which one.
 */
export function findQuote(text: string, quote: string, occurrence?: number): QuoteMatch {
  const hits: number[] = [];
  for (let at = text.indexOf(quote); at !== -1; at = text.indexOf(quote, at + 1)) hits.push(at);
  if (hits.length === 0) return { ok: false, reason: 'not_found', count: 0 };
  if (occurrence === undefined) {
    return hits.length === 1 ? { ok: true, index: hits[0]! } : { ok: false, reason: 'ambiguous', count: hits.length };
  }
  const index = hits[occurrence - 1];
  return index === undefined ? { ok: false, reason: 'not_found', count: hits.length } : { ok: true, index };
}

export function anchorRange(text: Y.Text, index: number, length: number): { start: unknown; end: unknown } {
  // Start sticks to the first quoted character and end to the last, so text
  // typed right before or right after the quote stays outside it.
  const start = Y.createRelativePositionFromTypeIndex(text, index, 0);
  const end = Y.createRelativePositionFromTypeIndex(text, index + length, -1);
  return { start: Y.relativePositionToJSON(start), end: Y.relativePositionToJSON(end) };
}

export interface ResolvedLink {
  status: LinkStatus;
  current: string;
  /** Where the linked words sit now in their text (equal when gone). */
  start: number;
  end: number;
}

export function resolveLink(doc: Y.Doc, parts: BoardParts, link: Y.Map<unknown>): ResolvedLink {
  const target = link.get('target') as LinkTarget;
  const text = targetText(parts, target);
  const start = Y.createAbsolutePositionFromRelativePosition(Y.createRelativePositionFromJSON(link.get('start')), doc);
  const end = Y.createAbsolutePositionFromRelativePosition(Y.createRelativePositionFromJSON(link.get('end')), doc);
  if (!text || !start || !end || end.index <= start.index) {
    const at = start?.index ?? 0;
    return { status: 'gone', current: '', start: at, end: at };
  }
  const current = text.toString().slice(start.index, end.index);
  return { status: current === link.get('quote') ? 'intact' : 'edited', current, start: start.index, end: end.index };
}

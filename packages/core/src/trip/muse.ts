// Muse boundary (MOT-23/24): what goes to the model, and how its answer becomes a proposal.
// Runs without a key: the server adapter sends the request and returns the raw output.
import { z } from 'zod';
import { CommandError } from '../commands/define.ts';
import { readAllCards } from './model.ts';
import { prevalidateProposal, type Proposal } from './proposals.ts';
import type { ComparisonToken } from './revisions.ts';
import type { TripSession } from './session.ts';
import type { FccCityContent, FccSourceRef } from './city-source.ts';

export interface MuseRequest {
  boardId: string;
  prompt: string;
  cards: { id: string; title: string; body: string; stage: string; day?: string; time?: string }[];
  assetIds: string[];
  grounding: { level: 'full-issue' | 'catalogue-only' | 'unavailable'; cityId: string; articles: { title: string; body: string; source: FccSourceRef }[] };
}

/** Only the cards and photos the person selected go out, and never a private card. */
export function buildMuseRequest(session: TripSession, selection: { cardIds: string[]; assetIds?: string[]; prompt: string; cityContent?: FccCityContent }): MuseRequest {
  const chosen = new Set(selection.cardIds);
  const cards = readAllCards(session.parts).filter((c) => chosen.has(c.id) && c.scope !== 'private');
  const allowedAssets = new Set(cards.flatMap((c) => c.assetIds));
  const cityId = String(session.parts.meta.get('cityId') ?? session.parts.meta.get('city')).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
  if (selection.cityContent && selection.cityContent.city.id !== cityId) throw new CommandError('scope', 'FCC issue is for another city');
  if(selection.cityContent?.articles.some(article=>article.cityId!==cityId||article.source.cityId!==cityId))throw new CommandError('scope','FCC article provenance is for another city');
  const articles = (selection.cityContent?.articles ?? []).map(article => ({ title: article.title, body: article.body, source: { ...article.source } }));
  // Article bodies remain data in this payload. Schema/command permissions, not article prose, decide authority.
  const level = !selection.cityContent || !articles.length ? 'unavailable' : articles.every(article => article.body.trim()) ? 'full-issue' : 'catalogue-only';
  return {
    boardId: session.boardId,
    prompt: selection.prompt,
    cards: cards.map((c) => ({ id: c.id, title: c.title, body: c.body, stage: c.stage, day: c.day, time: c.time })),
    assetIds: (selection.assetIds ?? []).filter((a) => allowedAssets.has(a)),
    grounding: { level, cityId, articles },
  };
}

const outputSchema = z.object({
  boardId: z.string().optional(),
  ops: z.array(z.object({ command: z.string(), input: z.record(z.string(), z.unknown()) }).strict()).max(20),
  reason: z.string().max(2000),
  sources: z.array(z.object({ id: z.string().min(1), url: z.string().max(2000).optional(), retrievedAt: z.string().min(1) }).strict()).max(20),
}).strict();

/**
 * Model output is data. Anything malformed, aimed at another board, or outside the proposable
 * commands is refused here, before a person ever sees it. A valid answer is only a proposal.
 */
export function parseMuseOutput(raw: unknown, session: TripSession, token: ComparisonToken): Proposal {
  let value = raw;
  if (typeof raw === 'string') {
    try { value = JSON.parse(raw); } catch { throw new CommandError('invalid_input', 'Muse returned something that is not a proposal. Nothing changed.'); }
  }
  const parsed = outputSchema.safeParse(value);
  if (!parsed.success) throw new CommandError('invalid_input', 'Muse returned something that is not a proposal. Nothing changed.');
  if (parsed.data.boardId !== undefined && parsed.data.boardId !== session.boardId) throw new CommandError('scope', 'Muse answered for another board. Nothing changed.');
  const proposal: Proposal = {
    id: `muse-${crypto.randomUUID()}`, boardId: session.boardId, token, ops: parsed.data.ops.map(op=>op.command==='trip_card_create'?{...op,input:{...op.input,provenance:'agent'}}:op),
    sources: parsed.data.sources, reason: parsed.data.reason, author: 'muse', status: 'proposed',
  };
  prevalidateProposal(session, proposal);
  return proposal;
}

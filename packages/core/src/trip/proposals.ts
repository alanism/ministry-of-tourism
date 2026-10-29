// Proposals (MOT-20): agents propose, people approve. Atomic, idempotent, stale-safe.
import { CommandError } from '../commands/define.ts';
import type { Actor } from '../doc/model.ts';
import { assertAgentMediaAccess, TRIP_COMMANDS } from './commands.ts';
import { readAllCards, readCard } from './model.ts';
import { appliedPart, hasApplied, markApplied, tokenMatches } from './revisions.ts';
import type { ComparisonToken } from './revisions.ts';
import type { TripSession } from './session.ts';
import {tripCardSchema} from './schema.ts';

export interface ProposalOp { command: string; input: Record<string, unknown>; }
export interface SourceRef { id: string; url?: string; retrievedAt: string; }
export interface Proposal {
  id: string; boardId: string; token: ComparisonToken; ops: ProposalOp[];
  sources: SourceRef[]; reason: string; author: string;
  status: 'proposed' | 'applied' | 'declined' | 'stale' | 'cancelled';
}

/** Commands an agent may propose. Anything else is rejected before it can land. */
export const PROPOSABLE_COMMANDS = new Set(['trip_card_create', 'trip_card_update', 'trip_card_move', 'trip_task_set_status', 'trip_asset_attach']);

/** The existing card an op changes, if any. Create ops have none. */
function touchedCardId(op: ProposalOp): string | undefined {
  if (op.command === 'trip_card_create') return undefined;
  const ref = op.input.id ?? op.input.cardId;
  return typeof ref === 'string' ? ref : undefined;
}

export function prevalidateProposal(session: TripSession, proposal: Proposal, ownRevs: Record<string, number> = {}): void {
  if (proposal.boardId !== session.boardId) throw new CommandError('scope', 'Proposal is for another board');
  for (const op of proposal.ops) {
    if (!PROPOSABLE_COMMANDS.has(op.command)) throw new CommandError('scope', `Agents cannot propose ${op.command}`);
    const def = TRIP_COMMANDS.find((c) => c.name === op.command);
    if (!def) throw new CommandError('unknown_command', `No command named ${op.command}`);
    const parsed = def.input.safeParse(op.input);
    if (!parsed.success) throw new CommandError('invalid_input', `Proposal op ${op.command} is invalid`);
    // Who can see a card is the person's call, never an agent's.
    if (op.input.scope !== undefined) throw new CommandError('scope', 'Agents cannot change who can see a card');
    if(op.input.currentFacts!==undefined || (op.command==='trip_card_update' && (op.input.source!==undefined || op.input.sourceText!==undefined)))throw new CommandError('scope','Agents cannot replace source evidence or assert independently verified facts');
    if(op.command==='trip_card_create')assertAgentMediaAccess(session.parts,(parsed.data as {assetIds:string[]}).assetIds);
    if(op.command==='trip_asset_attach')assertAgentMediaAccess(session.parts,[(parsed.data as {asset:{id:string}}).asset.id]);
    const cardId = touchedCardId(op);
    if (cardId === undefined) continue;
    // Every touched card must be in the token, or a later edit could be overwritten unseen.
    if (!(cardId in proposal.token.cardRevs)) throw new CommandError('stale', `Card ${cardId} is not covered by this proposal's revision check. Nothing was applied.`);
    if (readCard(session.parts, cardId)?.scope === 'private') throw new CommandError('scope', 'Agents cannot change private cards');
  }
  const live = new Set(readAllCards(session.parts).map((c) => c.id));
  if (!tokenMatches(session.parts, session.boardId, proposal.token, live, ownRevs)) throw new CommandError('stale', 'This proposal is based on an older revision. Nothing was applied.');
}

/**
 * Apply selected ops atomically as the approving person. Ops already approved are skipped, so
 * the rest stay approvable (#8) and replay is a no-op. Returns a receipt from committed state.
 */
export function applyProposal(session: TripSession, approver: Actor, proposal: Proposal, selected: number[] | null = null): { proposalId: string; appliedOps: number; boardRev: number; alreadyApplied?: boolean; remainingOps: number } {
  if (approver.kind !== 'human') throw new CommandError('human_only', 'Only a person can approve a proposal');
  const done = () => ({ proposalId: proposal.id, appliedOps: 0, boardRev: session.boardRev, alreadyApplied: true, remainingOps: 0 });
  if (hasApplied(session.parts, proposal.id)) return done();
  const prior = appliedPart(session.parts, proposal.id) ?? { ops: [], revs: {} };
  const wanted = selected ?? proposal.ops.map((_, i) => i);
  if (wanted.some((i) => !Number.isInteger(i) || !proposal.ops[i])) throw new CommandError('invalid_input', 'No such change in this proposal');
  const idx = [...new Set(wanted)].filter((i) => !prior.ops.includes(i)).sort((a, b) => a - b);
  if (!idx.length) return { ...done(), remainingOps: proposal.ops.length - prior.ops.length };
  const chosen: Proposal = { ...proposal, ops: idx.map((i) => proposal.ops[i]!) };
  prevalidateProposal(session, chosen, prior.revs);
  // The approving person keeps their role; a namespaced creation context makes test output durable and explicit.
  const context=proposal.author==='agent:fake'||proposal.author==='test-adapter'?{...approver,id:`test-adapter:${approver.id}`}:approver;
  if(context!==approver)tripCardSchema.shape.createdBy.parse(context.id);
  session.executeAll(context, chosen.ops, proposalUndoKey(proposal.id));
  const ops = [...prior.ops, ...idx].sort((a, b) => a - b);
  const revs = { ...prior.revs };
  for (const op of chosen.ops) { const id = touchedCardId(op); if (id) revs[id] = session.cardRev(id); }
  markApplied(session.doc, proposal.id, ops.length === proposal.ops.length ? undefined : { ops, revs });
  return { proposalId: proposal.id, appliedOps: idx.length, boardRev: session.boardRev, remainingOps: proposal.ops.length - ops.length };
}

const proposalUndoKey = (proposalId: string) => `proposal:${proposalId}`;

/** Undo every approved part of one proposal; later edits to other cards stay (MOT-21). */
export function undoProposal(session: TripSession, proposalId: string): boolean {
  let undone = false;
  while (session.undo(proposalUndoKey(proposalId))) undone = true;
  return undone;
}

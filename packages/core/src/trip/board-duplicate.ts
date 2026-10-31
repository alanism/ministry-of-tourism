// Narrow duplicate command + minimal same-board clipboard (MOT-120, approved G4).
// Type-only TripCommandDef import: commands.ts imports this module at runtime, so no runtime cycle is created.
import { z } from 'zod';
import { CommandError } from '../commands/define.ts';
import type { TripCommandDef } from './commands.ts';
import { readAsset, readCard, readPresentation, writeCard, writePresentation, type TripParts } from './model.ts';
import { presentationSchema, tripCardSchema } from './schema.ts';
import { BOARD_EXTENT_V1 } from './board-geometry.ts';

const id = z.string().min(1).max(200);
const offset = z.number().finite().min(-10000).max(10000).default(120);
export const boardDuplicateInputSchema = z.object({
  sourceCardId: id.optional(),
  sourcePresentationId: id.optional(),
  offsetX: offset,
  offsetY: offset,
}).strict().refine((v) => (v.sourceCardId === undefined) !== (v.sourcePresentationId === undefined), 'Give exactly one of sourceCardId or sourcePresentationId');
export type BoardDuplicateInput = z.infer<typeof boardDuplicateInputSchema>;

function freshId(ctx: { newId: () => string }, parts: TripParts): string {
  const newId = ctx.newId();
  if (!newId || parts.cards.has(newId) || parts.presentations.has(newId) || parts.assets.has(newId)) {
    throw new CommandError('invalid_input', `Generated ID ${newId || '(empty)'} already exists; nothing was copied`);
  }
  return newId;
}

/**
 * Walks the complete derivedFrom ancestor graph for every directly referenced asset.
 * readAsset is the model reader and therefore applies assetSchema metadata validation;
 * any schema failure, dangling ancestor, malformed reference, or cycle is converted to a
 * pre-write invalid_input rejection. No traversal result is copied: a copy may only share
 * asset IDs after the whole graph they transitively reference has been proven present,
 * valid, and acyclic, so no missing reference can be copied into the duplicate's closure.
 */
function assertAssetGraph(parts: TripParts, rootAssetIds: readonly string[]): void {
  const state = new Map<string, 'visiting' | 'done'>();
  const visit = (assetId: string, trail: readonly string[]): void => {
    const mark = state.get(assetId);
    if (mark === 'done') return;
    if (mark === 'visiting') {
      throw new CommandError('invalid_input', `Media ancestry contains a cycle at ${assetId}: ${[...trail, assetId].join(' -> ')}; nothing was copied`);
    }
    let asset: ReturnType<typeof readAsset>;
    try {
      asset = readAsset(parts, assetId);
    } catch {
      throw new CommandError('invalid_input', `Media ${assetId} has invalid metadata; nothing was copied`);
    }
    if (!asset) {
      throw new CommandError('invalid_input', `Missing media ${assetId}; nothing was copied`);
    }
    state.set(assetId, 'visiting');
    if (asset.derivedFrom) visit(asset.derivedFrom, [...trail, assetId]);
    state.set(assetId, 'done');
  };
  for (const assetId of rootAssetIds) visit(assetId, []);
}

/**
 * Human-only duplicate for one card or one board-surface asset placement.
 * Everything is preflighted and fully validated before the single write: Yjs has no rollback.
 * Cards keep content/sourceText/travelerNote/facts/media/scope/stage/day/time, share asset IDs, and
 * drop booking, bookingAttention and lineage (votes/ballots/group metadata live outside the card and are never copied).
 * Board placements share the asset ID and keep crop/scope/stack; the asset record (credit/rights) is untouched.
 * Magazine placements are never copied through this board command.
 */
export const tripBoardDuplicate: TripCommandDef<BoardDuplicateInput, { id: string; sourceId: string }> = {
  name: 'trip_board_duplicate',
  title: 'Duplicate on this board',
  description: 'Copies one card or board image on the same board at a 120-unit offset, without booking or lineage authority.',
  access: 'write',
  humanOnly: true,
  input: boardDuplicateInputSchema,
  run: (ctx, input) => {
    if (ctx.actor.kind !== 'human') throw new CommandError('human_only', 'trip_board_duplicate can only be run by a person');
    if (input.sourceCardId !== undefined) {
      const source = readCard(ctx.parts, input.sourceCardId);
      if (!source) throw new CommandError('not_found', `No trip card ${input.sourceCardId}`);
      assertAssetGraph(ctx.parts, source.assetIds);
      const newId = freshId(ctx, ctx.parts);
      const { booking: _booking, bookingAttention: _attention, lineage: _lineage, id: _oldId, ...rest } = source;
      let candidate;
      try {
        candidate = tripCardSchema.parse({ ...rest, id: newId, assetIds: [...source.assetIds], x: source.x + input.offsetX, y: source.y + input.offsetY, createdBy: ctx.actor.id, updatedAt: new Date().toISOString() });
      } catch { throw new CommandError('invalid_input', 'The copy would not fit on the board; nothing was copied'); }
      writeCard(ctx.parts, candidate);
      return { id: newId, sourceId: source.id };
    }
    const source = readPresentation(ctx.parts, input.sourcePresentationId!);
    if (!source) throw new CommandError('not_found', `No presentation ${input.sourcePresentationId}`);
    if (source.surface !== 'board') throw new CommandError('invalid_input', 'Only board images can be duplicated here; magazine placements are not copied');
    if (source.locked) throw new CommandError('invalid_input', 'That board image is locked; nothing was copied');
    if (!source.assetId) throw new CommandError('invalid_input', 'Missing media for that board image; nothing was copied');
    assertAssetGraph(ctx.parts, [source.assetId]);
    const newId = freshId(ctx, ctx.parts);
    let candidate;
    try {
      candidate = presentationSchema.parse({ ...source, id: newId, x: source.x + input.offsetX / BOARD_EXTENT_V1, y: source.y + input.offsetY / BOARD_EXTENT_V1 });
    } catch { throw new CommandError('invalid_input', 'The copy would not fit on the board; nothing was copied'); }
    writePresentation(ctx.parts, candidate);
    return { id: newId, sourceId: source.id };
  },
};

// --- Minimal same-board clipboard: an in-memory resolved source reference, never a serialized claim. ---

export interface SameBoardSource { boardId: string; parts: TripParts; }
export type SameBoardCopyRef = { sourceCardId: string } | { sourcePresentationId: string };
export interface SameBoardClipboard { version: 1; source: SameBoardSource; boardId: string; ref: SameBoardCopyRef; }

export function captureSameBoardClipboard(source: SameBoardSource, ref: SameBoardCopyRef): SameBoardClipboard {
  const exists = 'sourceCardId' in ref ? !!readCard(source.parts, ref.sourceCardId) : !!readPresentation(source.parts, ref.sourcePresentationId);
  if (!exists) throw new Error('That item is no longer on this board; copy it again.');
  return { version: 1, source, boardId: source.boardId, ref: { ...ref } };
}

/** Resolves a captured clipboard against the *same* live source object; anything else is rejected unchanged. */
export function resolveSameBoardClipboard(current: SameBoardSource, clipboard: SameBoardClipboard): SameBoardCopyRef {
  if (!clipboard || clipboard.version !== 1 || clipboard.source !== current || clipboard.boardId !== current.boardId) {
    throw new Error('This copy belongs to another board or session. Cross-board paste is held: use a native trip package export/import instead.');
  }
  const ref = clipboard.ref;
  const exists = 'sourceCardId' in ref ? !!readCard(current.parts, ref.sourceCardId) : !!readPresentation(current.parts, ref.sourcePresentationId);
  if (!exists) throw new Error('That item is no longer on this board; copy it again.');
  return { ...ref };
}

/** Serialized clipboard payloads carry no session identity and are never trusted as source claims. */
export function parseSameBoardClipboard(_serialized: unknown): never {
  throw new Error('A pasted board payload cannot prove its source. Cross-board paste is held: use a native trip package export/import instead.');
}

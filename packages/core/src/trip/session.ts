// TripSession (MOT-12): mirrors BoardSession over the trip doc, plus revisions (MOT-11).
import * as Y from 'yjs';
import { z } from 'zod';
import { CommandError, toToolDefinition, type ToolDefinition } from '../commands/define.ts';
import type { Actor } from '../doc/model.ts';
import { presentationScope, readCard, readPresentation, readTripMeta, tripParts, tripUndoScopes, type TripParts } from './model.ts';
import type { DestinationRecord } from './schema.ts';
import { TRIP_COMMANDS, type TripCommand, type TripCommandContext } from './commands.ts';
import { boardRev, bumpChangedRevisions, cardRev, snapshotCards, tokenFor, type ComparisonToken } from './revisions.ts';

interface ActorState { actor: Actor; origin: { actorId: string }; undo: Y.UndoManager; inRun: boolean; }

export class TripSession {
  readonly doc: Y.Doc;
  readonly parts: TripParts;
  private readonly commands = new Map<string, TripCommand>();
  private readonly actors = new Map<string, ActorState>();
  private readonly newId: () => string;
  private readonly destinations?: readonly DestinationRecord[];

  constructor(doc: Y.Doc, options: { commands?: readonly TripCommand[]; newId?: () => string; destinations?: readonly DestinationRecord[] } = {}) {
    this.doc = doc;
    this.parts = tripParts(doc);
    for (const c of options.commands ?? TRIP_COMMANDS) this.commands.set(c.name, c);
    this.newId = options.newId ?? (() => crypto.randomUUID());
    this.destinations = options.destinations;
  }

  tools(): ToolDefinition[] { return [...this.commands.values()].map(toToolDefinition); }
  get boardId(): string { return readTripMeta(this.doc).boardId; }
  get boardRev(): number { return boardRev(this.parts); }
  cardRev(id: string): number { return cardRev(this.parts, id); }
  token(cardIds: string[]): ComparisonToken { return tokenFor(this.parts, this.boardId, cardIds); }

  execute<O = unknown>(actor: Actor, name: string, rawInput: unknown = {}): O {
    const { command, input } = this.prepare(actor, name, rawInput);
    const ctx: TripCommandContext = { doc: this.doc, parts: this.parts, actor, newId: this.newId, destinations:this.destinations };
    if (command.access === 'read') return command.run(ctx, input) as O;
    const before = snapshotCards(this.doc);
    const state = this.stateFor(actor);
    let result: unknown;
    this.doc.transact(() => { result = command.run(ctx, input); }, state.origin);
    bumpChangedRevisions(this.doc, before);
    if (!state.inRun) state.undo.stopCapturing();
    return result as O;
  }

  /**
   * All or nothing: every op first runs on a throwaway copy, so a run-time failure lands nothing.
   * Then all ops run in one transaction: one revision bump and one undo step.
   * undoKey: whose undo stack the step joins. Proposals use their own key, so they can be undone
   * on their own and a person's Undo never removes them (MOT-12, MOT-21).
   */
  executeAll(actor: Actor, ops: readonly { command: string; input: unknown }[], undoKey: string = actor.id): unknown[] {
    const prepared = ops.map((op) => this.prepare(actor, op.command, op.input));
    const trial = new Y.Doc();
    Y.applyUpdate(trial, Y.encodeStateAsUpdate(this.doc));
    try {
      const trialCtx: TripCommandContext = { doc: trial, parts: tripParts(trial), actor, newId: () => crypto.randomUUID(),destinations:this.destinations };
      trial.transact(() => { for (const p of prepared) p.command.run(trialCtx, p.input); });
    } finally { trial.destroy(); }
    const ctx: TripCommandContext = { doc: this.doc, parts: this.parts, actor, newId: this.newId, destinations:this.destinations };
    const before = snapshotCards(this.doc);
    const state = this.stateFor(actor, undoKey);
    const results: unknown[] = [];
    state.undo.stopCapturing();
    this.doc.transact(() => { for (const p of prepared) results.push(p.command.run(ctx, p.input)); }, state.origin);
    bumpChangedRevisions(this.doc, before);
    state.undo.stopCapturing();
    return results;
  }

  private prepare(actor: Actor, name: string, rawInput: unknown): { command: TripCommand; input: unknown } {
    const command = this.commands.get(name);
    if (!command) throw new CommandError('unknown_command', `No command named ${name}`);
    if (command.humanOnly && actor.kind !== 'human') throw new CommandError('human_only', `${name} can only be run by a person`);
    if (actor.kind === 'agent' && command.access !== 'read' && this.parts.meta.get('agentMode') === 'solo') {
      throw new CommandError('solo_mode', 'Solo mode: agents read only. Ask the person to switch to Together.');
    }
    const parsed = command.input.safeParse(rawInput);
    if (!parsed.success) throw new CommandError('invalid_input', z.prettifyError(parsed.error));
    if (actor.kind === 'agent' && command.access !== 'read') {
      const input = parsed.data as Record<string,unknown>;
      if (input.scope !== undefined) throw new CommandError('scope','Agents cannot change who can see content');
      if(input.currentFacts!==undefined || (name==='trip_card_update' && (input.source!==undefined || input.sourceText!==undefined)))throw new CommandError('scope','Agents cannot replace source evidence or assert independently verified facts');
      const cardId = typeof input.cardId === 'string' ? input.cardId : typeof input.id === 'string' && !name.startsWith('trip_presentation_') ? input.id : undefined;
      if (cardId && readCard(this.parts,cardId)?.scope === 'private') throw new CommandError('scope','Agents cannot change private cards');
      if (name.startsWith('trip_presentation_') && typeof input.id === 'string') {
        const p=readPresentation(this.parts,input.id);
        if(p && presentationScope(this.parts,p)==='private')throw new CommandError('scope','Agents cannot change private presentations');
      }
      if (name==='trip_presentation_create' && cardId === undefined) throw new CommandError('scope','Agent art must belong to a visible card');
    }
    return { command, input: parsed.data };
  }

  beginRun(actor: Actor): void { const s = this.stateFor(actor); s.undo.stopCapturing(); s.inRun = true; }
  endRun(actor: Actor): void { const s = this.stateFor(actor); s.inRun = false; s.undo.stopCapturing(); }
  undo(actorId: string): boolean { const before = snapshotCards(this.doc); const ok = (this.actors.get(actorId)?.undo.undo() ?? null) != null; if (ok) bumpChangedRevisions(this.doc, before); return ok; }
  redo(actorId: string): boolean { const before = snapshotCards(this.doc); const ok = (this.actors.get(actorId)?.undo.redo() ?? null) != null; if (ok) bumpChangedRevisions(this.doc, before); return ok; }
  canUndo(actorId: string): boolean { return this.actors.get(actorId)?.undo.canUndo() ?? false; }
  destroy(): void { for (const s of this.actors.values()) s.undo.destroy(); this.actors.clear(); }

  private stateFor(actor: Actor, key: string = actor.id): ActorState {
    let s = this.actors.get(key);
    if (!s) {
      const origin = { actorId: key };
      s = { actor, origin, undo: new Y.UndoManager(tripUndoScopes(this.parts), { trackedOrigins: new Set([origin]), captureTimeout: Number.MAX_SAFE_INTEGER }), inRun: false };
      this.actors.set(key, s);
    }
    return s;
  }
}

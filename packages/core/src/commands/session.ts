// A BoardSession runs commands against one board for any number of actors.
// Every change is tagged with the actor who made it, and each actor gets their
// own undo history: a writer's undo never removes an agent's work, and
// "Undo agent run" removes everything one agent did in one run.
import * as Y from 'yjs';
import { z } from 'zod';
import { boardParts, boardScopes, type Actor, type BoardParts } from '../doc/model.ts';
import { BOARD_COMMANDS } from './board-commands.ts';
import { ITEM_COMMANDS } from './item-commands.ts';
import { COACH_COMMANDS } from './coach-commands.ts';
import { EXPORT_COMMANDS } from './export-commands.ts';
import { IMPORT_COMMANDS } from './import-commands.ts';
import { CommandError, toToolDefinition, type AnyCommand, type ToolDefinition } from './define.ts';

interface ActorState {
  actor: Actor;
  origin: { actorId: string };
  undo: Y.UndoManager;
  inRun: boolean;
}

export interface BoardSessionOptions {
  commands?: readonly AnyCommand[];
  newId?: () => string;
}

export class BoardSession {
  readonly doc: Y.Doc;
  private readonly parts: BoardParts;
  private readonly commands: Map<string, AnyCommand>;
  private readonly actors = new Map<string, ActorState>();
  private readonly newId: () => string;

  constructor(doc: Y.Doc, options: BoardSessionOptions = {}) {
    this.doc = doc;
    this.parts = boardParts(doc);
    this.commands = new Map((options.commands ?? [...BOARD_COMMANDS, ...ITEM_COMMANDS, ...COACH_COMMANDS, ...EXPORT_COMMANDS, ...IMPORT_COMMANDS]).map((c) => [c.name, c]));
    this.newId = options.newId ?? (() => crypto.randomUUID());
  }

  /** Tool definitions for agents (MCP, the built-in agent, the in-page API). */
  tools(): ToolDefinition[] {
    return [...this.commands.values()].map(toToolDefinition);
  }

  execute<O = unknown>(actor: Actor, name: string, rawInput: unknown = {}): O {
    const command = this.commands.get(name);
    if (!command) throw new CommandError('unknown_command', `No command named ${name}`);
    if (command.humanOnly && actor.kind !== 'human') {
      throw new CommandError('human_only', `${name} can only be run by the writer`);
    }
    if (actor.kind === 'agent' && command.access !== 'read' && this.parts.meta.get('agentMode') === 'solo') {
      throw new CommandError('solo_mode', 'Solo mode: the writer has agents reading only. Ask them to switch to Together or Autopilot.');
    }
    const parsed = command.input.safeParse(rawInput);
    if (!parsed.success) throw new CommandError('invalid_input', z.prettifyError(parsed.error));
    const input = parsed.data;
    if (actor.kind === 'agent' && command.writesProse?.(input) && this.parts.meta.get('draftForMe') !== true) {
      throw new CommandError(
        'coach_mode',
        'Coach mode: agents do not write the writer\'s words. Leave a note with card_annotate, or ask the writer to turn on Draft for me.',
      );
    }

    const ctx = { doc: this.doc, parts: this.parts, actor, newId: this.newId };
    if (command.access === 'read') return command.run(ctx, input) as O;

    const state = this.stateFor(actor);
    let result: unknown;
    this.doc.transact(() => {
      result = command.run(ctx, input);
    }, state.origin);
    if (!state.inRun) state.undo.stopCapturing();
    return result as O;
  }

  /** Groups an agent's commands so one undo removes the whole run. */
  beginRun(actor: Actor): void {
    const state = this.stateFor(actor);
    state.undo.stopCapturing();
    state.inRun = true;
  }

  endRun(actor: Actor): void {
    const state = this.stateFor(actor);
    state.inRun = false;
    state.undo.stopCapturing();
  }

  /** Undoes the actor's most recent command (or whole run, for an agent). */
  undo(actorId: string): boolean {
    return this.actors.get(actorId)?.undo.undo() != null;
  }

  redo(actorId: string): boolean {
    return this.actors.get(actorId)?.undo.redo() != null;
  }

  canUndo(actorId: string): boolean {
    return this.actors.get(actorId)?.undo.canUndo() ?? false;
  }

  destroy(): void {
    for (const state of this.actors.values()) state.undo.destroy();
    this.actors.clear();
  }

  private stateFor(actor: Actor): ActorState {
    let state = this.actors.get(actor.id);
    if (!state) {
      const origin = { actorId: actor.id };
      state = {
        actor,
        origin,
        // A huge capture window means changes merge until stopCapturing(), which
        // execute() calls after every command unless the actor is mid-run.
        undo: new Y.UndoManager(boardScopes(this.parts), {
          trackedOrigins: new Set([origin]),
          captureTimeout: Number.MAX_SAFE_INTEGER,
        }),
        inRun: false,
      };
      this.actors.set(actor.id, state);
    }
    return state;
  }
}

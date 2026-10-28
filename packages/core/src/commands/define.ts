// A command is the only way to change a board. The same definition drives the
// UI, the built-in agent, MCP tools for outside agents, and undo history.
import { z } from 'zod';
import type * as Y from 'yjs';
import type { Actor, BoardParts } from '../doc/model.ts';

/**
 * read: never changes the board.
 * write: changes the board; every write can be undone.
 * sensitive: removes things or spends money; agent platforms ask every time.
 */
export type Access = 'read' | 'write' | 'sensitive';

export interface CommandContext {
  doc: Y.Doc;
  parts: BoardParts;
  actor: Actor;
  newId: () => string;
}

export interface CommandDef<I, O> {
  name: string;
  title: string;
  description: string;
  access: Access;
  input: z.ZodType<I>;
  /** Only a person may run this (for example, turning "Draft for me" on). */
  humanOnly?: boolean;
  /** True when this call would put words into the writer's own text. */
  writesProse?: (input: I) => boolean;
  /** True when the command reaches the internet (for example, image generation). */
  openWorld?: boolean;
  /** Must check everything before changing the doc: Yjs does not roll back a throw. */
  run: (ctx: CommandContext, input: I) => O;
}

// Commands are stored together, so their input types are erased here.
export type AnyCommand = CommandDef<any, unknown>;
/** What tools and agents see of a command: everything but how it runs. */
export type CommandMeta = Omit<AnyCommand, 'run'>;

export function defineCommand<I, O>(def: CommandDef<I, O>): CommandDef<I, O> {
  return def;
}

export type CommandErrorCode =
  | 'unknown_command'
  | 'invalid_input'
  | 'not_found'
  | 'human_only'
  | 'coach_mode'
  | 'solo_mode'
  | 'quote_not_found'
  | 'quote_ambiguous'
  | 'stale'
  | 'unavailable'
  | 'scope';

export class CommandError extends Error {
  readonly code: CommandErrorCode;

  constructor(code: CommandErrorCode, message: string) {
    super(message);
    this.name = 'CommandError';
    this.code = code;
  }
}

/** MCP tool annotations (as ChatGPT and other MCP clients read them). */
export function toolAnnotations(def: CommandMeta) {
  return {
    title: def.title,
    readOnlyHint: def.access === 'read',
    destructiveHint: def.access === 'sensitive',
    openWorldHint: def.openWorld ?? false,
  };
}

/** Muse's tool classes. */
export function museToolClass(def: CommandMeta): 'Read' | 'Write' | 'Sensitive write' {
  return def.access === 'read' ? 'Read' : def.access === 'write' ? 'Write' : 'Sensitive write';
}

export interface ToolDefinition {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations: ReturnType<typeof toolAnnotations>;
  _meta: { 'writers-board/class': ReturnType<typeof museToolClass>; 'writers-board/humanOnly': boolean };
}

export function toToolDefinition(def: CommandMeta): ToolDefinition {
  return {
    name: def.name,
    title: def.title,
    description: def.description,
    inputSchema: z.toJSONSchema(def.input) as Record<string, unknown>,
    annotations: toolAnnotations(def),
    _meta: { 'writers-board/class': museToolClass(def), 'writers-board/humanOnly': def.humanOnly ?? false },
  };
}

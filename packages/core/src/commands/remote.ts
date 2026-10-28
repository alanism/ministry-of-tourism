// Runs tool calls that arrive from outside agents (through the bridge or an
// in-page agent) against the open board. Each agent's calls that come close
// together form one run, so the writer can undo an agent's burst of work at once.
import type { Actor } from '../doc/model.ts';
import { CommandError } from './define.ts';
import type { BoardSession } from './session.ts';

export interface RemoteCall {
  id: string;
  name: string;
  input: unknown;
  agent: { id: string; name: string };
}

export type RemoteResult =
  | { type: 'result'; id: string; ok: true; value: unknown }
  | { type: 'result'; id: string; ok: false; error: { code: string; message: string } };

const RUN_IDLE_MS = 4_000;

export function createRemoteCallHandler(session: BoardSession, onActivity?: (call: RemoteCall, result: RemoteResult) => void) {
  const runs = new Map<string, { actor: Actor; timer: ReturnType<typeof setTimeout> }>();

  const touchRun = (actor: Actor) => {
    const open = runs.get(actor.id);
    if (open) clearTimeout(open.timer);
    else session.beginRun(actor);
    runs.set(actor.id, {
      actor,
      timer: setTimeout(() => {
        session.endRun(actor);
        runs.delete(actor.id);
      }, RUN_IDLE_MS),
    });
  };

  return {
    handle(call: RemoteCall): RemoteResult {
      // Outside callers are always agents, whatever they call themselves.
      const actor: Actor = { kind: 'agent', id: call.agent.id.startsWith('agent:') ? call.agent.id : `agent:${call.agent.id}`, name: call.agent.name };
      touchRun(actor);
      let result: RemoteResult;
      try {
        result = { type: 'result', id: call.id, ok: true, value: session.execute(actor, call.name, call.input) };
      } catch (error) {
        const code = error instanceof CommandError ? error.code : 'error';
        result = { type: 'result', id: call.id, ok: false, error: { code, message: error instanceof Error ? error.message : String(error) } };
      }
      onActivity?.(call, result);
      return result;
    },
    /** Ends any open runs (for example when the connection closes). */
    flush() {
      for (const { actor, timer } of runs.values()) {
        clearTimeout(timer);
        session.endRun(actor);
      }
      runs.clear();
    },
  };
}

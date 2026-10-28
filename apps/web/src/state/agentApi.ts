// In-page API for agents running in the browser (and for tests). Agents use the
// same commands as the writer, tagged with their own identity, so Coach mode
// and per-agent undo apply to them.
import type { Actor, BoardSession, ToolDefinition } from '@writers-board/core';

export interface WritersBoardApi {
  tools(): ToolDefinition[];
  call(name: string, input?: unknown, agent?: { id: string; name: string }): unknown;
  beginRun(agent: { id: string; name: string }): void;
  endRun(agent: { id: string; name: string }): void;
  undoAgentRun(agentId: string): boolean;
}

declare global {
  interface Window {
    writersBoard?: WritersBoardApi;
  }
}

const PAGE_AGENT = { id: 'agent:page', name: 'Page agent' };
const asAgent = (agent: { id: string; name: string }): Actor => ({ kind: 'agent', ...agent });

export function installAgentApi(session: BoardSession): void {
  window.writersBoard = {
    tools: () => session.tools(),
    call: (name, input = {}, agent = PAGE_AGENT) => session.execute(asAgent(agent), name, input),
    beginRun: (agent) => session.beginRun(asAgent(agent)),
    endRun: (agent) => session.endRun(asAgent(agent)),
    undoAgentRun: (agentId) => session.undo(agentId),
  };
}

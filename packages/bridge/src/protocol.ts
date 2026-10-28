// Messages between the bridge and the board open in the writer's browser.
// The board connects out to the bridge; the bridge never stores the board.

export interface AgentIdentity {
  id: string;
  name: string;
}

/** Bridge -> board: run one tool as this agent. */
export interface CallMessage {
  type: 'call';
  id: string;
  name: string;
  input: unknown;
  agent: AgentIdentity;
}

/** Board -> bridge: what the tool returned, or why it was refused. */
export type ResultMessage =
  | { type: 'result'; id: string; ok: true; value: unknown }
  | { type: 'result'; id: string; ok: false; error: { code: string; message: string } };

export type BoardMessage = ResultMessage | { type: 'hello'; board: string };

/** A pairing token: long enough that it can't be guessed. */
export function isValidToken(token: string | null | undefined): token is string {
  return typeof token === 'string' && /^[A-Za-z0-9_-]{24,128}$/.test(token);
}

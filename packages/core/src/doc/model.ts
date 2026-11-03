// Shared identity and agent-mode types for trip planning.

/** solo: agents only read. together: agents work beside the person. autopilot: an agent drives until stopped. */
export const AGENT_MODES = ['solo', 'together', 'autopilot'] as const;
export type AgentMode = (typeof AGENT_MODES)[number];

export interface Actor {
  kind: 'human' | 'agent';
  id: string;
  name: string;
}

/** Changes made while setting up a board; never part of anyone's undo history. */
export const SYSTEM_ORIGIN = Object.freeze({ system: true });


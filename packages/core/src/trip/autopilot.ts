// Autopilot (MOT-26, optional): explicit allowed list + budget, enforced in code, not prompts.
import { CommandError } from '../commands/define.ts';
import type { Actor } from '../doc/model.ts';
import { prevalidateProposal, type Proposal } from './proposals.ts';
import { hasApplied, markApplied } from './revisions.ts';
import type { TripSession } from './session.ts';

export interface AutopilotPolicy { allowedCommands: string[]; maxOps: number; maxProposals: number; }
export const DEFAULT_AUTOPILOT: AutopilotPolicy = { allowedCommands: ['trip_card_create', 'trip_card_update', 'trip_card_move'], maxOps: 10, maxProposals: 3 };

export interface AutopilotResult { applied: number; stopped?: string; }

export function runAutopilot(session: TripSession, agent: Actor, proposals: Proposal[], policy: AutopilotPolicy = DEFAULT_AUTOPILOT): AutopilotResult {
  if (agent.kind !== 'agent') throw new CommandError('scope', 'Autopilot runs as an agent');
  let applied = 0;
  const list = proposals.slice(0, policy.maxProposals);
  if (proposals.length > policy.maxProposals) return { applied: 0, stopped: `Budget hit: more than ${policy.maxProposals} proposals in one run. Nothing applied beyond the limit.` };
  let ops = 0;
  for (const p of list) {
    for (const op of p.ops) {
      if (!policy.allowedCommands.includes(op.command)) throw new CommandError('scope', `Autopilot is not allowed to run ${op.command}`);
      ops++;
      if (ops > policy.maxOps) return { applied, stopped: `Budget hit: more than ${policy.maxOps} operations. Stopped; applied work stays, the rest did not run.` };
    }
  }
  // Autopilot still goes through proposals with the agent as approver ONLY when
  // the board mode is autopilot; TripSession + proposals enforce the rest.
  const mode = session.parts.meta.get('agentMode');
  if (mode !== 'autopilot') return { applied: 0, stopped: 'Autopilot is off: the board is not in Autopilot mode. Nothing applied.' };
  for (const p of list) {
    if (hasApplied(session.parts, p.id)) continue;
    prevalidateProposal(session, p);
    session.executeAll(agent, p.ops);
    markApplied(session.doc, p.id); applied += p.ops.length;
  }
  return { applied };
}

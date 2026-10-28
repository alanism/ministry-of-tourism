// Agent gateway (MOT-22) + hostile-content boundary (MOT-24).
// Content is data, never instructions: tool scope is enforced here in code.
import { CommandError } from '../commands/define.ts';
import type { Actor } from '../doc/model.ts';
import { agentView } from './projections.ts';
import { catalogSearch, routeEstimate, type FccAdapter, type FccCityContent, type CityFetchOptions } from './city-source.ts';
import { fakeProposal, TEST_ADAPTER_LABEL } from './agent-fake.ts';
import type { Proposal } from './proposals.ts';
import type { TripSession } from './session.ts';

export const AGENT_TOOLS = ['trip_brief_read', 'tasks_list', 'catalog_search', 'route_estimate', 'cards_propose'] as const;

export function tripBriefRead(session: TripSession) {
  const view = agentView(session.doc);
  return { boardId: view.boardId, boardRev: view.boardRev, brief: view.brief };
}
export function tasksList(session: TripSession) { return { openTasks: agentView(session.doc).openTasks }; }
export function gatewayCatalogSearch(session: TripSession, city: string, query = '', content?: FccCityContent) {
  const metaCity = String(session.parts.meta.get('cityId') ?? session.parts.meta.get('city'));
  if (city.toLowerCase() !== metaCity.toLowerCase()) throw new CommandError('scope', 'Agents may search only the selected board city');
  return catalogSearch(city, query, content);
}
/** Fetch is scoped to the active destination and sends only that public city ID. */
export function gatewayCityContent(session: TripSession, adapter: FccAdapter, request?: CityFetchOptions) {
  const cityId = String(session.parts.meta.get('cityId') ?? session.parts.meta.get('city'));
  return adapter.getCity(cityId, request);
}
export function gatewayRouteEstimate() { return routeEstimate(); }

/** Propose only: never applies, never approves. Cross-board or off-allowlist ops are rejected in proposals.ts. */
export function cardsPropose(session: TripSession, actor: Actor, seed = 'demo'): { proposal: Proposal; label: string; note: string } {
  if (actor.kind !== 'agent') throw new CommandError('scope', 'cards_propose is an agent tool');
  return { proposal: fakeProposal(session, seed), label: TEST_ADAPTER_LABEL, note: 'Proposed only. A person must approve before anything changes.' };
}

export const AGENTS_MD_NOTE = 'Agents cannot approve, pay or publish. Proposals change nothing until a person approves.';
export { TEST_ADAPTER_LABEL };

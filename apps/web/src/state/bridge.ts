// Connects the open board out to a bridge so outside agents can use it:
// the local bridge (desktop agents) and/or a relay (cloud agents). The board
// stays in this browser; the bridge only forwards calls while it is open.
import { useSyncExternalStore } from 'react';
import { createRemoteCallHandler, type RemoteCall, type RemoteResult } from '@writers-board/core';
import { boardSession } from './board';

export interface AgentLinkSettings {
  token: string;
  local: boolean;
  relayUrl: string;
}

export type LinkStatus = 'off' | 'connecting' | 'connected' | 'unreachable';

export interface Activity {
  at: number;
  agent: string;
  tool: string;
  ok: boolean;
  detail?: string;
}

interface State {
  settings: AgentLinkSettings;
  status: { local: LinkStatus; relay: LinkStatus };
  activity: Activity[];
}

const KEY = 'writers-board:agent-links';
export const LOCAL_BRIDGE = 'ws://127.0.0.1:7457';

export function newToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function loadSettings(): AgentLinkSettings {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (saved?.token) return { token: saved.token, local: Boolean(saved.local), relayUrl: saved.relayUrl ?? '' };
  } catch {
    // Start fresh below.
  }
  return { token: newToken(), local: false, relayUrl: '' };
}

let state: State = { settings: loadSettings(), status: { local: 'off', relay: 'off' }, activity: [] };
const listeners = new Set<() => void>();
const set = (patch: Partial<State>) => {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
};

export function useAgentLinks(): State {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );
}

interface Link {
  socket: WebSocket | null;
  retry: ReturnType<typeof setTimeout> | null;
  attempts: number;
  stopped: boolean;
}
const links: Record<'local' | 'relay', Link> = {
  local: { socket: null, retry: null, attempts: 0, stopped: true },
  relay: { socket: null, retry: null, attempts: 0, stopped: true },
};

function boardSocketUrl(which: 'local' | 'relay'): string {
  const base = which === 'local' ? LOCAL_BRIDGE : state.settings.relayUrl.trim().replace(/^http/, 'ws').replace(/\/+$/, '');
  return `${base}/board?token=${encodeURIComponent(state.settings.token)}`;
}

function setStatus(which: 'local' | 'relay', status: LinkStatus) {
  set({ status: { ...state.status, [which]: status } });
}

function record(call: RemoteCall, result: RemoteResult) {
  const entry: Activity = { at: Date.now(), agent: call.agent.name, tool: call.name, ok: result.ok, detail: result.ok ? undefined : result.error.code };
  set({ activity: [entry, ...state.activity].slice(0, 30) });
}

function open(which: 'local' | 'relay') {
  const link = links[which];
  link.stopped = false;
  setStatus(which, 'connecting');
  let socket: WebSocket;
  try {
    socket = new WebSocket(boardSocketUrl(which));
  } catch {
    setStatus(which, 'unreachable');
    return;
  }
  link.socket = socket;
  const handler = createRemoteCallHandler(boardSession(), record);
  socket.onopen = () => {
    link.attempts = 0;
    setStatus(which, 'connected');
    socket.send(JSON.stringify({ type: 'hello', board: 'writers-board' }));
  };
  socket.onmessage = (event) => {
    let call: RemoteCall;
    try {
      call = JSON.parse(String(event.data));
    } catch {
      return;
    }
    if ((call as { type?: string }).type !== 'call') return;
    socket.send(JSON.stringify(handler.handle(call)));
  };
  socket.onclose = () => {
    handler.flush();
    if (link.socket === socket) link.socket = null;
    if (link.stopped) return setStatus(which, 'off');
    setStatus(which, 'unreachable');
    // Keep trying quietly, backing off up to 30 seconds.
    link.attempts++;
    link.retry = setTimeout(() => open(which), Math.min(30_000, 1000 * 2 ** Math.min(link.attempts, 5)));
  };
}

function close(which: 'local' | 'relay') {
  const link = links[which];
  link.stopped = true;
  if (link.retry) clearTimeout(link.retry);
  link.retry = null;
  link.socket?.close();
  link.socket = null;
  setStatus(which, 'off');
}

/** Opens or closes connections to match the settings. Call once the board is open. */
export function applyAgentLinks(next: AgentLinkSettings = state.settings) {
  const changed = next.token !== state.settings.token || next.relayUrl !== state.settings.relayUrl;
  set({ settings: next });
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Without storage the settings last until the page closes.
  }
  if (changed) {
    close('local');
    close('relay');
  }
  if (next.local) {
    if (!links.local.socket && links.local.stopped) open('local');
  } else close('local');
  if (next.relayUrl.trim()) {
    if (!links.relay.socket && links.relay.stopped) open('relay');
  } else close('relay');
}

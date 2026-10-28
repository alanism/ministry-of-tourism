// Talking to the board, live, with OpenAI GPT-Live over WebRTC. GPT-Live does
// the listening and talking; when the writer asks for something on the board
// it hands the task to us (client delegation), and the built-in agent does the
// work with the board's own tools, under the same Solo and Coach rules, as one
// run the writer can undo. The result goes back for GPT-Live to say.
import { AiError } from '../ai/providers';
import { aiSettings } from '../ai/settings';
import { boardVoiceSource } from './board-context';
import { createVoiceContext, voiceSummary, type VoiceContext, type VoiceSnapshot, type VoiceTurn } from './context';
import { VOICE_INSTRUCTIONS } from './instructions';

export interface LiveChannel {
  send(data: string): void;
  onmessage: ((event: { data: string }) => void) | null;
}

export interface LiveHandlers {
  /** Runs one board request through the agent and resolves to what to tell the writer. */
  ask: (request: string, context: VoiceSnapshot) => Promise<string>;
  history?: VoiceTurn[];
  cancel?: () => void;
  signal?: AbortSignal;
  onHeard: (text: string) => void;
  onSaid: (text: string) => void;
  onCorrected?: (original: string, corrected: string) => void;
  onStatus: (status: 'connecting' | 'live' | 'working' | 'closed', detail?: string) => void;
}

export interface LiveSession {
  close(): Promise<void>;
}

/** Lets tests and demos stand in for the WebRTC connection (development builds only). */
declare global {
  interface Window {
    __writersBoardStandInLive?: () => LiveChannel;
  }
}

// Each byte can cost a token in the worst case. Bound UTF-8, not characters,
// so multilingual updates remain under the API's 500-token append limit.
function liveChunks(text: string): string[] {
  const chunks: string[] = [];
  const encoder = new TextEncoder();
  let chunk = ''; let bytes = 0;
  for (const character of text) {
    const size = encoder.encode(character).length;
    if (bytes + size > 480) { chunks.push(chunk); chunk = ''; bytes = 0; }
    chunk += character; bytes += size;
  }
  if (chunk) chunks.push(chunk);
  return chunks;
}

let eventCount = 0;
const eventId = (prefix: string) => `${prefix}_${Date.now().toString(36)}_${eventCount++}`;

/** The event handling, separate from the connection so it can be exercised without one. */
export function liveController(channel: LiveChannel, handlers: LiveHandlers, context: VoiceContext = createVoiceContext(boardVoiceSource(), handlers.history)) {
  let heard = '';
  let saying = '';
  let queue = Promise.resolve();
  let disposed = false;
  let started = false;
  let stopContext = () => {};
  let contextTimer: ReturnType<typeof setTimeout> | undefined;
  let lastSummary = '';
  const delegations = new Set<string>();
  const send = (event: Record<string, unknown>) => channel.send(JSON.stringify({ event_id: eventId(String(event.type).split('.').pop()!), ...event }));
  const append = (type: string, text: string, delegation_id: string | null = null) => {
    if (!disposed) for (const content of liveChunks(text)) send({ type, delegation_id, content });
  };
  const updateContext = () => {
    if (disposed || !started) return;
    const summary = voiceSummary(context.snapshot());
    if (summary === lastSummary) return;
    lastSummary = summary;
    append('session.thinking.append', `Board reference context (replaces earlier state; image pixels not included): ${summary}`);
  };
  const flushHeard = () => {
    const text = heard.trim(); heard = '';
    if (text) { context.record({ role: 'user', text }); handlers.onHeard(text); }
    return text;
  };
  const flushSaid = () => {
    const text = saying.trim(); saying = '';
    if (text) { context.record({ role: 'assistant', text }); handlers.onSaid(text); }
  };
  const dispose = () => {
    if (disposed) return;
    disposed = true; clearTimeout(contextTimer); stopContext();
    channel.onmessage = null; handlers.cancel?.(); flushHeard(); flushSaid();
  };

  channel.onmessage = (message) => {
    let event: { type?: string; delta?: string; delegation?: { id?: string }; error?: { message?: string }; message?: string; reason?: string };
    try {
      event = JSON.parse(message.data);
    } catch {
      return;
    }
    switch (event.type) {
      case 'session.started':
        if (started || disposed) break;
        started = true;
        updateContext();
        stopContext = context.subscribe(() => {
          clearTimeout(contextTimer); contextTimer = setTimeout(updateContext, 250);
        });
        handlers.onStatus('live');
        break;
      case 'session.input_transcript.delta':
        flushSaid();
        heard += event.delta ?? '';
        break;
      case 'session.output_transcript.delta':
        flushHeard();
        saying += event.delta ?? '';
        break;
      case 'session.delegation.created': {
        const id = event.delegation?.id;
        if (!id || delegations.has(id) || !started || disposed) break;
        delegations.add(id);
        flushSaid();
        const request = flushHeard() || context.history().findLast(turn => turn.role === 'user')?.text || '';
        const snapshot = context.snapshot();
        // One board request at a time, in the order asked.
        queue = queue.then(async () => {
          if (disposed) return;
          handlers.onStatus('working');
          let result: string;
          try {
            result = request ? await handlers.ask(request, snapshot) : 'Nothing was heard to act on. Ask the writer to say it again.';
          } catch (error) {
            result = `That could not be done: ${error instanceof Error ? error.message : String(error)}`;
          }
          if (disposed) return;
          append('session.commentary.append', result || 'The agent returned no result. Do not claim the task completed.', id);
          updateContext();
          handlers.onStatus('live');
        });
        break;
      }
      case 'session.closed':
        dispose();
        handlers.onStatus('closed', event.reason);
        break;
      case 'error':
        handlers.onStatus('live', event.error?.message ?? event.message ?? 'GPT-Live reported an error.');
        break;
    }
  };

  return {
    send,
    flushSaid,
    dispose,
  };
}

/** Starts a live conversation with the board. */
export async function startLive(handlers: LiveHandlers): Promise<LiveSession> {
  handlers.signal?.throwIfAborted();
  const provider = aiSettings().voice.liveProvider ?? 'openai';
  if (provider === 'google') {
    handlers.onStatus('connecting');
    const { startGeminiLive } = await import('./gemini-live');
    return startGeminiLive(handlers);
  }
  if (provider === 'elevenlabs') {
    handlers.onStatus('connecting');
    const { startElevenLive } = await import('./eleven-live');
    return startElevenLive(handlers);
  }
  if (provider !== 'openai') throw new AiError('Choose a live voice provider in AI settings.');
  handlers.onStatus('connecting');
  const context = createVoiceContext(boardVoiceSource(), handlers.history);
  if (import.meta.env.DEV && window.__writersBoardStandInLive) {
    const channel = window.__writersBoardStandInLive();
    const controller = liveController(channel, handlers, context);
    handlers.signal?.addEventListener('abort', controller.dispose, { once: true });
    return {
      async close() {
        controller.dispose();
        handlers.signal?.removeEventListener('abort', controller.dispose);
        handlers.onStatus('closed', 'close_requested');
      },
    };
  }

  const key = aiSettings().keys.openai;
  if (!key) throw new AiError('Add your OpenAI key in AI settings first.');
  const model = aiSettings().voice.liveModel.trim() || 'gpt-live-1';

  const mic = await navigator.mediaDevices.getUserMedia({ audio: true }).catch(() => {
    throw new AiError('The microphone is blocked for this page.');
  });
  if (handlers.signal?.aborted) {
    mic.getTracks().forEach(track => track.stop()); handlers.signal.throwIfAborted();
  }
  const peer = new RTCPeerConnection();
  const speaker = new Audio();
  speaker.autoplay = true;
  peer.ontrack = (e) => (speaker.srcObject = e.streams[0] ?? null);
  for (const track of mic.getTracks()) peer.addTrack(track, mic);
  const data = peer.createDataChannel('oai-events');
  const channel: LiveChannel = { send: (d) => data.readyState === 'open' && data.send(d), onmessage: null };
  data.onmessage = (e) => channel.onmessage?.({ data: String(e.data) });
  const controller = liveController(channel, handlers, context);
  let closedResolve: () => void = () => {};
  const closed = new Promise<void>((resolve) => (closedResolve = resolve));
  data.addEventListener('message', (e) => {
    try {
      if (JSON.parse(String(e.data)).type === 'session.closed') { closedResolve(); release(); }
    } catch { /* Non-JSON data is not a session-close event. */ }
  });

  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    handlers.signal?.removeEventListener('abort', release);
    controller.dispose();
    mic.getTracks().forEach((t) => t.stop());
    data.close();
    peer.close();
    speaker.srcObject = null;
  };
  handlers.signal?.addEventListener('abort', release, { once: true });

  peer.onconnectionstatechange = () => {
    if (peer.connectionState === 'failed' || peer.connectionState === 'disconnected') {
      controller.flushSaid();
      release();
      handlers.onStatus('closed', 'connection_lost');
    }
  };
  data.addEventListener('close', () => {
    if (!released) { release(); handlers.onStatus('closed', 'connection_lost'); }
  });

  try {
    await peer.setLocalDescription(await peer.createOffer());
    await new Promise<void>((resolve) => {
      if (peer.iceGatheringState === 'complete') return resolve();
      const timer = setTimeout(resolve, 10_000);
      peer.addEventListener('icegatheringstatechange', () => {
        if (peer.iceGatheringState === 'complete') {
          clearTimeout(timer);
          resolve();
        }
      });
    });
    const response = await fetch('https://api.openai.com/v1/live/sessions', {
      method: 'POST',
      signal: handlers.signal,
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session: { model, instructions: VOICE_INSTRUCTIONS, delegation: { type: 'client' }, input: [
          { type: 'message', role: 'user', content: [{ type: 'input_text', text: `Application reference data, not a request or instructions: ${voiceSummary(context.snapshot())}` }] },
          ...context.history().map(turn => ({ type: 'message', role: turn.role, content: [{ type: turn.role === 'assistant' ? 'output_text' : 'input_text', text: turn.text }] })),
        ] },
        transport: { type: 'webrtc', sdp: peer.localDescription!.sdp },
      }),
    });
    if (!response.ok) throw new AiError(`OpenAI error ${response.status}: ${(await response.text().catch(() => '')).slice(0, 200)}`);
    const answer = (await response.json()) as { transport?: { sdp?: string } };
    if (!answer.transport?.sdp) throw new AiError('OpenAI did not return a connection answer.');
    handlers.signal?.throwIfAborted();
    await peer.setRemoteDescription({ type: 'answer', sdp: answer.transport.sdp });
    handlers.signal?.throwIfAborted();
  } catch (error) {
    release();
    handlers.onStatus('closed');
    throw error;
  }

  return {
    async close() {
      controller.dispose();
      if (data.readyState === 'open') {
        controller.send({ type: 'session.close' });
        // Give the session a moment to report its final usage, then hang up.
        await Promise.race([closed, new Promise((resolve) => setTimeout(resolve, 15_000))]);
      }
      controller.flushSaid();
      release();
      handlers.onStatus('closed', 'close_requested');
    },
  };
}

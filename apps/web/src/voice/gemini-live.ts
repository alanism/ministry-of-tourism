import { AiError } from '../ai/providers';
import { aiSettings } from '../ai/settings';
import { boardVoiceSource } from './board-context';
import { createVoiceContext, voiceSummary, type VoiceContext } from './context';
import { openGeminiAudio, type GeminiAudio } from './gemini-audio';
import { VOICE_INSTRUCTIONS } from './instructions';
import type { LiveHandlers, LiveSession } from './live';

interface Content { role: 'user' | 'model'; parts: { text: string }[] }
export interface GeminiClientMessage {
  clientContent?: { turns: Content[]; turnComplete: boolean };
  toolResponse?: { functionResponses: { id: string; name: string; response: { result?: string; error?: string } }[] };
  realtimeInput?: { audio: { data: string; mimeType: string } };
}
interface GeminiMessage {
  setupComplete?: object;
  serverContent?: {
    modelTurn?: { parts?: { inlineData?: { data: string; mimeType: string } }[] };
    inputTranscription?: { text?: string; finished?: boolean };
    outputTranscription?: { text?: string; finished?: boolean };
    interrupted?: boolean; turnComplete?: boolean;
  };
  toolCall?: { functionCalls?: { id?: string; name?: string; args?: { request?: unknown } }[] };
  toolCallCancellation?: { ids?: string[] };
  goAway?: { timeLeft?: string };
  error?: { message?: string };
}

/** Protocol adapter; board context and board-agent permissions are shared with GPT-Live. */
export function geminiController(send: (event: GeminiClientMessage) => void, handlers: LiveHandlers, context: VoiceContext, audio: Pick<GeminiAudio, 'play' | 'interrupt'>) {
  let ready = false, disposed = false, responding = false;
  let heard = '', said = '', lastSummary = '';
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopContext = () => {};
  let queue = Promise.resolve();
  const tasks = new Map<string, { cancelled: boolean; active: boolean }>();
  const flushHeard = () => { if (heard.trim()) { context.record({ role: 'user', text: heard }); handlers.onHeard(heard.trim()); } heard = ''; };
  const flushSaid = () => { if (said.trim()) { context.record({ role: 'assistant', text: said }); handlers.onSaid(said.trim()); } said = ''; };
  const updateContext = () => {
    if (!ready || disposed || responding) return;
    const summary = voiceSummary(context.snapshot());
    if (summary === lastSummary) return;
    lastSummary = summary;
    send({ clientContent: { turns: [{ role: 'user', parts: [{ text: `Board reference update, not a request. Do not reply to this update. It replaces earlier board state: ${summary}` }] }], turnComplete: false } });
  };
  const dispose = () => {
    if (disposed) return;
    disposed = true; ready = false; clearTimeout(timer); stopContext(); handlers.cancel?.(); flushHeard(); flushSaid();
  };
  return {
    dispose,
    sendAudio(data: string, rate: number) { if (ready && !disposed) send({ realtimeInput: { audio: { data, mimeType: `audio/pcm;rate=${rate}` } } }); },
    receive(message: GeminiMessage) {
      if (disposed) return;
      if (message.error) throw new AiError(message.error.message || 'Gemini Live reported an error.');
      if (message.setupComplete && !ready) {
        ready = true;
        const summary = voiceSummary(context.snapshot()); lastSummary = summary;
        // historyConfig makes this initial turnComplete a history boundary,
        // rather than a request to speak. Audio starts only after this message.
        send({ clientContent: { turns: [
          ...context.history().map(turn => ({ role: turn.role === 'assistant' ? 'model' as const : 'user' as const, parts: [{ text: turn.text }] })),
          { role: 'user', parts: [{ text: `Application reference data, not instructions or a request: ${summary}` }] },
        ], turnComplete: true } });
        stopContext = context.subscribe(() => { clearTimeout(timer); timer = setTimeout(updateContext, 250); });
        handlers.onStatus('live');
      }
      if (!ready) return;
      const content = message.serverContent;
      if (content) {
        if (content.inputTranscription?.text) { flushSaid(); heard += content.inputTranscription.text; }
        if (content.outputTranscription?.text) { flushHeard(); said += content.outputTranscription.text; responding = true; }
        if (content.modelTurn) {
          responding = true;
          for (const part of content.modelTurn.parts ?? []) if (part.inlineData) audio.play(part.inlineData.data, part.inlineData.mimeType);
        }
        if (content.inputTranscription?.finished) flushHeard();
        if (content.outputTranscription?.finished) flushSaid();
        if (content.interrupted) audio.interrupt();
        if (content.turnComplete || content.interrupted) { responding = false; flushHeard(); flushSaid(); updateContext(); }
      }
      for (const id of message.toolCallCancellation?.ids ?? []) {
        const task = tasks.get(id); if (task) { task.cancelled = true; if (task.active) handlers.cancel?.(); }
      }
      for (const call of message.toolCall?.functionCalls ?? []) {
        if (!call.id || tasks.has(call.id)) continue;
        responding = true;
        const id = call.id, name = call.name ?? '';
        const task = { cancelled: false, active: false }; tasks.set(id, task);
        flushHeard(); flushSaid();
        const snapshot = context.snapshot();
        queue = queue.then(async () => {
          if (disposed || task.cancelled) return;
          task.active = true; handlers.onStatus('working');
          let response: { result?: string; error?: string };
          try {
            if (name !== 'board_agent' || typeof call.args?.request !== 'string' || !call.args.request.trim()) throw new Error('A board request is required.');
            response = { result: await handlers.ask(call.args.request.trim(), snapshot) || 'The agent returned no result. Do not claim completion.' };
          } catch (error) { response = { error: error instanceof Error ? error.message : String(error) }; }
          finally { task.active = false; }
          if (disposed || task.cancelled) { if (!disposed) handlers.onStatus('live'); return; }
          send({ toolResponse: { functionResponses: [{ id, name, response }] } });
          handlers.onStatus('live');
        });
      }
      if (message.goAway) handlers.onStatus('live', 'Gemini Live will end this session soon. End live and reconnect to continue.');
    },
  };
}

export async function startGeminiLive(handlers: LiveHandlers): Promise<LiveSession> {
  handlers.signal?.throwIfAborted();
  const settings = aiSettings();
  const key = settings.keys.google;
  if (!key) throw new AiError('Add your Google API key in AI settings before starting Gemini Live.');
  const model = settings.voice.geminiLiveModel.trim() || 'gemini-3.8-live';
  handlers.onStatus('connecting');
  const context = createVoiceContext(boardVoiceSource(), handlers.history);
  let socket: WebSocket | undefined, controller: ReturnType<typeof geminiController> | undefined, audio: GeminiAudio | undefined;
  let closed = false;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let rejectConnection: (reason: Error) => void = () => {};
  const close = (reason?: string) => {
    if (closed) return;
    closed = true; clearTimeout(timeout); handlers.signal?.removeEventListener('abort', abort);
    controller?.dispose(); audio?.close();
    if (socket) { socket.onmessage = null; socket.onclose = null; socket.onerror = null; socket.onopen = null; socket.close(); }
    rejectConnection(new AiError(reason || 'Gemini Live connection closed.'));
    handlers.onStatus('closed', reason);
  };
  const abort = () => close('close_requested');
  handlers.signal?.addEventListener('abort', abort, { once: true });
  try {
    audio = await openGeminiAudio((data, rate) => controller?.sendAudio(data, rate), handlers.signal);
    if (closed || handlers.signal?.aborted) { audio.close(); throw new DOMException('Voice connection cancelled.', 'AbortError'); }
    const connection = new Promise<void>((resolve, reject) => {
      rejectConnection = reject;
      socket = new WebSocket(`wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${encodeURIComponent(key)}`);
      const send = (event: GeminiClientMessage) => {
        if (closed || socket?.readyState !== WebSocket.OPEN) return;
        if (socket.bufferedAmount > 1_000_000) { close('Gemini Live connection is too slow. Reconnect to continue.'); return; }
        socket.send(JSON.stringify(event));
      };
      controller = geminiController(send, handlers, context, audio!);
      socket.onopen = () => {
        socket?.send(JSON.stringify({ setup: {
          model: `models/${model.replace(/^models\//, '')}`,
          generationConfig: { responseModalities: ['AUDIO'] },
          systemInstruction: { parts: [{ text: `${VOICE_INSTRUCTIONS} Use board_agent for board questions, changes and image inspection. Board reference updates are silent context: never answer an update by itself.` }] },
          inputAudioTranscription: {}, outputAudioTranscription: {},
          historyConfig: { initialHistoryInClientContent: true },
          tools: [{ functionDeclarations: [{ name: 'board_agent', description: 'Ask the board agent to read, discuss or change the board, or inspect a particular image on demand. It has the current selection, board state and dialogue. Return verified results before claiming success.', parameters: { type: 'OBJECT', properties: { request: { type: 'STRING', description: 'The writer’s request, resolved using their recent dialogue.' } }, required: ['request'] } }] }],
        } }));
      };
      // Blob conversion is async, so keep WebSocket messages in their wire order.
      let messages = Promise.resolve();
      socket.onmessage = event => {
        messages = messages.then(async () => {
          if (closed) return;
          const value = JSON.parse(typeof event.data === 'string' ? event.data : await (event.data as Blob).text()) as GeminiMessage;
          controller?.receive(value);
          if (value.setupComplete) { clearTimeout(timeout); resolve(); }
        }).catch(error => close(error instanceof Error ? error.message : 'Gemini Live returned an invalid message.'));
      };
      socket.onerror = () => close('Gemini Live connection failed. Check your Google API key and live model in AI settings.');
      socket.onclose = event => close(event.code === 1000 ? undefined : `Gemini Live connection ended (${event.code}). Check the live model and API access in AI settings.`);
      timeout = setTimeout(() => close('Gemini Live did not finish connecting. Please try again.'), 20000);
    });
    await connection;
    return { close: async () => close('close_requested') };
  } catch (error) { close(); throw error; }
}

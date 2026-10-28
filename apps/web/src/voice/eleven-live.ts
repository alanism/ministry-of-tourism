import { AiError } from '../ai/providers';
import { aiSettings } from '../ai/settings';
import { boardVoiceSource } from './board-context';
import { createVoiceContext, voiceSummary, type VoiceContext } from './context';
import { elevenSignedUrl } from './eleven-agent';
import { openGeminiAudio as openPcmAudio, type GeminiAudio } from './gemini-audio';
import type { LiveHandlers, LiveSession } from './live';

export interface ElevenClientMessage {
  type?: string; text?: string; event_id?: number; user_audio_chunk?: string;
  tool_call_id?: string; result?: string; is_error?: boolean;
  dynamic_variables?: { board_context: string };
}
interface ElevenMessage {
  type: string;
  conversation_initiation_metadata_event?: { user_input_audio_format: string; agent_output_audio_format: string };
  user_transcription_event?: { user_transcript: string };
  agent_response_event?: { agent_response: string };
  agent_response_correction_event?: { original_agent_response: string; corrected_agent_response: string };
  audio_event?: { audio_base_64: string; event_id: number };
  interruption_event?: { event_id?: number };
  ping_event?: { event_id: number };
  client_tool_call?: { tool_call_id: string; tool_name: string; parameters?: { request?: unknown } };
  client_error?: { message?: string }; message?: string; error?: string;
}

/** The protocol changes; context, agent permissions and lazy image inspection do not. */
export function elevenController(send: (event: ElevenClientMessage) => void, handlers: LiveHandlers, context: VoiceContext, audio: Pick<GeminiAudio, 'play' | 'interrupt'>) {
  let ready = false, disposed = false, outputRate = 24000, lastSummary = '', interruptedId = -1, generation = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopContext = () => {};
  let queue = Promise.resolve();
  const seen = new Set<string>();
  const updateContext = () => {
    if (!ready || disposed) return;
    const summary = voiceSummary(context.snapshot());
    if (summary === lastSummary) return;
    lastSummary = summary;
    send({ type: 'contextual_update', text: `Board reference update, not a request. This replaces earlier board state: ${summary}` });
  };
  return {
    initiation: (): ElevenClientMessage => ({ type: 'conversation_initiation_client_data', dynamic_variables: { board_context: JSON.stringify({ board: JSON.parse(voiceSummary(context.snapshot())), conversation: context.history() }) } }),
    dispose() { if (disposed) return; disposed = true; ready = false; clearTimeout(timer); stopContext(); handlers.cancel?.(); },
    sendAudio(data: string, rate: number) {
      if (!ready || disposed) return;
      if (rate !== 16000) throw new AiError('ElevenLabs needs pcm_16000 microphone audio. This browser returned a different sample rate.');
      send({ user_audio_chunk: data });
    },
    receive(message: ElevenMessage) {
      if (disposed) return;
      if (message.type === 'client_error' || message.type === 'error') throw new AiError(message.client_error?.message || message.message || message.error || 'ElevenLabs reported a conversation error.');
      if (message.type === 'ping' && message.ping_event) send({ type: 'pong', event_id: message.ping_event.event_id });
      if (message.type === 'conversation_initiation_metadata' && !ready) {
        const metadata = message.conversation_initiation_metadata_event;
        if (metadata?.user_input_audio_format !== 'pcm_16000') throw new AiError('Configure the ElevenLabs agent input as pcm_16000 in its audio settings.');
        const format = /^pcm_(16000|22050|24000|44100|48000)$/.exec(metadata.agent_output_audio_format);
        if (!format) throw new AiError('Configure the ElevenLabs agent output as PCM audio in its audio settings.');
        outputRate = Number(format[1]); ready = true; updateContext();
        stopContext = context.subscribe(() => { clearTimeout(timer); timer = setTimeout(updateContext, 250); });
        handlers.onStatus('live');
      }
      if (!ready) return;
      if (message.type === 'user_transcript' && message.user_transcription_event) {
        const text = message.user_transcription_event.user_transcript;
        context.record({ role: 'user', text }); handlers.onHeard(text);
      }
      if (message.type === 'agent_response' && message.agent_response_event) {
        const text = message.agent_response_event.agent_response;
        context.record({ role: 'assistant', text }); handlers.onSaid(text);
      }
      if (message.type === 'agent_response_correction' && message.agent_response_correction_event) {
        const { original_agent_response: original, corrected_agent_response: corrected } = message.agent_response_correction_event;
        context.correctAssistant(original, corrected); handlers.onCorrected?.(original, corrected);
      }
      if (message.type === 'interruption') {
        interruptedId = Math.max(interruptedId, message.interruption_event?.event_id ?? -1);
        generation++; audio.interrupt(); handlers.cancel?.(); handlers.onStatus('live');
      }
      if (message.type === 'audio' && message.audio_event && message.audio_event.event_id > interruptedId) audio.play(message.audio_event.audio_base_64, `audio/pcm;rate=${outputRate}`);
      if (message.type === 'client_tool_call' && message.client_tool_call) {
        const call = message.client_tool_call;
        if (!call.tool_call_id || seen.has(call.tool_call_id)) return;
        seen.add(call.tool_call_id);
        const snapshot = context.snapshot(), turn = generation;
        queue = queue.then(async () => {
          if (disposed || turn !== generation) return;
          handlers.onStatus('working');
          let result: string, is_error = false;
          try {
            if (call.tool_name !== 'board_agent' || typeof call.parameters?.request !== 'string' || !call.parameters.request.trim()) throw new Error('A board_agent request is required.');
            result = await handlers.ask(call.parameters.request.trim(), snapshot) || 'The agent returned no result. Do not claim completion.';
          } catch (error) { result = error instanceof Error ? error.message : String(error); is_error = true; }
          if (disposed || turn !== generation) return;
          send({ type: 'client_tool_result', tool_call_id: call.tool_call_id, result, is_error }); handlers.onStatus('live');
        });
      }
    },
  };
}

export async function startElevenLive(handlers: LiveHandlers): Promise<LiveSession> {
  handlers.signal?.throwIfAborted();
  const settings = aiSettings(), key = settings.keys.elevenlabs, agentId = settings.voice.elevenAgentId.trim();
  if (!key) throw new AiError('Add your ElevenLabs API key in AI settings before starting live voice.');
  if (!agentId) throw new AiError('Create or enter your ElevenLabs voice agent in AI settings first.');
  handlers.onStatus('connecting');
  const context = createVoiceContext(boardVoiceSource(), handlers.history);
  const connectionAbort = new AbortController();
  let audio: GeminiAudio | undefined, socket: WebSocket | undefined, controller: ReturnType<typeof elevenController> | undefined;
  let closed = false, timeout: ReturnType<typeof setTimeout> | undefined;
  let rejectConnection: (error: Error) => void = () => {};
  const close = (reason?: string) => {
    if (closed) return;
    closed = true; clearTimeout(timeout); connectionAbort.abort(); handlers.signal?.removeEventListener('abort', abort);
    controller?.dispose(); audio?.close();
    if (socket) { socket.onmessage = null; socket.onclose = null; socket.onerror = null; socket.onopen = null; socket.close(); }
    rejectConnection(new AiError(reason || 'ElevenLabs connection closed.')); handlers.onStatus('closed', reason);
  };
  const abort = () => close('close_requested');
  handlers.signal?.addEventListener('abort', abort, { once: true });
  timeout = setTimeout(() => close('ElevenLabs did not finish connecting. Check your key and agent ID, then try again.'), 20000);
  try {
    // Resume audio from the writer's click before awaiting the signing request.
    audio = await openPcmAudio((data, rate) => { try { controller?.sendAudio(data, rate); } catch (error) { close(error instanceof Error ? error.message : 'Audio capture failed.'); } }, connectionAbort.signal);
    const url = await elevenSignedUrl(key, agentId, connectionAbort.signal);
    if (closed) throw new DOMException('Voice connection cancelled.', 'AbortError');
    await new Promise<void>((resolve, reject) => {
      rejectConnection = reject; socket = new WebSocket(url);
      const send = (event: ElevenClientMessage) => {
        if (closed || socket?.readyState !== WebSocket.OPEN) return;
        if (socket.bufferedAmount > 1_000_000) { close('ElevenLabs connection is too slow. Reconnect to continue.'); return; }
        try { socket.send(JSON.stringify(event)); } catch { close('ElevenLabs connection failed. Reconnect to continue.'); }
      };
      controller = elevenController(send, handlers, context, audio!);
      socket.onopen = () => send(controller!.initiation());
      let messages = Promise.resolve();
      socket.onmessage = event => {
        messages = messages.then(async () => {
          if (closed) return;
          const value = JSON.parse(typeof event.data === 'string' ? event.data : await (event.data as Blob).text()) as ElevenMessage;
          controller?.receive(value);
          if (value.type === 'conversation_initiation_metadata') { clearTimeout(timeout); resolve(); }
        }).catch(error => close(error instanceof Error ? error.message : 'ElevenLabs returned an invalid message.'));
      };
      socket.onerror = () => close('ElevenLabs connection failed. Check your API key and voice agent in AI settings.');
      socket.onclose = event => close(event.code === 1000 ? undefined : `ElevenLabs connection ended (${event.code}). Check your agent configuration and API access.`);
    });
    return { close: async () => close('close_requested') };
  } catch (error) { close(); throw error; }
}

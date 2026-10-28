// Listening and speaking. The writer picks who does each: this browser's own
// speech engine, OpenAI, or ElevenLabs, with their own key. Audio goes only to
// the provider they pick.
import { transcriptWords, type SpokenWord } from '@writers-board/core';
import { AiError } from '../ai/providers';
import { aiSettings, KEY_LABELS, VOICE_DEFAULTS, type KeyId } from '../ai/settings';

export interface Heard {
  text: string;
  /** Word timings, when the engine gives them (ElevenLabs, OpenAI whisper-1). */
  words: SpokenWord[];
  timed: boolean;
}

export interface Listening {
  /** Stop listening and get what was said. */
  stop(): Promise<Heard>;
  cancel(): void;
}

/** Lets tests and demos stand in for the microphone and speakers (development builds only). */
interface StandInSpeech {
  hear: () => Heard | string;
  speak?: (text: string) => void;
}
declare global {
  interface Window {
    __writersBoardStandInSpeech?: StandInSpeech;
    SpeechRecognition?: new () => BrowserRecognition;
    webkitSpeechRecognition?: new () => BrowserRecognition;
  }
}

interface BrowserRecognition {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

function standIn(): StandInSpeech | undefined {
  return import.meta.env.DEV ? window.__writersBoardStandInSpeech : undefined;
}

function keyFor(id: KeyId): string {
  const key = aiSettings().keys[id];
  if (!key) throw new AiError(`Add your ${KEY_LABELS[id].label} key in AI settings first.`);
  return key;
}

const plain = (text: string, timed = false, words?: SpokenWord[]): Heard => ({ text, words: words ?? transcriptWords(text), timed });

export function canListen(): boolean {
  if (standIn()) return true;
  if (aiSettings().voice.listen === 'browser') return Boolean(window.SpeechRecognition ?? window.webkitSpeechRecognition);
  return Boolean(navigator.mediaDevices && 'MediaRecorder' in window);
}

/**
 * Starts listening. `onPartial` gets the words so far when the engine streams
 * them (the browser engine does; recorded audio is transcribed on stop).
 */
export async function startListening(onPartial?: (text: string) => void): Promise<Listening> {
  const stand = standIn();
  if (stand) {
    return {
      stop: async () => {
        const heard = stand.hear();
        return typeof heard === 'string' ? plain(heard) : heard;
      },
      cancel: () => {},
    };
  }
  const { listen } = aiSettings().voice;
  return listen === 'browser' ? browserListening(onPartial) : recordedListening();
}

function browserListening(onPartial?: (text: string) => void): Listening {
  const Recognition = window.SpeechRecognition ?? window.webkitSpeechRecognition;
  if (!Recognition) throw new AiError('This browser has no speech recognition. Pick OpenAI or ElevenLabs for listening in AI settings.');
  const recognition = new Recognition();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = navigator.language || 'en-US';
  const finals: string[] = [];
  let interim = '';
  let failure = '';
  let ended: () => void = () => {};
  const done = new Promise<void>((resolve) => (ended = resolve));
  recognition.onresult = (event) => {
    interim = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i]!;
      if (result.isFinal) finals[i] = result[0]!.transcript;
      else interim += result[0]!.transcript;
    }
    onPartial?.([...finals.filter(Boolean), interim].join(' ').replace(/\s+/g, ' ').trim());
  };
  recognition.onerror = (event) => {
    if (event.error !== 'no-speech' && event.error !== 'aborted') failure = event.error;
  };
  recognition.onend = () => ended();
  recognition.start();
  return {
    async stop() {
      recognition.stop();
      await done;
      if (failure) throw new AiError(failure === 'not-allowed' ? 'The microphone is blocked for this page.' : `Speech recognition failed: ${failure}`);
      return plain([...finals.filter(Boolean), interim].join(' ').replace(/\s+/g, ' ').trim());
    },
    cancel: () => recognition.abort(),
  };
}

async function recordedListening(): Promise<Listening> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true }).catch(() => {
    throw new AiError('The microphone is blocked for this page.');
  });
  const recorder = new MediaRecorder(stream);
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const stopped = new Promise<void>((resolve) => (recorder.onstop = () => resolve()));
  recorder.start();
  const release = () => stream.getTracks().forEach((t) => t.stop());
  return {
    async stop() {
      recorder.stop();
      await stopped;
      release();
      return transcribe(new Blob(chunks, { type: recorder.mimeType || 'audio/webm' }));
    },
    cancel() {
      recorder.stop();
      release();
    },
  };
}

/** Sends recorded audio to the writer's chosen transcriber. */
export async function transcribe(audio: Blob): Promise<Heard> {
  const voice = aiSettings().voice;
  const engine = voice.listen === 'browser' ? 'openai' : voice.listen;
  const model = voice.listenModel.trim() || VOICE_DEFAULTS[engine].listenModel;
  const form = new FormData();
  const file = new File([audio], `speech.${audio.type.includes('mp4') ? 'mp4' : audio.type.includes('ogg') ? 'ogg' : 'webm'}`, { type: audio.type });

  if (engine === 'elevenlabs') {
    form.append('model_id', model);
    form.append('file', file);
    const response = await fetch('https://api.elevenlabs.io/v1/speech-to-text', { method: 'POST', headers: { 'xi-api-key': keyFor('elevenlabs') }, body: form });
    if (!response.ok) throw new AiError(`ElevenLabs error ${response.status}: ${(await response.text().catch(() => '')).slice(0, 200)}`);
    const data = (await response.json()) as { text: string; words?: { text: string; start: number; end: number; type: string }[] };
    const words = (data.words ?? []).filter((w) => w.type === 'word').map((w) => ({ text: w.text, start: w.start, end: w.end }));
    return words.length ? plain(data.text, true, words) : plain(data.text);
  }

  form.append('model', model);
  form.append('file', file);
  const timed = model === 'whisper-1';
  if (timed) {
    form.append('response_format', 'verbose_json');
    form.append('timestamp_granularities[]', 'word');
  }
  const response = await fetch('https://api.openai.com/v1/audio/transcriptions', { method: 'POST', headers: { Authorization: `Bearer ${keyFor('openai')}` }, body: form });
  if (!response.ok) throw new AiError(`OpenAI error ${response.status}: ${(await response.text().catch(() => '')).slice(0, 200)}`);
  const data = (await response.json()) as { text: string; words?: { word: string; start: number; end: number }[] };
  if (timed && data.words?.length) return plain(data.text, true, data.words.map((w) => ({ text: w.word, start: w.start, end: w.end })));
  return plain(data.text);
}

export interface Speaking {
  done: Promise<void>;
  stop(): void;
}

/** Splits long text at sentence ends so each request stays within provider limits. */
export function speechChunks(text: string, max = 3000): string[] {
  const sentences = text.match(/[^.!?\n]+(?:[.!?]+["'”’)]*|\n+|$)/g) ?? [text];
  const chunks: string[] = [];
  let current = '';
  for (const sentence of sentences) {
    if (current && current.length + sentence.length > max) {
      chunks.push(current.trim());
      current = '';
    }
    for (let at = 0; at < sentence.length; at += max) current += sentence.slice(at, at + max);
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks.filter(Boolean);
}

/** Reads text aloud with the writer's chosen voice. */
export function speak(text: string): Speaking {
  const stand = standIn();
  if (stand) {
    stand.speak?.(text);
    return { done: Promise.resolve(), stop: () => {} };
  }
  const voice = aiSettings().voice;
  if (voice.speak === 'browser') {
    if (!('speechSynthesis' in window)) throw new AiError('This browser cannot read aloud. Pick OpenAI or ElevenLabs for speaking in AI settings.');
    speechSynthesis.cancel();
    const utterances = speechChunks(text, 400).map((chunk) => new SpeechSynthesisUtterance(chunk));
    const last = utterances[utterances.length - 1];
    const done = new Promise<void>((resolve) => {
      if (!last) return resolve();
      last.onend = () => resolve();
      for (const u of utterances) u.onerror = () => resolve();
    });
    for (const u of utterances) speechSynthesis.speak(u);
    return { done, stop: () => speechSynthesis.cancel() };
  }

  const engine = voice.speak;
  const defaults = VOICE_DEFAULTS[engine];
  const model = voice.speakModel.trim() || defaults.speakModel;
  const voiceId = voice.speakVoice.trim() || defaults.speakVoice;
  const abort = new AbortController();
  const audio = new Audio();
  let stopped = false;
  const playChunk = async (chunk: string) => {
    const response =
      engine === 'elevenlabs'
        ? await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`, {
            method: 'POST',
            signal: abort.signal,
            headers: { 'xi-api-key': keyFor('elevenlabs'), 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: chunk, model_id: model }),
          })
        : await fetch('https://api.openai.com/v1/audio/speech', {
            method: 'POST',
            signal: abort.signal,
            headers: { Authorization: `Bearer ${keyFor('openai')}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ model, voice: voiceId, input: chunk, response_format: 'mp3' }),
          });
    if (!response.ok) throw new AiError(`${KEY_LABELS[engine].label} error ${response.status}: ${(await response.text().catch(() => '')).slice(0, 200)}`);
    const url = URL.createObjectURL(await response.blob());
    audio.src = url;
    await new Promise<void>((resolve, reject) => {
      audio.onended = () => resolve();
      audio.onpause = () => resolve();
      audio.onerror = () => reject(new AiError('The audio could not be played.'));
      void audio.play().catch(reject);
    }).finally(() => URL.revokeObjectURL(url));
  };
  const done = (async () => {
    for (const chunk of speechChunks(text)) {
      if (stopped) return;
      await playChunk(chunk);
    }
  })().catch((error) => {
    if (abort.signal.aborted) return;
    throw error;
  });
  return {
    done,
    stop() {
      stopped = true;
      abort.abort();
      audio.pause();
    },
  };
}

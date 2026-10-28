// The writer's AI settings: their own keys and which model does which job.
// Stored only in this browser; keys go only to the provider the writer picks.
import { useSyncExternalStore } from 'react';

const API_PROVIDERS = {
  anthropic: { label: 'Anthropic', keyHint: 'sk-ant-…' },
  openai: { label: 'OpenAI', keyHint: 'sk-…', baseUrl: 'https://api.openai.com/v1' },
  openrouter: { label: 'OpenRouter', keyHint: 'sk-or-…', baseUrl: 'https://openrouter.ai/api/v1' },
  google: { label: 'Google', keyHint: 'AIza…', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai' },
  xai: { label: 'xAI', keyHint: 'xai-…', baseUrl: 'https://api.x.ai/v1' },
} as const;
export const PROVIDERS = { ...API_PROVIDERS, chatgpt: { label: 'ChatGPT plan' } } as const;
export type ProviderId = keyof typeof PROVIDERS;

/** Voice-only providers: they have keys but don't do the text jobs. */
export const VOICE_PROVIDERS = {
  elevenlabs: { label: 'ElevenLabs', keyHint: 'sk_…' },
} as const;
export type KeyId = keyof typeof API_PROVIDERS | keyof typeof VOICE_PROVIDERS;
export const KEY_LABELS: Record<KeyId, { label: string; keyHint: string }> = { ...API_PROVIDERS, ...VOICE_PROVIDERS };

/** Who listens (speech to text) and who speaks (text to speech). */
export const SPEECH_ENGINES = { browser: 'This browser', openai: 'OpenAI', elevenlabs: 'ElevenLabs' } as const;
export type SpeechEngine = keyof typeof SPEECH_ENGINES;
export const LIVE_PROVIDERS = { openai: 'GPT-Live', google: 'Gemini Live', elevenlabs: 'ElevenLabs' } as const;
export type LiveProvider = keyof typeof LIVE_PROVIDERS;

export interface VoiceSettings {
  listen: SpeechEngine;
  /** Transcription model, for OpenAI or ElevenLabs. */
  listenModel: string;
  speak: SpeechEngine;
  speakModel: string;
  /** A voice name (OpenAI) or voice id (ElevenLabs). */
  speakVoice: string;
  liveProvider: LiveProvider;
  /** Provider models are remembered separately when switching for comparison. */
  liveModel: string;
  geminiLiveModel: string;
  elevenAgentId: string;
}

export const VOICE_DEFAULTS: Record<SpeechEngine, { listenModel: string; speakModel: string; speakVoice: string }> = {
  browser: { listenModel: '', speakModel: '', speakVoice: '' },
  openai: { listenModel: 'gpt-transcribe', speakModel: 'gpt-4o-mini-tts', speakVoice: 'marin' },
  elevenlabs: { listenModel: 'scribe_v2', speakModel: 'eleven_multilingual_v2', speakVoice: 'JBFqnCBsd6RMkjVDRZzb' },
};

export const JOBS = {
  reverse: 'Reverse Engineer',
  coach: 'Coaches',
  agent: 'Built-in agent',
} as const;
export type Job = keyof typeof JOBS;

export interface JobModel {
  provider: ProviderId;
  model: string;
}

/** Storyboard art, made through OpenRouter with the writer's key. */
export interface StoryboardSettings {
  model: string;
  /** The look for the whole board, added to every frame. */
  style: string;
  aspect: '4:3' | '16:9' | '1:1' | '3:4';
  faceForward: boolean;
}

export interface AiSettings {
  keys: Partial<Record<KeyId, string>>;
  jobs: Record<Job, JobModel>;
  voice: VoiceSettings;
  storyboard: StoryboardSettings;
}

const KEY = 'writers-board:ai';
const DEFAULTS: AiSettings = {
  keys: {},
  jobs: {
    reverse: { provider: 'anthropic', model: 'claude-opus-5-5' },
    coach: { provider: 'anthropic', model: 'claude-opus-5-5' },
    agent: { provider: 'anthropic', model: 'claude-opus-5-5' },
  },
  voice: { listen: 'browser', listenModel: '', speak: 'browser', speakModel: '', speakVoice: '', liveProvider: 'openai', liveModel: 'gpt-live-1', geminiLiveModel: 'gemini-3.8-live', elevenAgentId: '' },
  storyboard: { model: 'google/gemini-2.5-flash-image', style: '', aspect: '4:3', faceForward: true },
};

function load(): AiSettings {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (saved) return { keys: { ...saved.keys }, jobs: { ...DEFAULTS.jobs, ...saved.jobs }, voice: { ...DEFAULTS.voice, ...saved.voice }, storyboard: { ...DEFAULTS.storyboard, ...saved.storyboard } };
  } catch {
    // Unreadable or blocked storage: start from the defaults.
  }
  return structuredClone(DEFAULTS);
}

let settings = load();
const listeners = new Set<() => void>();

export function aiSettings(): AiSettings {
  return settings;
}

export function updateAiSettings(next: AiSettings) {
  settings = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Without storage the settings last until the page closes.
  }
  listeners.forEach((l) => l());
}

export function useAiSettings(): AiSettings {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => settings,
  );
}

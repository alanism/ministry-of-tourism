// AI settings: the writer's own keys, and which provider and model do each job.
import { useState } from 'react';
import { CHATGPT_USAGE_URL } from '../ai/chatgpt-connection';
import {
  JOBS,
  KEY_LABELS,
  PROVIDERS,
  SPEECH_ENGINES,
  VOICE_DEFAULTS,
  LIVE_PROVIDERS,
  aiSettings,
  updateAiSettings,
  useAiSettings,
  type Job,
  type KeyId,
  type ProviderId,
  type SpeechEngine,
  type VoiceSettings,
  type LiveProvider,
} from '../ai/settings';
import { useUi } from '../state/ui';
import { ChatGptConnection, type ChatGptConnectionState } from './ChatGptConnection';

export function SettingsDialog() {
  const settings = useAiSettings();
  const [chatGpt, setChatGpt] = useState<ChatGptConnectionState>({ models: [] });
  const [creatingVoice, setCreatingVoice] = useState(false);
  const [voiceError, setVoiceError] = useState('');
  const close = () => useUi.getState().setDialog(null);
  const voice = settings.voice;
  const setVoice = (patch: Partial<VoiceSettings>) => updateAiSettings({ ...settings, voice: { ...voice, ...patch } });
  const engines = Object.keys(SPEECH_ENGINES) as SpeechEngine[];
  const createVoiceAgent = async () => {
    setCreatingVoice(true); setVoiceError('');
    try {
      const { createElevenAgent } = await import('../voice/eleven-agent');
      const id = await createElevenAgent(aiSettings().keys.elevenlabs ?? '');
      const latest = aiSettings();
      updateAiSettings({ ...latest, voice: { ...latest.voice, elevenAgentId: id } });
    } catch (error) { setVoiceError(error instanceof Error ? error.message : String(error)); }
    finally { setCreatingVoice(false); }
  };

  return (
    <div className="dialog-backdrop" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <section className="dialog" role="dialog" aria-modal="true" aria-labelledby="ai-settings-title" onKeyDown={(e) => e.key === 'Escape' && close()}>
        <h2 id="ai-settings-title">AI settings</h2>
        <p className="dialog-note">Keys are saved in this browser and sent only to the provider you choose.</p>
        <ChatGptConnection value={chatGpt} onChange={setChatGpt} />
        <fieldset>
          <legend>Your keys</legend>
          {(Object.keys(KEY_LABELS) as KeyId[]).map((id) => (
            <label key={id} className="field">
              <span>{KEY_LABELS[id].label}</span>
              <input
                type="password"
                autoComplete="off"
                spellCheck={false}
                placeholder={KEY_LABELS[id].keyHint}
                value={settings.keys[id] ?? ''}
                onChange={(e) => updateAiSettings({ ...settings, keys: { ...settings.keys, [id]: e.target.value.trim() } })}
              />
            </label>
          ))}
        </fieldset>
        <fieldset>
          <legend>Models</legend>
          {(Object.keys(JOBS) as Job[]).map((job) => (
            <div key={job} className="field job">
              <span>{JOBS[job]}</span>
              <select
                aria-label={`${JOBS[job]} provider`}
                value={settings.jobs[job].provider}
                onChange={(e) => {
                  const provider = e.target.value as ProviderId;
                  const previous = settings.jobs[job].model;
                  const model = provider === 'chatgpt' && !chatGpt.models.some((available) => available.slug === previous) ? chatGpt.models[0]?.slug ?? '' : previous;
                  updateAiSettings({ ...settings, jobs: { ...settings.jobs, [job]: { provider, model } } });
                }}
              >
                {(Object.keys(PROVIDERS) as ProviderId[]).map((id) => (
                  <option key={id} value={id}>
                    {PROVIDERS[id].label}
                  </option>
                ))}
              </select>
              {settings.jobs[job].provider === 'chatgpt' ? (
                <select
                  aria-label={`${JOBS[job]} model`}
                  disabled={!chatGpt.session?.planEnabled || !chatGpt.models.length}
                  value={chatGpt.models.some((available) => available.slug === settings.jobs[job].model) ? settings.jobs[job].model : ''}
                  onChange={(e) => updateAiSettings({ ...settings, jobs: { ...settings.jobs, [job]: { ...settings.jobs[job], model: e.target.value } } })}
                >
                  <option value="" disabled>{chatGpt.models.length ? 'Select a model' : 'Connect and refresh models'}</option>
                  {chatGpt.models.map((available) => <option key={available.slug} value={available.slug}>{available.display_name}</option>)}
                </select>
              ) : <input
                aria-label={`${JOBS[job]} model`}
                placeholder="Model id"
                value={settings.jobs[job].model}
                onChange={(e) => updateAiSettings({ ...settings, jobs: { ...settings.jobs, [job]: { ...settings.jobs[job], model: e.target.value } } })}
              />}
            </div>
          ))}
          {Object.values(settings.jobs).some((job) => job.provider === 'chatgpt') ? <p className="hint">Using ChatGPT plan for the selected jobs · <a href={CHATGPT_USAGE_URL} target="_blank" rel="noreferrer">Manage usage</a></p> : null}
        </fieldset>
        <fieldset>
          <legend>Voice</legend>
          <div className="field job">
            <span>Listening</span>
            <select aria-label="Listening engine" value={voice.listen} onChange={(e) => setVoice({ listen: e.target.value as SpeechEngine, listenModel: '' })}>
              {engines.map((id) => (
                <option key={id} value={id}>
                  {SPEECH_ENGINES[id]}
                </option>
              ))}
            </select>
            <input
              aria-label="Listening model"
              disabled={voice.listen === 'browser'}
              placeholder={VOICE_DEFAULTS[voice.listen].listenModel || 'Built in'}
              value={voice.listenModel}
              onChange={(e) => setVoice({ listenModel: e.target.value })}
            />
          </div>
          <div className="field job">
            <span>Speaking</span>
            <select aria-label="Speaking engine" value={voice.speak} onChange={(e) => setVoice({ speak: e.target.value as SpeechEngine, speakModel: '', speakVoice: '' })}>
              {engines.map((id) => (
                <option key={id} value={id}>
                  {SPEECH_ENGINES[id]}
                </option>
              ))}
            </select>
            <input
              aria-label="Speaking model"
              disabled={voice.speak === 'browser'}
              placeholder={VOICE_DEFAULTS[voice.speak].speakModel || 'Built in'}
              value={voice.speakModel}
              onChange={(e) => setVoice({ speakModel: e.target.value })}
            />
            <input
              aria-label="Voice"
              disabled={voice.speak === 'browser'}
              placeholder={VOICE_DEFAULTS[voice.speak].speakVoice ? `Voice: ${VOICE_DEFAULTS[voice.speak].speakVoice}` : 'Voice'}
              value={voice.speakVoice}
              onChange={(e) => setVoice({ speakVoice: e.target.value })}
            />
          </div>
          <div className="field job">
            <span>Live conversation</span>
            <select aria-label="Live voice provider" value={voice.liveProvider} onChange={(e) => setVoice({ liveProvider: e.target.value as LiveProvider })}>
              {(Object.keys(LIVE_PROVIDERS) as LiveProvider[]).map(id => <option key={id} value={id}>{LIVE_PROVIDERS[id]}</option>)}
            </select>
            {voice.liveProvider === 'elevenlabs' ? (
              <input aria-label="ElevenLabs agent ID" placeholder="Agent ID" value={voice.elevenAgentId} disabled={creatingVoice} onChange={e => setVoice({ elevenAgentId: e.target.value.trim() })} />
            ) : <input aria-label="Live model" placeholder={voice.liveProvider === 'google' ? 'gemini-3.8-live' : 'gpt-live-1'} value={voice.liveProvider === 'google' ? voice.geminiLiveModel : voice.liveModel} onChange={(e) => setVoice(voice.liveProvider === 'google' ? { geminiLiveModel: e.target.value } : { liveModel: e.target.value })} />}
          </div>
          {voice.liveProvider === 'elevenlabs' ? <>
            <p className="hint">Create a private voice agent in your ElevenLabs account once. It uses the same board context and writing rules. Change its voice and model in <a href="https://elevenlabs.io/app/agents" target="_blank" rel="noreferrer">ElevenLabs</a>.</p>
            {!voice.elevenAgentId && <button disabled={creatingVoice || !settings.keys.elevenlabs} onClick={() => void createVoiceAgent()}>{creatingVoice ? 'Creating voice agent…' : 'Create voice agent'}</button>}
            {voiceError && <p role="alert" className="dialog-error">{voiceError}</p>}
          </> : null}
        </fieldset>
        <div className="dialog-actions">
          <button className="primary" onClick={close}>
            Done
          </button>
        </div>
      </section>
    </div>
  );
}

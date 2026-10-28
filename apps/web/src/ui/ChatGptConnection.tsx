import { useCallback, useEffect, useState } from 'react';
import { CHATGPT_USAGE_URL, chatGptModels, chatGptSession, chatGptSignInUrl, disconnectChatGpt, type ChatGptModel, type ChatGptSession } from '../ai/chatgpt-connection';

export interface ChatGptConnectionState {
  session?: ChatGptSession;
  models: ChatGptModel[];
}

const WELCOME_KEY = 'writers-board:chatgpt-welcome:v1';
function welcomeAcknowledged(): boolean {
  try { return localStorage.getItem(WELCOME_KEY) === 'true'; } catch { return false; }
}

export function ChatGptConnection({ value, onChange }: { value: ChatGptConnectionState; onChange: (value: ChatGptConnectionState) => void }) {
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState(() => new URLSearchParams(window.location.search).get('chatgpt') === 'error' ? 'ChatGPT sign-in could not be completed. Please try again.' : '');
  const [notice, setNotice] = useState('');
  const [acknowledged, setAcknowledged] = useState(welcomeAcknowledged);
  const session = value.session;
  const showWelcome = session?.connected && session.planEnabled && !acknowledged;

  const refresh = useCallback(async (clearError = true) => {
    setBusy(true);
    if (clearError) setError('');
    let current: ChatGptSession;
    try {
      current = await chatGptSession();
      onChange({ session: current, models: [] });
    } catch (failure) {
      onChange({ models: [] });
      setError(failure instanceof Error ? failure.message : 'Could not check the ChatGPT connection. Try again.');
      setBusy(false);
      return;
    }
    if (current.connected && current.planEnabled) {
      try {
        const models = await chatGptModels();
        onChange({ session: current, models });
      } catch (failure) {
        setError(failure instanceof Error ? failure.message : 'Could not load ChatGPT models. Refresh to try again.');
      }
    }
    setBusy(false);
  }, [onChange]);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.has('chatgpt')) {
      url.searchParams.delete('chatgpt');
      window.history.replaceState(window.history.state, '', url);
    }
    void refresh(false);
  }, [refresh]);

  const acknowledge = () => {
    try { localStorage.setItem(WELCOME_KEY, 'true'); } catch { /* Keep the acknowledgement for this visit. */ }
    setAcknowledged(true);
  };

  const disconnect = async () => {
    setBusy(true);
    setError('');
    try {
      const result = await disconnectChatGpt();
      onChange({ session: { connected: false, planEnabled: false }, models: [] });
      setNotice(result.warning ?? 'ChatGPT disconnected from this browser.');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not disconnect ChatGPT. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <fieldset>
      <legend>ChatGPT account</legend>
      <p className="dialog-note">Use your ChatGPT plan for Reverse Engineer, coaching, and writing. Choose ChatGPT plan for each job below. Voice and storyboard images use their existing connections.</p>
      <p role="status">
        {busy ? 'Checking ChatGPT connection…' : session?.connected ? (
          <>Connected{session.account?.name || session.account?.email ? ` as ${session.account.name || session.account.email}` : ''}. {session.planEnabled ? 'ChatGPT plan usage enabled.' : 'Signed in; ChatGPT plan usage is disabled. Sign in again to grant plan permission.'}</>
        ) : 'ChatGPT is not connected.'}
      </p>
      {error ? <p className="dialog-error" role="alert">{error}</p> : null}
      {notice ? <p className="dialog-note" role="status">{notice}</p> : null}
      <div className="dialog-actions" style={{ flexWrap: 'wrap', justifyContent: 'flex-start' }}>
        {!session?.connected || !session.planEnabled ? (
          <button type="button" className="primary" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }} disabled={busy} onClick={() => window.location.assign(chatGptSignInUrl(session))}>
            <img src="/chatgpt-logo.svg" alt="" aria-hidden="true" width={20} height={20} />
            Continue with ChatGPT
          </button>
        ) : null}
        <button type="button" disabled={busy} onClick={() => void refresh()}>{session?.connected && session.planEnabled ? 'Refresh models' : 'Refresh connection'}</button>
        {session?.connected ? <button type="button" disabled={busy} onClick={() => void disconnect()}>Disconnect</button> : null}
      </div>
      <p className="hint"><a href={CHATGPT_USAGE_URL} target="_blank" rel="noreferrer">Manage usage</a> in ChatGPT, including this app’s limits. We never switch to a paid API connection automatically.</p>
      {showWelcome ? (
        <div className="dialog-backdrop" onMouseDown={(event) => event.stopPropagation()} onKeyDown={(event) => { event.stopPropagation(); if (event.key === 'Escape') acknowledge(); }}>
          <section className="dialog" role="dialog" aria-modal="true" aria-labelledby="chatgpt-welcome-title">
            <h2 id="chatgpt-welcome-title">Your ChatGPT plan is connected</h2>
            <p>Eligible writing requests use your ChatGPT plan or credits when you select ChatGPT plan for that job. Review usage and set limits in <a href={CHATGPT_USAGE_URL} target="_blank" rel="noreferrer">ChatGPT settings</a>.</p>
            <div className="dialog-actions"><button type="button" className="primary" autoFocus onClick={acknowledge}>Got it</button></div>
          </section>
        </div>
      ) : null}
    </fieldset>
  );
}

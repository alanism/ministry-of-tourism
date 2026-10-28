// The Agent tab: choose how much agents may do, talk to the built-in agent,
// watch what it does, stop it, and undo its last run.
import { useEffect, useRef, useState } from 'react';
import { AGENT_MODES, type AgentMode, type BoardView } from '@writers-board/core';
import { BUILT_IN_AGENT, startAgent, type AgentEvent } from '../ai/agent';
import { boardSession, run } from '../state/board';
import { startLive, type LiveSession } from '../voice/live';
import { speak, startListening, type Listening, type Speaking } from '../voice/speech';
import { ChatGptUsage } from './ChatGptUsage';
import type { VoiceSnapshot } from '../voice/context';
import { LIVE_PROVIDERS, updateAiSettings, useAiSettings, type LiveProvider } from '../ai/settings';

const MODE_LABELS: Record<AgentMode, string> = { solo: 'Solo', together: 'Together', autopilot: 'Autopilot' };
const MODE_HINTS: Record<AgentMode, string> = {
  solo: 'Agents can read the board, nothing more.',
  together: 'Agents work beside you and stop after each request.',
  autopilot: 'An agent keeps going until done. Press Esc or click the board to take the wheel.',
};

interface Line {
  who: 'you' | 'agent' | 'tool' | 'note';
  text: string;
}

export function AgentTab({ board }: { board: BoardView }) {
  const settings = useAiSettings();
  const [lines, setLines] = useState<Line[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const conversation = useRef(startAgent());
  const abort = useRef<AbortController | null>(null);
  const log = useRef<HTMLDivElement>(null);

  useEffect(() => {
    log.current?.scrollTo({ top: log.current.scrollHeight });
  }, [lines]);

  // In Autopilot, any key Esc or press on the board takes the wheel back.
  useEffect(() => {
    if (!busy || board.agentMode !== 'autopilot') return;
    const stop = () => abort.current?.abort();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && stop();
    const onPress = (e: PointerEvent) => (e.target as HTMLElement).closest('.board-canvas') && stop();
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onPress);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onPress);
    };
  }, [busy, board.agentMode]);

  /** Sends one request to the agent and resolves to what it said back. */
  const ask = async (text: string, shown = true, context?: VoiceSnapshot): Promise<string> => {
    if (shown) setLines((l) => [...l, { who: 'you', text }]);
    setBusy(true);
    abort.current = new AbortController();
    const replies: string[] = [];
    const onEvent = (event: AgentEvent) => {
      if (event.kind === 'text') {
        replies.push(event.text);
        setLines((l) => [...l, { who: 'agent', text: event.text }]);
      } else if (event.kind === 'tool') setLines((l) => [...l, { who: 'tool', text: event.text }]);
      else if (event.text) {
        replies.push(event.text);
        setLines((l) => [...l, { who: 'note', text: event.text }]);
      }
    };
    try {
      await conversation.current.ask(text, onEvent, abort.current.signal, context);
    } catch (error) {
      onEvent({ kind: 'error', text: error instanceof Error ? error.message : String(error) });
    } finally {
      setBusy(false);
    }
    return replies.join('\n');
  };

  const send = async () => {
    const text = input.trim();
    if (!text || busy) return;
    setInput('');
    await ask(text);
  };

  // Push to talk: say it, the agent does it, and its answer is read aloud.
  const [talk, setTalk] = useState<'idle' | 'listening' | 'hearing'>('idle');
  const listening = useRef<Listening | null>(null);
  const speaking = useRef<Speaking | null>(null);
  const note = (text: string) => setLines((l) => [...l, { who: 'note', text }]);
  const pushToTalk = async () => {
    try {
      if (talk === 'idle') {
        speaking.current?.stop();
        listening.current = await startListening();
        setTalk('listening');
        return;
      }
      if (talk !== 'listening') return;
      setTalk('hearing');
      const heard = await listening.current!.stop();
      listening.current = null;
      setTalk('idle');
      if (!heard.text.trim()) return note('Nothing was heard.');
      const reply = await ask(heard.text.trim());
      if (reply.trim()) {
        speaking.current = speak(reply);
        await speaking.current.done;
      }
    } catch (error) {
      listening.current = null;
      setTalk('idle');
      note(error instanceof Error ? error.message : String(error));
    }
  };

  // Live voice providers hand board work to the same agent and context.
  const live = useRef<LiveSession | null>(null);
  const liveStart = useRef<AbortController | null>(null);
  const [liveStatus, setLiveStatus] = useState<'off' | 'connecting' | 'live' | 'working'>('off');
  const toggleLive = async () => {
    if (live.current) {
      const session = live.current;
      live.current = null;
      await session.close();
      return;
    }
    if (liveStatus === 'connecting') return;
    try {
      liveStart.current = new AbortController();
      live.current = await startLive({
        signal: liveStart.current.signal,
        ask: (request, context) => ask(request, false, context),
        history: lines.flatMap(line => line.who === 'you' || line.who === 'agent' ? [{ role: line.who === 'you' ? 'user' as const : 'assistant' as const, text: line.text }] : []),
        cancel: () => abort.current?.abort(),
        onHeard: (text) => setLines((l) => [...l, { who: 'you', text }]),
        onSaid: (text) => setLines((l) => [...l, { who: 'agent', text }]),
        onCorrected: (original, corrected) => setLines(lines => {
          const index = lines.findLastIndex(line => line.who === 'agent' && line.text === original);
          return index < 0 ? lines : lines.flatMap((line, i) => i !== index ? [line] : corrected.trim() ? [{ ...line, text: corrected }] : []);
        }),
        onStatus: (status, detail) => {
          if (status === 'closed') {
            live.current = null;
            setLiveStatus('off');
            if (detail && detail !== 'close_requested') note(`Live conversation ended (${detail.replace(/_/g, ' ')}).`);
          } else {
            setLiveStatus(status);
            if (detail) note(detail);
          }
        },
      });
    } catch (error) {
      live.current = null;
      setLiveStatus('off');
      note(error instanceof Error ? error.message : String(error));
    }
  };

  useEffect(
    () => () => {
      listening.current?.cancel();
      speaking.current?.stop();
      liveStart.current?.abort();
      void live.current?.close();
    },
    [],
  );

  return (
    <section className="agent-tab" aria-label="Agent">
      <ChatGptUsage job="agent" />
      <div className="agent-modes" role="radiogroup" aria-label="How much agents may do">
        {AGENT_MODES.map((mode) => (
          <button key={mode} role="radio" aria-checked={board.agentMode === mode} onClick={() => run('settings_set_agent_mode', { mode })}>
            {MODE_LABELS[mode]}
          </button>
        ))}
      </div>
      <p className="hint">{MODE_HINTS[board.agentMode]}</p>
      <label className="agent-draft">
        <input type="checkbox" checked={board.draftForMe} onChange={(e) => run('settings_set_draft_for_me', { enabled: e.target.checked })} /> Draft for
        me (let agents write on cards and in the draft)
      </label>
      <div className="agent-log" ref={log} aria-live="polite">
        {lines.length === 0 && <p className="hint">Ask the agent to arrange cards, add guides, find gaps, or explain the board.</p>}
        {lines.map((line, i) => (
          <p key={i} className={`agent-line ${line.who}`}>
            {line.who === 'tool' ? `→ ${line.text}` : line.text}
          </p>
        ))}
      </div>
      <form
        className="agent-input"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <textarea
          rows={2}
          value={input}
          placeholder="Ask the agent…"
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
        />
        {busy ? (
          <button type="button" onClick={() => abort.current?.abort()}>
            Stop
          </button>
        ) : (
          <button type="submit" className="primary">
            Send
          </button>
        )}
      </form>
      <div className="agent-talk" aria-label="Talk to the board">
        <select aria-label="Live voice provider" value={settings.voice.liveProvider} disabled={liveStatus !== 'off' || talk !== 'idle'} onChange={(e) => updateAiSettings({ ...settings, voice: { ...settings.voice, liveProvider: e.target.value as LiveProvider } })}>
          {(Object.keys(LIVE_PROVIDERS) as LiveProvider[]).map(id => <option key={id} value={id}>{LIVE_PROVIDERS[id]}</option>)}
        </select>
        <button className={`mic-button ${talk === 'listening' ? 'listening' : ''}`} aria-pressed={talk === 'listening'} disabled={talk === 'hearing' || busy || liveStatus !== 'off'} onClick={() => void pushToTalk()}>
          <span className="mic-dot" aria-hidden="true" />
          {talk === 'listening' ? 'Done talking' : talk === 'hearing' ? 'Hearing…' : 'Talk'}
        </button>
        <button className={`mic-button ${liveStatus !== 'off' ? 'listening' : ''}`} aria-pressed={liveStatus !== 'off'} disabled={talk !== 'idle' || liveStatus === 'connecting'} onClick={() => void toggleLive()}>
          <span className="mic-dot" aria-hidden="true" />
          {liveStatus === 'off' ? `Live (${LIVE_PROVIDERS[settings.voice.liveProvider]})` : liveStatus === 'connecting' ? 'Connecting…' : liveStatus === 'working' ? 'Working… (end)' : 'End live'}
        </button>
      </div>
      <button className="agent-undo" disabled={busy || !boardSession().canUndo(BUILT_IN_AGENT.id)} onClick={() => boardSession().undo(BUILT_IN_AGENT.id)}>
        Undo the agent’s last run
      </button>
    </section>
  );
}

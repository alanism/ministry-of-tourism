// Typewriter mode: one line at a time. Finished lines roll up the platen and
// fade. Backspace works inside the current line; earlier lines stay put. A
// stricter "no backspace" setting is there for drafting without looking back.
// Under the platen sits the Enochian keyboard: tap its keys to type, or type
// on a real keyboard and watch them press.
import { useEffect, useRef, useState } from 'react';
import type { BoardView } from '@writers-board/core';
import { appendToDraft, endBurst, wordCount } from '../state/manuscript';
import { typewriterSounds } from './sounds';
import { joinDictation, MicButton } from '../voice/MicButton';
import { KeyboardDeck, pressKey, releaseKeys, type DeckHandlers } from './KeyboardDeck';
import { SOUNDS_KEY, Switch } from '../ui/Switch';

const BELL_AT = 62;
const WRAP_AT = 72;
const SHOWN_LINES = 14;

function useSetting(key: string, initial: boolean) {
  const [value, setValue] = useState(() => {
    try {
      const saved = localStorage.getItem(key);
      return saved === null ? initial : saved === 'true';
    } catch {
      return initial;
    }
  });
  const set = (next: boolean) => {
    setValue(next);
    try {
      localStorage.setItem(key, String(next));
    } catch {
      // Settings are only remembered when storage is available.
    }
  };
  return [value, set] as const;
}

function useStoredChoice<T extends string>(key: string, initial: T, allowed: readonly T[]) {
  const [value, setValue] = useState<T>(() => {
    try {
      const saved = localStorage.getItem(key) as T | null;
      return saved && allowed.includes(saved) ? saved : initial;
    } catch {
      return initial;
    }
  });
  const set = (next: T) => {
    setValue(next);
    try {
      localStorage.setItem(key, next);
    } catch {
      // Remembered only when storage is available.
    }
  };
  return [value, set] as const;
}

function formatTime(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

export function Typewriter({ board }: { board: BoardView }) {
  const text = board.manuscript;
  const [line, setLine] = useState('');
  const [strict, setStrict] = useSetting('writers-board:typewriter-strict', false);
  const [sounds, setSounds] = useSetting(SOUNDS_KEY, false);
  const [showKeys, setShowKeys] = useSetting('writers-board:typewriter-keys', true);
  const [finish, setFinish] = useStoredChoice('writers-board:typewriter-finish', 'ivory', ['ivory', 'obsidian'] as const);
  const [pageLight, setPageLight] = useState(80);
  const deck = useRef<HTMLElement | null>(null);
  const [goal, setGoal] = useState(500);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const startWords = useRef(wordCount(text));
  const input = useRef<HTMLInputElement>(null);
  const [heardError, setHeardError] = useState('');
  const latest = useRef({ text, line });
  latest.current = { text, line };

  useEffect(() => {
    input.current?.focus();
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      clearInterval(timer);
      // Leaving the typewriter keeps the line in progress.
      const { text: draft, line: open } = latest.current;
      if (open) commit(draft, open);
      endBurst();
    };
  }, []);

  function commit(draft: string, lineText: string) {
    const lead = draft && !draft.endsWith('\n') ? '\n' : '';
    appendToDraft(draft, `${lead}${lineText}\n`);
  }

  const carriageReturn = () => {
    commit(text, line);
    setLine('');
    if (sounds) typewriterSounds.carriageReturn();
  };

  const onChange = (value: string) => {
    // No backspace: on-screen keys can't take letters back either.
    if (strict && value.length < line.length) return;
    if (!startedAt) setStartedAt(Date.now());
    if (sounds && value.length > line.length) {
      typewriterSounds.key();
      if (line.length < BELL_AT && value.length >= BELL_AT) typewriterSounds.bell();
    }
    if (value.length > WRAP_AT) {
      // Past the right margin: return the carriage at the last space.
      const cut = value.lastIndexOf(' ', WRAP_AT);
      const at = cut > 0 ? cut : WRAP_AT;
      commit(text, value.slice(0, at));
      setLine(value.slice(at).trimStart());
      if (sounds) typewriterSounds.carriageReturn();
      return;
    }
    setLine(value);
  };

  // Dictation types onto the current line; full lines roll up as if typed.
  const dictate = (said: string) => {
    if (!startedAt) setStartedAt(Date.now());
    let value = joinDictation(line, said);
    const full: string[] = [];
    while (value.length > WRAP_AT) {
      const cut = value.lastIndexOf(' ', WRAP_AT);
      const at = cut > 0 ? cut : WRAP_AT;
      full.push(value.slice(0, at));
      value = value.slice(at).trimStart();
    }
    if (full.length) {
      const lead = text && !text.endsWith('\n') ? '\n' : '';
      appendToDraft(text, `${lead}${full.join('\n')}
`);
    }
    setLine(value);
    setHeardError('');
    input.current?.focus();
  };

  // The keyboard reads these when it needs them, so it never has to re-render.
  const handlers = useRef<DeckHandlers>(null!);
  handlers.current = {
    input: () => input.current,
    onEnter: carriageReturn,
    onParameter: (name, value) => (name === 'volume' ? typewriterSounds.setVolume(value) : setPageLight(value)),
    finish,
    onFinish: setFinish,
  };
  useEffect(() => {
    deck.current?.querySelectorAll<HTMLButtonElement>('.mk-key[data-code="Backspace"], .mk-key[data-code="Delete"]').forEach((key) => (key.disabled = strict));
  }, [strict, showKeys]);

  const lines = text.replace(/\n$/, '').split('\n');
  const recent = text ? lines.slice(-SHOWN_LINES) : [];
  const sessionWords = Math.max(0, wordCount(`${text} ${line}`) - startWords.current);
  const elapsed = startedAt ? Math.max(0, Math.floor((now - startedAt) / 1000)) : 0;

  return (
    <section className={`typewriter${showKeys ? ' with-keys' : ''}`} aria-label="Typewriter" style={{ ['--page-light' as string]: pageLight / 100 }}>
      <div className="typewriter-bar">
        <span>
          {sessionWords} / {goal} words · {formatTime(elapsed)}
        </span>
        <label>
          Goal{' '}
          <input type="number" min={50} step={50} value={goal} onChange={(e) => setGoal(Math.max(50, Number(e.target.value) || 50))} />
        </label>
        <Switch label="No backspace" checked={strict} onChange={setStrict} />
        <Switch label="Sounds" checked={sounds} onChange={setSounds} title="Typewriter, keyboard and board sounds" />
        <Switch label="Keyboard" checked={showKeys} onChange={setShowKeys} />
        <MicButton onText={dictate} onError={setHeardError} />
        {heardError && <span role="alert">{heardError}</span>}
      </div>
      <div className="typewriter-progress" style={{ ['--done' as string]: `${Math.min(100, (sessionWords / goal) * 100)}%` }} />
      <div className="typewriter-paper" onClick={() => input.current?.focus()}>
        <div className="typewriter-past" aria-label="Lines written">
          {recent.map((l, i) => (
            <p key={`${lines.length - recent.length + i}`}>{l || ' '}</p>
          ))}
        </div>
        <div className="typewriter-line">
          <input
            ref={input}
            value={line}
            aria-label="Current line"
            spellCheck={false}
            onChange={(e) => onChange(e.target.value)}
            onKeyUp={(e) => pressKey(deck.current, e.code, false)}
            onKeyDown={(e) => {
              pressKey(deck.current, e.code, true);
              if (e.key === 'Enter') {
                e.preventDefault();
                carriageReturn();
              } else if (strict && (e.key === 'Backspace' || e.key === 'Delete')) {
                e.preventDefault();
              }
            }}
            onBlur={() => {
              endBurst();
              releaseKeys(deck.current);
            }}
          />
          <span className="typewriter-margin" style={{ left: `${BELL_AT}ch` }} aria-hidden="true" />
        </div>
      </div>
      <div className="typewriter-platen" aria-hidden="true">
        <span />
        <span />
      </div>
      {showKeys && <KeyboardDeck handlers={handlers} rootRef={deck} />}
    </section>
  );
}

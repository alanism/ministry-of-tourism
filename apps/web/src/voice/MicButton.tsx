// Dictation: press to start, press again to stop. What the writer says comes
// back as their own words, through `onText`, wherever the button sits.
import { useEffect, useRef, useState } from 'react';
import { startListening, type Heard, type Listening } from './speech';

interface Props {
  onText: (text: string, heard: Heard) => void;
  onError?: (message: string) => void;
  /** Shown while listening, e.g. for live words from the browser engine. */
  onPartial?: (text: string) => void;
  label?: string;
  className?: string;
}

export function MicButton({ onText, onError, onPartial, label = 'Dictate', className = '' }: Props) {
  const [state, setState] = useState<'idle' | 'listening' | 'working'>('idle');
  const listening = useRef<Listening | null>(null);

  useEffect(() => () => listening.current?.cancel(), []);

  const toggle = async () => {
    try {
      if (state === 'idle') {
        listening.current = await startListening(onPartial);
        setState('listening');
      } else if (state === 'listening') {
        setState('working');
        const heard = await listening.current!.stop();
        listening.current = null;
        if (heard.text.trim()) onText(heard.text.trim(), heard);
        setState('idle');
      }
    } catch (error) {
      listening.current = null;
      setState('idle');
      onError?.(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <button
      type="button"
      className={`mic-button ${state} ${className}`}
      aria-pressed={state === 'listening'}
      aria-label={state === 'listening' ? 'Stop dictating' : label}
      title={state === 'listening' ? 'Stop and add what you said' : label}
      disabled={state === 'working'}
      // Keep focus (and the caret) in the text being dictated into.
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => void toggle()}
    >
      <span className="mic-dot" aria-hidden="true" />
      {state === 'listening' ? 'Stop' : state === 'working' ? 'Hearing…' : label}
    </button>
  );
}

/** Joins dictated words onto existing text with sensible spacing. */
export function joinDictation(before: string, said: string, after = ''): string {
  const lead = before && !/\s$/.test(before) ? ' ' : '';
  const trail = after && !/^\s/.test(after) ? ' ' : '';
  return `${before}${lead}${said}${trail}${after}`;
}

// The read-aloud test: read the draft (or any part of it) out loud, and the
// places you stumble are marked on the page: skipped words, repeats, fillers,
// changed words and long pauses. "Read it back" reads the draft (or the
// selected passage) to you instead.
import { useEffect, useRef, useState, type RefObject } from 'react';
import { alignReading, describeReading, type ReadingResult } from '@writers-board/core';
import { rangeFor, textOffset } from '../writing/textDom';
import { speak, startListening, type Listening, type Speaking } from './speech';

const KIND_LABELS = { skipped: 'Skipped', repeated: 'Repeated', filler: 'Filler', changed: 'Said differently', pause: 'Long pause' } as const;

interface Props {
  text: string;
  editor: RefObject<HTMLDivElement | null>;
  onMessage: (message: string) => void;
}

export function ReadAloud({ text, editor, onMessage }: Props) {
  const [test, setTest] = useState<'idle' | 'listening' | 'hearing'>('idle');
  const [result, setResult] = useState<{ reading: ReadingResult; text: string; timed: boolean } | null>(null);
  const [playing, setPlaying] = useState(false);
  const listening = useRef<Listening | null>(null);
  const speaking = useRef<Speaking | null>(null);

  useEffect(
    () => () => {
      listening.current?.cancel();
      speaking.current?.stop();
    },
    [],
  );

  // Marks stay only while the draft is as it was read; any edit clears them.
  const current = result && result.text === text ? result : null;
  useEffect(() => {
    const el = editor.current;
    if (!el || !('highlights' in CSS)) return;
    const ranges = (current?.reading.stumbles ?? []).filter((s) => s.end <= text.length).map((s) => rangeFor(el, s.start, s.end));
    CSS.highlights.set('stumble', new Highlight(...ranges));
    return () => void CSS.highlights.delete('stumble');
  }, [current, editor, text]);

  const runTest = async () => {
    try {
      if (test === 'idle') {
        setResult(null);
        listening.current = await startListening();
        setTest('listening');
        onMessage('Read aloud now. Press Done reading when you finish.');
        return;
      }
      if (test !== 'listening') return;
      setTest('hearing');
      const heard = await listening.current!.stop();
      listening.current = null;
      setTest('idle');
      if (!heard.text.trim()) return onMessage('Nothing was heard.');
      setResult({ reading: alignReading(text, heard.words, { partial: true }), text, timed: heard.timed });
    } catch (error) {
      listening.current = null;
      setTest('idle');
      onMessage(error instanceof Error ? error.message : String(error));
    }
  };

  const readBack = async () => {
    if (playing) {
      speaking.current?.stop();
      setPlaying(false);
      return;
    }
    // The selected passage, or the whole draft.
    const el = editor.current;
    const selection = window.getSelection();
    let passage = text;
    if (el && selection && !selection.isCollapsed && el.contains(selection.anchorNode)) {
      const range = selection.getRangeAt(0);
      passage = text.slice(textOffset(el, range.startContainer, range.startOffset), textOffset(el, range.endContainer, range.endOffset));
    }
    if (!passage.trim()) return onMessage('There is nothing to read yet.');
    try {
      setPlaying(true);
      speaking.current = speak(passage);
      await speaking.current.done;
    } catch (error) {
      onMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setPlaying(false);
    }
  };

  return (
    <>
      <button
        type="button"
        className={`mic-button ${test === 'listening' ? 'listening' : ''}`}
        aria-pressed={test === 'listening'}
        disabled={test === 'hearing' || !text.trim()}
        title="Read your draft aloud; stumbles are marked on the page"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => void runTest()}
      >
        <span className="mic-dot" aria-hidden="true" />
        {test === 'listening' ? 'Done reading' : test === 'hearing' ? 'Hearing…' : 'Read-aloud test'}
      </button>
      <button type="button" className="mic-button" aria-pressed={playing} onMouseDown={(e) => e.preventDefault()} onClick={() => void readBack()}>
        {playing ? 'Stop' : 'Read it back'}
      </button>
      {current && (
        <div className="reading-result" role="status">
          <p>
            {describeReading(current.reading)}
            {!current.timed && ' Long pauses need word timings (ElevenLabs, or OpenAI with whisper-1).'}{' '}
            <button className="link" onClick={() => setResult(null)}>
              clear
            </button>
          </p>
          {current.reading.stumbles.length > 0 && (
            <ul>
              {current.reading.stumbles.map((s, i) => (
                <li key={i}>
                  <strong>{KIND_LABELS[s.kind]}</strong>{' '}
                  {s.kind === 'filler' ? `“${s.spoken}” before “${s.word}”` : s.kind === 'changed' ? `“${s.spoken}” for “${s.word}”` : s.kind === 'pause' ? `before “${s.word}”` : `“${s.word}”`}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </>
  );
}

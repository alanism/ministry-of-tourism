// Reverse Engineer: paste a piece, and the model maps it onto the four columns
// with exact quotes. Everything it places is one agent run you can undo.
import { useMemo, useState } from 'react';
import { preparePiece, type ReverseEngineerOutcome } from '@writers-board/core';
import { REVERSE_ENGINEER, reverseEngineer } from '../ai/actions';
import { boardSession, latestBoard } from '../state/board';
import { useUi } from '../state/ui';
import { Switch } from './Switch';
import { ChatGptUsage } from './ChatGptUsage';

export function ReverseEngineerDialog() {
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [outcome, setOutcome] = useState<ReverseEngineerOutcome | null>(null);
  const [skipDebris, setSkipDebris] = useState(true);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  // How the piece will be read, shown before anything is sent.
  const preview = useMemo(() => (text.trim() ? preparePiece(text, { skipDebris }) : null), [text, skipDebris]);
  const debris = useMemo(() => (text.trim() ? preparePiece(text).removed : []), [text]);
  const close = () => useUi.getState().setDialog(null);
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;

  const runIt = async () => {
    setBusy(true);
    setError('');
    try {
      setOutcome(
        await reverseEngineer({ title: title.trim() || 'Untitled piece', author: author.trim() || undefined, text }, { skipDebris, onProgress: (done, total) => setProgress({ done, total }) }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  return (
    <div className="dialog-backdrop" onMouseDown={(e) => e.target === e.currentTarget && !busy && close()}>
      <section className="dialog wide" role="dialog" aria-modal="true" aria-labelledby="re-title">
        <h2 id="re-title">Reverse Engineer</h2>
        <ChatGptUsage job="reverse" />
        {!outcome ? (
          <>
            <p className="dialog-note">
              Paste a piece. Each card quotes it exactly and notes why the passage works. Use your own draft for a reverse outline:
              each paragraph gets the hidden question it answers, and paragraphs that answer none are flagged.
            </p>
            <button
              type="button"
              className="use-draft"
              disabled={!latestBoard()?.manuscript.trim()}
              onClick={() => {
                setTitle('My draft');
                setAuthor('');
                setText(latestBoard()?.manuscript ?? '');
              }}
            >
              Use my draft
            </button>
            <div className="field-row">
              <label className="field">
                <span>Title</span>
                <input value={title} onChange={(e) => setTitle(e.target.value)} />
              </label>
              <label className="field">
                <span>Author</span>
                <input value={author} onChange={(e) => setAuthor(e.target.value)} />
              </label>
            </div>
            <label className="field">
              <span>The piece ({words} words)</span>
              <textarea rows={14} value={text} onChange={(e) => setText(e.target.value)} />
            </label>
            {preview && (preview.parts.length > 1 || debris.length > 0 || preview.markers > 0) && (
              <div className="re-preview">
                {debris.length > 0 && (
                  <Switch
                    label={`Skip ${debris.length} lines of figure text`}
                    checked={skipDebris}
                    onChange={setSkipDebris}
                    title="Captions, labels and numbers left over from a copied web page. Turn off to read every line as pasted."
                  />
                )}
                <p className="hint">
                  {[
                    preview.parts.length > 1 && `Long piece: read in ${preview.parts.length} parts, split at its section headings.`,
                    preview.markers > 0 && `${preview.markers} citation marks like [4] taken out so quotes stay exact.`,
                  ]
                    .filter(Boolean)
                    .join(' ')}
                </p>
                {skipDebris && debris.length > 0 && (
                  <details>
                    <summary>See what's left out</summary>
                    <ul className="re-debris">
                      {debris.slice(0, 60).map((line, i) => (
                        <li key={i}>{line}</li>
                      ))}
                      {debris.length > 60 && <li>…and {debris.length - 60} more</li>}
                    </ul>
                  </details>
                )}
              </div>
            )}
            {error && (
              <p className="dialog-error" role="alert">
                {error}
              </p>
            )}
            <div className="dialog-actions">
              <button onClick={close} disabled={busy}>
                Cancel
              </button>
              <button className="primary" onClick={runIt} disabled={busy || words < 20}>
                {busy ? (progress && progress.total > 1 ? `Reading part ${Math.min(progress.done + 1, progress.total)} of ${progress.total}…` : 'Reading the piece…') : 'Map it'}
              </button>
            </div>
          </>
        ) : (
          <>
            <p>
              Read as {/^[aeiou]/.test(outcome.kind) ? 'an' : 'a'} <strong>{outcome.kind}</strong>
              {outcome.parts > 1 ? `, in ${outcome.parts} parts` : ''}. Placed <strong>{outcome.placed.length}</strong> cards, each linked to an exact quote
              {outcome.guideId ? (outcome.parts > 1 ? ', with a timeline of what each section answers' : ', with a timeline of what each paragraph answers') : ''}.
            </p>
            {(outcome.removed > 0 || outcome.markers > 0) && (
              <p className="hint">
                {[outcome.removed > 0 && `Left out ${outcome.removed} lines of figure text.`, outcome.markers > 0 && `Took out ${outcome.markers} citation marks.`].filter(Boolean).join(' ')}
              </p>
            )}
            {outcome.rejected.length > 0 && (
              <details>
                <summary>{outcome.rejected.length} quotes were not in the piece and were left out</summary>
                <ul>
                  {outcome.rejected.map((r, i) => (
                    <li key={i}>
                      {r.type}: “{r.quote}”
                    </li>
                  ))}
                </ul>
              </details>
            )}
            <div className="dialog-actions">
              <button
                onClick={() => {
                  boardSession().undo(REVERSE_ENGINEER.id);
                  close();
                }}
              >
                Undo all of it
              </button>
              <button className="primary" onClick={close}>
                See the board
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

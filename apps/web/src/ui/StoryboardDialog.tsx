// Storyboard: pick a guide (each stop becomes a frame) or cards (each card
// becomes a frame), edit what each frame should show, see the cost, then draw.
// Sketch first in black and white; color the frames you keep.
import { useEffect, useMemo, useRef, useState } from 'react';
import { ASPECT_RATIOS, estimateCost, framesFromCards, framesFromGuide, type AspectRatio, type BoardView, type FramePlan, type FrameStage } from '@writers-board/core';
import { imagePrice } from '../ai/images';
import { aiSettings, updateAiSettings, useAiSettings, type StoryboardSettings } from '../ai/settings';
import { STORYBOARD, drawFrames, redrawFrames, type DrawOutcome, type DrawProgress } from '../ai/storyboard';
import { getBlob } from '../state/blobs';
import { boardSession } from '../state/board';
import { useUi } from '../state/ui';

type Source = 'guide' | 'cards';

export function StoryboardDialog({ board }: { board: BoardView }) {
  const settings = useAiSettings().storyboard;
  const setStoryboard = (patch: Partial<StoryboardSettings>) => updateAiSettings({ ...aiSettings(), storyboard: { ...settings, ...patch } });
  const close = () => useUi.getState().setDialog(null);

  const pathGuides = board.guides.filter((g) => g.kind === 'path' && g.stops.length > 0);
  const writtenCards = board.cards.filter((c) => c.text.trim() || c.annotation.trim());
  const frames = board.images.filter((img) => img.stage);
  const selectedId = useUi((s) => s.selectedId);

  const [source, setSource] = useState<Source>(pathGuides.length ? 'guide' : 'cards');
  const [guideId, setGuideId] = useState(pathGuides[0]?.id ?? '');
  const [cardIds, setCardIds] = useState<string[]>([]);
  const [stage, setStage] = useState<FrameStage>('sketch');
  const [referenceId, setReferenceId] = useState('');
  const [upload, setUpload] = useState<Blob | null>(null);
  const [edits, setEdits] = useState<Record<string, { art?: string; skip?: boolean }>>({});
  const [chosenFrames, setChosenFrames] = useState<string[]>(() => (selectedId && frames.some((f) => f.id === selectedId) ? [selectedId] : []));
  const [price, setPrice] = useState<number | null | undefined>(undefined);
  const [progress, setProgress] = useState<DrawProgress | null>(null);
  const [outcome, setOutcome] = useState<DrawOutcome | null>(null);
  const [error, setError] = useState('');
  const abort = useRef<AbortController | null>(null);

  const planned: FramePlan[] = useMemo(() => {
    const aspect = settings.aspect as AspectRatio;
    return source === 'guide' ? framesFromGuide(board, guideId, aspect) : framesFromCards(board, cardIds, aspect);
  }, [board, source, guideId, cardIds, settings.aspect]);
  // A frame is drawn once it's ticked and says what it shows.
  const toDraw = planned.map((f) => ({ ...f, art: edits[f.key]?.art ?? f.art })).filter((f) => !edits[f.key]?.skip && f.art.trim());
  const unsaid = planned.filter((f) => !edits[f.key]?.skip && !(edits[f.key]?.art ?? f.art).trim()).length;

  useEffect(() => {
    let live = true;
    setPrice(undefined);
    void imagePrice(settings.model).then((p) => live && setPrice(p));
    return () => {
      live = false;
    };
  }, [settings.model]);

  const reference = async (): Promise<Blob | null> => (upload ? upload : referenceId ? getBlob(board.images.find((i) => i.id === referenceId)!.blobId) : null);

  const go = async (work: (signal: AbortSignal, ref: Blob | null) => Promise<DrawOutcome>) => {
    setError('');
    setOutcome(null);
    abort.current = new AbortController();
    try {
      setOutcome(await work(abort.current.signal, await reference()));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setProgress(null);
    }
  };

  const busy = progress !== null;
  const cost = (n: number) => (price === undefined ? `${n} image${n === 1 ? '' : 's'}; checking the price…` : estimateCost(n, price));

  return (
    <div className="dialog-backdrop" onMouseDown={(e) => e.target === e.currentTarget && !busy && close()}>
      <section className="dialog wide storyboard" role="dialog" aria-modal="true" aria-labelledby="sb-title" onKeyDown={(e) => e.stopPropagation()}>
        <h2 id="sb-title">Storyboard</h2>
        <p className="dialog-note">
          Frames are drawn by the OpenRouter model you choose, with your key, and placed as prints on the board. Sketch first; color the frames you
          keep. Put <code>ART:</code> lines on the back of a card to direct its frame.
        </p>

        <div className="field-row">
          <label className="field">
            <span>Image model (OpenRouter)</span>
            <input value={settings.model} onChange={(e) => setStoryboard({ model: e.target.value })} placeholder="google/gemini-2.5-flash-image" />
          </label>
          <label className="field">
            <span>Shape</span>
            <select value={settings.aspect} onChange={(e) => setStoryboard({ aspect: e.target.value as StoryboardSettings['aspect'] })}>
              {(Object.keys(ASPECT_RATIOS) as AspectRatio[]).map((a) => (
                <option key={a}>{a}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="field-row">
          <label className="field">
            <span>Look for every frame</span>
            <input value={settings.style} onChange={(e) => setStoryboard({ style: e.target.value })} placeholder="e.g. gouache, muted greens, soft light" />
          </label>
          <label className="field">
            <span>Reference picture (characters and look)</span>
            <select
              value={upload ? 'upload' : referenceId}
              onChange={(e) => {
                setUpload(null);
                setReferenceId(e.target.value === 'upload' ? '' : e.target.value);
              }}
            >
              <option value="">None</option>
              {board.images.map((img, i) => (
                <option key={img.id} value={img.id}>
                  {img.caption || `Picture ${i + 1}`}
                </option>
              ))}
              {upload && <option value="upload">Uploaded picture</option>}
            </select>
            <input type="file" accept="image/*" aria-label="Upload a reference picture" onChange={(e) => setUpload(e.target.files?.[0] ?? null)} />
          </label>
        </div>
        <label className="check">
          <input type="checkbox" checked={settings.faceForward} onChange={(e) => setStoryboard({ faceForward: e.target.checked })} /> Characters face
          toward the page turn (left to right, into the book)
        </label>

        <fieldset>
          <legend>New frames</legend>
          <div className="segmented" role="radiogroup" aria-label="Frames from">
            <button role="radio" aria-checked={source === 'guide'} disabled={!pathGuides.length} onClick={() => setSource('guide')}>
              Along a guide
            </button>
            <button role="radio" aria-checked={source === 'cards'} onClick={() => setSource('cards')}>
              From cards
            </button>
          </div>
          {source === 'guide' ? (
            <label className="field">
              <span>Guide (each stop is a frame)</span>
              <select value={guideId} onChange={(e) => setGuideId(e.target.value)}>
                {pathGuides.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.title} ({g.stops.length} stops)
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <div className="sb-cards" role="group" aria-label="Cards to draw">
              {writtenCards.length === 0 && <p className="hint">Write on some cards first.</p>}
              {writtenCards.map((c) => (
                <label key={c.id} className="check">
                  <input
                    type="checkbox"
                    checked={cardIds.includes(c.id)}
                    onChange={(e) => setCardIds((ids) => (e.target.checked ? [...ids, c.id] : ids.filter((id) => id !== c.id)))}
                  />{' '}
                  <strong>{c.name}</strong> {c.text.trim().slice(0, 70)}
                </label>
              ))}
            </div>
          )}
          {planned.length > 0 && (
            <ol className="sb-frames">
              {planned.map((f) => (
                <li key={f.key} className={edits[f.key]?.skip ? 'skipped' : ''}>
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={!edits[f.key]?.skip}
                      onChange={(e) => setEdits((all) => ({ ...all, [f.key]: { ...all[f.key], skip: !e.target.checked } }))}
                    />{' '}
                    <strong>{f.caption}</strong>
                  </label>
                  <textarea
                    rows={2}
                    aria-label={`What ${f.caption} shows`}
                    placeholder="Describe what this frame shows"
                    value={edits[f.key]?.art ?? f.art}
                    onChange={(e) => setEdits((all) => ({ ...all, [f.key]: { ...all[f.key], art: e.target.value } }))}
                  />
                </li>
              ))}
            </ol>
          )}
          <div className="sb-go">
            <div className="segmented" role="radiogroup" aria-label="Stage">
              <button role="radio" aria-checked={stage === 'sketch'} onClick={() => setStage('sketch')}>
                Sketch (black and white)
              </button>
              <button role="radio" aria-checked={stage === 'color'} onClick={() => setStage('color')}>
                Color
              </button>
            </div>
            <span className="sb-cost">
              {cost(toDraw.length)}
              {unsaid > 0 && ` · ${unsaid} frame${unsaid === 1 ? '' : 's'} still need${unsaid === 1 ? 's' : ''} a description`}
            </span>
            <button
              className="primary"
              disabled={busy || toDraw.length === 0}
              onClick={() => void go((signal, ref) => drawFrames(toDraw, { stage, reference: ref, onProgress: setProgress, signal }))}
            >
              Draw {toDraw.length} frame{toDraw.length === 1 ? '' : 's'}
            </button>
          </div>
        </fieldset>

        {frames.length > 0 && (
          <fieldset>
            <legend>Frames on the board</legend>
            <div className="sb-cards" role="group" aria-label="Frames to redraw">
              {frames.map((f, i) => (
                <label key={f.id} className="check">
                  <input
                    type="checkbox"
                    checked={chosenFrames.includes(f.id)}
                    onChange={(e) => setChosenFrames((ids) => (e.target.checked ? [...ids, f.id] : ids.filter((id) => id !== f.id)))}
                  />{' '}
                  {f.caption || `Frame ${i + 1}`} <span className="hint">({f.stage})</span>
                </label>
              ))}
            </div>
            <div className="sb-go">
              <span className="sb-cost">{cost(chosenFrames.length)}</span>
              <button
                disabled={busy || chosenFrames.length === 0}
                onClick={() => void go((signal, ref) => redrawFrames(chosenFrames, { mode: 'regenerate', reference: ref, onProgress: setProgress, signal }))}
              >
                Regenerate
              </button>
              <button
                className="primary"
                disabled={busy || !frames.some((f) => chosenFrames.includes(f.id) && f.stage === 'sketch')}
                onClick={() =>
                  void go((signal, ref) =>
                    redrawFrames(
                      chosenFrames.filter((id) => frames.find((f) => f.id === id)?.stage === 'sketch'),
                      { mode: 'color', reference: ref, onProgress: setProgress, signal },
                    ),
                  )
                }
              >
                Color the sketches
              </button>
            </div>
          </fieldset>
        )}

        {progress && (
          <p role="status">
            Drawing {Math.min(progress.done + 1, progress.total)} of {progress.total}…{' '}
            <button className="link" onClick={() => abort.current?.abort()}>
              stop
            </button>
          </p>
        )}
        {outcome && (
          <div role="status" className="sb-outcome">
            <p>
              Drew {outcome.made} frame{outcome.made === 1 ? '' : 's'}
              {outcome.cost > 0 ? ` (OpenRouter reported $${outcome.cost.toFixed(2)})` : ''}.
            </p>
            {outcome.failed.length > 0 && (
              <ul>
                {outcome.failed.map((f, i) => (
                  <li key={i}>
                    {f.caption}: {f.message}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        {error && (
          <p className="dialog-error" role="alert">
            {error}
          </p>
        )}
        <div className="dialog-actions">
          <button disabled={busy || !boardSession().canUndo(STORYBOARD.id)} onClick={() => boardSession().undo(STORYBOARD.id)}>
            Undo the last batch
          </button>
          <button className="primary" disabled={busy} onClick={close}>
            Done
          </button>
        </div>
      </section>
    </div>
  );
}

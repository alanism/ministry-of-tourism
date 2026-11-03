import { useEffect, useMemo, useRef, useState } from 'react';
import { MUSE_IMAGE_PRESETS, composeMusePrompt, readAllCards, readTripMeta, type Actor, type MuseImageAspect, type MuseImageMode, type TripSession } from '@writers-board/core';
import { MUSE_IMAGE_ENDPOINT, MUSE_IMAGE_PRICE_NOTE, MUSE_IMAGE_PRICING_URL, MuseImageError, generateMuseImage, type MuseImageResult } from './muse-image';
import { MUSE_IMAGE_CREDIT, addGeneratedImage } from './muse-image-board';

type Status = { kind: 'idle' } | { kind: 'running'; started: number } | { kind: 'done'; result: MuseImageResult; url: string; prompt: string } | { kind: 'failed'; message: string; uncertain: boolean };

export interface MuseImagePanelProps { session: TripSession; actor: Actor; refresh: () => void; notify: (message: string) => void; onClose: () => void; origin?: () => { x: number; y: number } }

export function MuseImagePanel({ session, actor, refresh, notify, onClose, origin }: MuseImagePanelProps) {
  const meta = readTripMeta(session.doc), boardId = session.boardId;
  const venues = useMemo(() => readAllCards(session.parts).filter(card => card.kind !== 'note' && card.kind !== 'brief' && card.title.trim()), [session]);
  const [mode, setMode] = useState<MuseImageMode>('city');
  const presets = MUSE_IMAGE_PRESETS.filter(preset => preset.mode === mode);
  const [presetId, setPresetId] = useState(presets[0]!.id);
  const preset = MUSE_IMAGE_PRESETS.find(p => p.id === presetId && p.mode === mode) ?? presets[0]!;
  const [aspect, setAspect] = useState<MuseImageAspect>(preset.defaultAspect);
  const [city, setCity] = useState(meta.city ?? '');
  const [venueId, setVenueId] = useState('');
  const [subject, setSubject] = useState('');
  const [view, setView] = useState('');
  const [prompt, setPrompt] = useState(''), [edited, setEdited] = useState(false);
  const [key, setKey] = useState(''), [ack, setAck] = useState(false);
  const [status, setStatus] = useState<Status>({ kind: 'idle' }), [elapsed, setElapsed] = useState(0), [adding, setAdding] = useState(false);
  const controller = useRef<AbortController | null>(null), run = useRef(0);
  const venue = venues.find(card => card.id === venueId);
  const effectiveSubject = mode === 'venue' && venue ? venue.title : subject;
  const composed = useMemo(() => { try { return composeMusePrompt(preset, { city, subject: effectiveSubject, view: view || undefined }); } catch { return ''; } }, [preset, city, effectiveSubject, view]);
  useEffect(() => { if (!edited) setPrompt(composed); }, [composed, edited]);
  useEffect(() => { setAspect(preset.defaultAspect); setView(''); }, [preset.id]);
  useEffect(() => { if (status.kind !== 'running') return; const timer = setInterval(() => setElapsed(Math.round((Date.now() - status.started) / 1000)), 500); return () => clearInterval(timer); }, [status]);
  // The key and any in-flight request end with the panel.
  useEffect(() => () => { run.current += 1; controller.current?.abort(); }, []);
  useEffect(() => () => { if (status.kind === 'done') URL.revokeObjectURL(status.url); }, [status]);

  const generate = async () => {
    if (status.kind === 'running') return;
    const id = ++run.current, abort = new AbortController(); controller.current = abort;
    const sent = prompt.trim();
    setStatus({ kind: 'running', started: Date.now() }); setElapsed(0);
    try {
      const result = await generateMuseImage({ key, prompt: sent, aspect, signal: abort.signal });
      if (id !== run.current) return; // Stopped or closed: a late image is ignored.
      setStatus({ kind: 'done', result, url: URL.createObjectURL(result.blob), prompt: sent });
    } catch (error) {
      if (id !== run.current) return;
      const e = error instanceof MuseImageError ? error : new MuseImageError('provider', 'Generation failed. Nothing was added.', true);
      setStatus({ kind: 'failed', message: e.message, uncertain: e.uncertain });
    } finally { if (controller.current === abort) controller.current = null; }
  };
  const stop = () => { controller.current?.abort(); run.current += 1; setStatus({ kind: 'failed', message: 'Stopped. Meta may still have generated and billed the image; a late result is ignored.', uncertain: true }); };
  const caption = mode === 'venue' ? `${effectiveSubject}${meta.city ? `, ${meta.city}` : ''}, Muse Image illustration` : `${effectiveSubject}, ${city}, Muse Image illustration`;
  const add = async (destination: 'board' | 'card') => {
    if (status.kind !== 'done' || adding) return;
    setAdding(true);
    try {
      const abort = new AbortController();
      const { persisted } = await addGeneratedImage(session, actor, status.result, preset, caption, { boardId }, destination === 'card' && venue ? { kind: 'card', cardId: venue.id } : { kind: 'board', origin: origin?.() }, abort.signal);
      refresh(); notify(persisted ? (destination === 'card' ? `Illustration attached to ${venue?.title}` : 'Illustration added to the board') : 'Illustration is in this tab only. Download a ZIP backup before closing.');
      onClose();
    } catch (error) { notify(error instanceof Error ? error.message : 'The illustration could not be added. Nothing changed.'); }
    finally { setAdding(false); }
  };
  const download = () => { if (status.kind !== 'done') return; const a = document.createElement('a'); a.href = status.url; a.download = `${caption.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'muse-image'}.${status.result.mime.split('/')[1]}`; a.click(); };
  const running = status.kind === 'running', ready = !!key.trim() && ack && !!prompt.trim() && !running;

  return <section className="mot-muse-image" aria-label="Create with Muse Image">
    <header><h2>Create with Muse Image</h2><p className="m-muted">One illustration from your own Meta API key. Everything else on the board works without it.</p></header>
    <div className="m-seg" role="group" aria-label="Kind">{(['city', 'venue'] as const).map(m => <button key={m} type="button" aria-pressed={mode === m} disabled={running} onClick={() => { setMode(m); setPresetId(MUSE_IMAGE_PRESETS.find(p => p.mode === m)!.id); }}>{m === 'city' ? 'City illustration' : 'Venue sketch'}</button>)}</div>
    <div className="mot-muse-image-grid">
      {presets.length > 1 && <label>Preset<select className="m-field" value={preset.id} disabled={running} onChange={e => setPresetId(e.target.value)}>{presets.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}</select></label>}
      <label>City<input className="m-field" value={city} maxLength={80} disabled={running} onChange={e => setCity(e.target.value)} /></label>
      {mode === 'venue' && <label>Venue from your trip<select className="m-field" value={venueId} disabled={running} onChange={e => setVenueId(e.target.value)}><option value="">Type a venue instead</option>{venues.map(card => <option key={card.id} value={card.id}>{card.title}</option>)}</select></label>}
      {!(mode === 'venue' && venue) && <label>{mode === 'venue' ? 'Venue' : 'Subject'}<input className="m-field" value={subject} maxLength={200} disabled={running} placeholder={mode === 'venue' ? 'e.g. a teak-villa hotel courtyard' : preset.id === 'fcc-city-street' ? 'e.g. a canal lined with shophouses' : 'e.g. a glass of Thai iced tea'} onChange={e => setSubject(e.target.value)} /></label>}
      {preset.views && <label>View<select className="m-field" value={view || preset.views[0]} disabled={running} onChange={e => setView(e.target.value)}>{preset.views.map(v => <option key={v} value={v}>{v}</option>)}</select></label>}
      <label>Shape<select className="m-field" value={aspect} disabled={running} onChange={e => setAspect(e.target.value as MuseImageAspect)}><option value="landscape">Landscape</option><option value="portrait">Portrait</option><option value="square">Square</option></select></label>
    </div>
    <p className="m-muted t-1">{preset.description} Source: FCC {preset.source.path} ({preset.source.revision}). {preset.source.note}</p>
    <label className="mot-muse-image-prompt">Prompt sent to Meta (editable)<textarea className="m-field" value={prompt} maxLength={4000} rows={7} disabled={running} placeholder={mode === 'venue' ? 'Choose a venue or type one to build the prompt.' : 'Type a subject to build the prompt.'} onChange={e => { setPrompt(e.target.value); setEdited(true); }} /></label>
    {edited && <button type="button" className="m-btn small ghost" disabled={running} onClick={() => setEdited(false)}>Reset to preset prompt</button>}
    <div className="mot-muse-image-disclosure" role="note">
      <strong>What leaves this device</strong>
      <p>Only when you press Generate: the prompt above, the image shape and your key, sent from this browser directly to Meta at {MUSE_IMAGE_ENDPOINT}. No MoT server sees them. Anything personal you typed is included. Meta handles the request under its own terms; no retention promise is made here. Your Meta developer account pays: {MUSE_IMAGE_PRICE_NOTE} (<a href={MUSE_IMAGE_PRICING_URL} target="_blank" rel="noopener noreferrer">current pricing</a>). A stopped or timed-out request may still be billed.</p>
      <label>Meta API key, for this session only<input className="m-field" type="password" autoComplete="off" spellCheck={false} value={key} disabled={running} onChange={e => setKey(e.target.value)} /></label>
      <p className="m-muted t-1">Kept only in this panel's memory: never saved to the board, browser storage, exports or diagnostics. Closing the panel or reloading drops it.</p>
      {key && <button type="button" className="m-btn small ghost" disabled={running} onClick={() => setKey('')}>Clear key</button>}
      <label className="mot-muse-image-ack"><input type="checkbox" checked={ack} disabled={running} onChange={e => setAck(e.target.checked)} />I understand the prompt goes to Meta and my Meta account pays for each generated image.</label>
    </div>
    <div className="mot-muse-image-actions">
      {running ? <><button type="button" className="m-btn" onClick={stop}>Stop</button><span role="status" aria-live="polite">Generating with Muse Image… {elapsed}s</span></>
        : <button type="button" className="m-btn primary" disabled={!ready} onClick={() => void generate()}>{status.kind === 'failed' || status.kind === 'done' ? 'Generate another (new charge)' : 'Generate one image'}</button>}
      <button type="button" className="m-btn ghost" disabled={running} onClick={onClose}>Close</button>
    </div>
    {status.kind === 'failed' && <p role="alert" className="mot-muse-image-error">{status.message}{status.uncertain ? ' Trying again is a new request and may be a new charge.' : ''}</p>}
    {status.kind === 'done' && <figure className="mot-muse-image-result">
      <img src={status.url} alt={caption} />
      <figcaption><strong>AI-generated illustration</strong> · {status.result.width} × {status.result.height} px · {status.result.mime.replace('image/', '').toUpperCase()} · {Math.round(status.result.elapsedMs / 1000)}s<br /><small>{MUSE_IMAGE_CREDIT}. An illustration, not a photograph or a record of how a place looks.</small></figcaption>
      <div className="mot-muse-image-actions">
        {mode === 'venue' && venue && <button type="button" className="m-btn primary" disabled={adding} onClick={() => void add('card')}>Attach to {venue.title}</button>}
        <button type="button" className={`m-btn${mode === 'venue' && venue ? '' : ' primary'}`} disabled={adding} onClick={() => void add('board')}>Add to board</button>
        <button type="button" className="m-btn" onClick={download}>Download</button>
        <button type="button" className="m-btn ghost" disabled={adding} onClick={() => setStatus({ kind: 'idle' })}>Discard</button>
      </div>
    </figure>}
  </section>;
}

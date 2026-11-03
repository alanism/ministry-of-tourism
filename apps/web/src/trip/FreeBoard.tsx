// Free board: the default board view. Lanes remain one click away, untouched.
import { lazy, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { boardAssetRect, boardCardRect, boardProjection, captureSameBoardClipboard, compareBoardObjects, readAsset, readCard, readPresentation, readPresentations, readTripMeta, resolveSameBoardClipboard, type Actor, type Presentation, type RevCard, type SameBoardClipboard, type TripSession } from '@writers-board/core';
import { useBoardClipboard } from './useBoardClipboard';
import { BoardView, TripCardView, type ViewProps } from './BoardView';
import { FocusSheet } from './ui';
import { coverAssetId, useAssetUrl } from './trip-assets';
import { buildMoveCommand, classifyPaste, imagePlacementRect, ingestBoardImages, moveRect, nextStack, rectsEqual, resizeRect, textNoteInput, validateBoardRect, type BoardObjectRef, type BoardRect } from './free-board-actions';
import { placeBoardArtwork } from './board-artwork';
import { museImageEnabled } from './muse-image';
import type { Artwork } from '../artwork/catalog';
import type { ArtDestination } from '../artwork/country-art';
const ArtworkPicker = lazy(() => import('../artwork/ArtworkPicker'));
const MuseImagePanel = lazy(() => import('./MuseImagePanel').then(m => ({ default: m.MuseImagePanel })));
import './free-board.css';
import type { Ghost } from './ProposalReview';
type Props = ViewProps & { header?: ReactNode; top?: ReactNode; onOpenDay?: () => void; ghosts?: Ghost[]; onReview?: (index: number) => void; destinations?: readonly ArtDestination[]; initialView?: 'free' | 'lanes' };
export function GhostReviewButton({ghost,onReview}:{ghost:Ghost;onReview?:(index:number)=>void}){return <button type="button" className="m-btn small" onClick={()=>{if(ghost.review)ghost.review();else onReview?.(ghost.index);}}>Review suggestion: {ghost.title}</button>;}
interface Obj { ref: BoardObjectRef; rect: BoardRect; card?: RevCard; presentation?: Presentation }
const CARD_LIMITS = { minWidth: 400, minHeight: 300, maxWidth: 5000, maxHeight: 5000 };
const ASSET_LIMITS = { minWidth: 100, minHeight: 100, maxWidth: 10000, maxHeight: 10000 };
const limitsFor = (o: Obj) => o.ref.kind === 'card' ? CARD_LIMITS : ASSET_LIMITS;
function isEditableTarget(target: EventTarget | null): boolean { const el = target as HTMLElement | null; return !!el?.closest('input,textarea,select,[contenteditable=""],[contenteditable="true"],dialog'); }
function FreeAssetImage({ session, presentation, rect }: { session: TripSession; presentation: Presentation; rect: BoardRect }) {
  const url = useAssetUrl(session, presentation.assetId);
  const [cx, cy, cw, ch] = presentation.crop;
  void rect;
  return <div className="m-free-asset-img">{url && <img src={url} alt="" draggable={false} style={{ width: `${100 / cw}%`, height: `${100 / ch}%`, left: `${-(cx / cw) * 100}%`, top: `${-(cy / ch) * 100}%` }} />}</div>;
}
function FreeCardPhoto({ session, card }: { session: TripSession; card: RevCard }) {
  const url = useAssetUrl(session, coverAssetId(card));
  if (!url) return null;
  return <div className="m-free-photo"><img src={url} alt="" draggable={false} /></div>;
}
export function FreeBoard(props: Props) {
  const { session, actor, refresh, notify, header, top, ghosts = [], onReview, destinations = [] } = props;
  const [view, setView] = useState<'free' | 'lanes'>(props.initialView ?? 'free');
  const [zoom, setZoom] = useState(0.2);
  const [selected, setSelected] = useState<BoardObjectRef | null>(null);
  const [preview, setPreview] = useState<{ ref: BoardObjectRef; rect: BoardRect } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openCardId, setOpenCardId] = useState<string | null>(null);
  const [openAssetId, setOpenAssetId] = useState<string | null>(null);
  const [noteOpen, setNoteOpen] = useState(false);
  const [artOpen, setArtOpen] = useState(false);
  const [museOpen, setMuseOpen] = useState(false), museImage = useMemo(museImageEnabled, []);
  const [noteText, setNoteText] = useState(''); const [noteScope, setNoteScope] = useState<'private' | 'stay'>('private'); const [noteAbout, setNoteAbout] = useState(true);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [gestureLabel, setGestureLabel] = useState<string | null>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const generationRef = useRef(0);
  const busyRef = useRef(false);
  const clipboardRef = useRef<SameBoardClipboard | null>(null);
  const clipboardNonceRef = useRef<string | null>(null);
  const [busy, setBusy] = useState(false);
  const committedRef = useRef(false);
  const [ingestCommitted, setIngestCommitted] = useState(false);
  const gestureRef = useRef<{ ref: BoardObjectRef; mode: 'move' | 'resize'; pointerId: number; startX: number; startY: number; startRect: BoardRect; current: BoardRect; snapshot: string } | null>(null);
  const openTriggerRef = useRef<HTMLElement | null>(null);
  const artTriggerRef = useRef<HTMLElement | null>(null);
  const artContextRef = useRef<{ session: TripSession; actor: Props['actor']; view: 'free' | 'lanes' } | null>(null);
  useEffect(() => { const c = new AbortController(); controllerRef.current = c; const artContext = { session, actor, view }; artContextRef.current = artContext; return () => { if (artContextRef.current === artContext) artContextRef.current = null; setArtOpen(false); controllerRef.current?.abort(); generationRef.current += 1; busyRef.current = false; setBusy(false); committedRef.current = false; setIngestCommitted(false); gestureRef.current = null; clipboardRef.current = null; clipboardNonceRef.current = null; setPreview(null); setGestureLabel(null); }; }, [session, actor, view]);
  const objects = useMemo<Obj[]>(() => {
    if (view !== 'free') return [];
    const out: Obj[] = [];
    for (const card of Object.values(boardProjection(session.doc)).flat()) {
      if (card.kind === 'brief') continue;
      try { const rect = boardCardRect(card); out.push({ ref: { kind: 'card', id: card.id, stack: rect.stack }, rect, card }); } catch { /* invalid stored geometry is not rendered as a movable item */ }
    }
    for (const presentation of readPresentations(session.parts)) {
      if (presentation.surface !== 'board' || !presentation.assetId) continue;
      try { const rect = boardAssetRect(presentation); if (rect) out.push({ ref: { kind: 'asset', id: presentation.id, stack: rect.stack }, rect, presentation }); } catch { /* as above */ }
    }
    return out.sort((a, b) => compareBoardObjects(a.ref, b.ref));
  }, [session, view, props.tick]);
  const selectedObj = selected ? objects.find((o) => o.ref.kind === selected.kind && o.ref.id === selected.id) : undefined;
  const openCard = openCardId ? objects.find((o) => o.card?.id === openCardId)?.card : undefined;
  const openPresentation = openAssetId ? objects.find((o) => o.presentation?.id === openAssetId)?.presentation : undefined;
  const openAsset = openPresentation?.assetId ? readAsset(session.parts, openPresentation.assetId) : undefined;
  const fail = (e: unknown, fallback = 'That did not work. Nothing changed.') => { const m = e instanceof Error ? e.message : fallback; setError(m); notify(m); };
  const origin = () => { const v = viewportRef.current; const x = (v?.scrollLeft ?? 0) / zoom + 120; const y = (v?.scrollTop ?? 0) / zoom + 120; if (!Number.isFinite(x) || !Number.isFinite(y)) throw new RangeError('That position is not valid. Nothing changed.'); return { x, y }; };
  const crossClipboard = useBoardClipboard({session,actor:actor as Actor,view,origin,refresh,notify});
  const snapshotOf = (ref: BoardObjectRef): string => {
    try { return JSON.stringify(ref.kind === 'card' ? readCard(session.parts, ref.id) : readPresentation(session.parts, ref.id)); } catch { return 'invalid-current-state'; }
  };
  const commitRect = (obj: Obj, rect: BoardRect) => {
    if (obj.presentation?.locked) { fail(new Error('That image is locked, so it cannot be moved, resized, layered or duplicated. Nothing changed.')); return; }
    try {
      const valid = validateBoardRect(rect, limitsFor(obj));
      if (rectsEqual(valid, obj.rect)) return;
      const cmd = buildMoveCommand(obj.ref, valid);
      session.execute(actor, cmd.command, cmd.input); refresh(); setError(null); notify(obj.ref.kind === 'card' ? 'Card arranged on the board' : 'Image arranged on the board');
    } catch (e) { fail(e); }
  };
  const cancelGesture = () => { gestureRef.current = null; setPreview(null); setGestureLabel(null); };
  const startGesture = (e: React.PointerEvent<HTMLButtonElement>, obj: Obj, mode: 'move' | 'resize') => {
    if (gestureRef.current) return;
    e.preventDefault(); e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    e.currentTarget.focus(); viewportRef.current?.focus({ preventScroll: true });
    setSelected(obj.ref);
    gestureRef.current = { ref: obj.ref, mode, pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, startRect: obj.rect, current: obj.rect, snapshot: snapshotOf(obj.ref) };
    setGestureLabel(mode === 'move' ? 'Moving. Press Escape or Cancel to stop without changing the board.' : 'Resizing. Press Escape or Cancel to stop without changing the board.');
  };
  const moveGesture = (e: React.PointerEvent<HTMLButtonElement>, obj: Obj) => {
    const g = gestureRef.current; if (!g || g.pointerId !== e.pointerId || g.ref.id !== obj.ref.id) return;
    const dx = (e.clientX - g.startX) / zoom; const dy = (e.clientY - g.startY) / zoom;
    let next: BoardRect;
    if (g.mode === 'move') next = { ...g.startRect, x: g.startRect.x + dx, y: g.startRect.y + dy };
    else { const factor = 1 + (Math.abs(dx) / g.startRect.width >= Math.abs(dy) / g.startRect.height ? dx / g.startRect.width : dy / g.startRect.height); next = { ...g.startRect, width: g.startRect.width * factor, height: g.startRect.height * factor }; }
    g.current = next;
    try { const valid = validateBoardRect(next, limitsFor(obj)); setPreview({ ref: g.ref, rect: valid }); setError(null); } catch (err) { setError(err instanceof Error ? err.message : 'That position or size is not valid. Nothing changed.'); }
  };
  const finishGesture = (e: React.PointerEvent<HTMLButtonElement>, obj: Obj) => {
    const g = gestureRef.current; if (!g || g.pointerId !== e.pointerId) return;
    const current = g.current; cancelGesture();
    if (rectsEqual(current, g.startRect)) return;
    if (snapshotOf(g.ref) !== g.snapshot) { fail(new Error('This item changed while you were arranging it, so your change was not applied. Nothing was overwritten.')); return; }
    const fresh = objects.find((x) => x.ref.kind === g.ref.kind && x.ref.id === g.ref.id);
    if (!fresh) { fail(new Error('That item is no longer on the board. Nothing changed.')); return; }
    commitRect(fresh, current);
  };
  const ingest = async (files: Iterable<File> | ArrayLike<File>) => {
    const list = Array.from(files as ArrayLike<File>); if (!list.length || busyRef.current) return;
    if (!controllerRef.current || controllerRef.current.signal.aborted) controllerRef.current = new AbortController();
    busyRef.current = true; setBusy(true); committedRef.current = false; setIngestCommitted(false); const gen = ++generationRef.current; const signal = controllerRef.current.signal;
    try {
      const result = await ingestBoardImages(session, actor, list, signal, { origin: origin(), baseStack: objects.reduce((m, o) => Math.max(m, o.rect.stack), 0) + 1, onCommitted: () => { if (gen !== generationRef.current) return; committedRef.current = true; setIngestCommitted(true); refresh(); } });
      if (gen !== generationRef.current || signal?.aborted) return;
      refresh(); setError(null); notify(result.persisted ? 'Images added to the board' : 'Images are available in this tab only. Download a ZIP backup before closing.');
    } catch (e) { if (!signal?.aborted && gen === generationRef.current) fail(e, 'Those images were not added. Nothing changed. You can add text or choose image files instead.'); }
    finally { if (gen === generationRef.current) { busyRef.current = false; setBusy(false); committedRef.current = false; setIngestCommitted(false); } }
  };
  const cancelIngest = () => { if (committedRef.current) return; controllerRef.current?.abort(); generationRef.current += 1; busyRef.current = false; setBusy(false); committedRef.current = false; setIngestCommitted(false); controllerRef.current = new AbortController(); };
  const closeArtworkPicker = () => { setArtOpen(false); window.setTimeout(() => artTriggerRef.current?.focus(), 0); };
  const insertBoardArtwork = async (artwork: Artwork, signal: AbortSignal, onCommitted?: () => void) => {
    const context = artContextRef.current;
    const capturedOrigin = origin();
    const result = await placeBoardArtwork(session, actor as Actor, artwork, signal, { origin: capturedOrigin, onCommitted: () => { try { onCommitted?.(); } catch { /* Picker notification cannot affect the committed board item. */ } if (context && artContextRef.current === context) refresh(); } });
    if (context && artContextRef.current === context) {
      refresh();
      const placedPresentation = readPresentation(session.parts, result.presentationId);
      if (placedPresentation) { try { const rect = boardAssetRect(placedPresentation); setSelected({ kind: 'asset', id: result.presentationId, stack: rect?.stack ?? placedPresentation.zIndex }); } catch { setSelected({ kind: 'asset', id: result.presentationId, stack: placedPresentation.zIndex }); } }
      setError(null);
      notify(result.persisted ? 'Artwork added to the board' : 'Artwork is available in this tab only. Download a ZIP backup before closing.');
    }
  };
  const addText = (text: string, fromNote = false) => {
    if (crossClipboard.handleText(text)) { setPasteOpen(false); setPasteText(''); return; }
    try { const aboutCard = fromNote && noteAbout ? selectedObj?.card : undefined; const input = textNoteInput(text, aboutCard && selectedObj ? { x: selectedObj.rect.x + selectedObj.rect.width + 40, y: selectedObj.rect.y } : origin(), fromNote ? { scope: noteScope, ...(aboutCard ? { aboutTitle: aboutCard.title || 'Untitled' } : {}) } : undefined); session.execute(actor, 'trip_card_create', input); setNoteText(''); setPasteText(''); setNoteOpen(false); setPasteOpen(false); refresh(); setError(null); notify(fromNote && noteScope === 'stay' ? 'Note added for the trip' : 'Private note added'); } catch (e) { fail(e); }
  };
  const handlePasteText = (planText: string, html = '', uriList = '') => {
    if (crossClipboard.handleText(planText)) { setPasteOpen(false); return; }
    const plan = classifyPaste({ text: planText, html, uriList });
    if (plan.kind === 'html-only') { setPasteOpen(true); setError('That paste has no plain text we can safely add. Paste plain text below, or choose an image file. Nothing was added.'); notify('Paste plain text or choose a file instead. Nothing was added.'); return; }
    if (plan.kind === 'empty') return;
    setPasteText(plan.text); setPasteOpen(true);
  };
  const copySelected = () => { if (!selectedObj) return false; try { clipboardRef.current = captureSameBoardClipboard(session, selectedObj.ref.kind === 'card' ? { sourceCardId: selectedObj.ref.id } : { sourcePresentationId: selectedObj.ref.id }); clipboardNonceRef.current = crypto.randomUUID(); setError(null); notify('Copied for this board'); return true; } catch (e) { fail(e); return false; } };
  const pasteCopied = () => {
    if (!clipboardRef.current) { setPasteOpen(true); setError('Nothing copied on this board yet. Copy an item here first, or paste plain text or choose a file below.'); return; }
    try {
      const ref = resolveSameBoardClipboard(session, clipboardRef.current);
      session.execute(actor, 'trip_board_duplicate', { ...ref, offsetX: 120, offsetY: 120 });
      refresh(); setError(null); notify('Pasted a copy on this board');
    } catch (e) { fail(e); }
  };
  const visibleClipboardText = () => { if (!selectedObj) return ''; if (selectedObj.card) return selectedObj.card.title || 'Untitled'; if (selectedObj.presentation?.assetId) { try { return readAsset(session.parts, selectedObj.presentation.assetId)?.caption || 'Image'; } catch { return 'Image'; } } return 'Image'; };
  const onCopy = (e: React.ClipboardEvent) => {
    if (isEditableTarget(e.target) || !selectedObj) return;
    if (!copySelected()) return;
    const nonce = clipboardNonceRef.current; if (!nonce) return;
    e.clipboardData.setData('application/x-mot-board-reference', nonce);
    e.clipboardData.setData('text/plain', visibleClipboardText());
    e.preventDefault();
  };
  const onPaste = (e: React.ClipboardEvent) => {
    if (isEditableTarget(e.target)) return;
    const files = Array.from(e.clipboardData.files ?? []);
    if (files.length) { e.preventDefault(); void ingest(files); return; }
    const marker = e.clipboardData.getData('application/x-mot-board-reference');
    if (marker && clipboardRef.current && clipboardNonceRef.current && marker === clipboardNonceRef.current) { e.preventDefault(); pasteCopied(); return; }
    const text = e.clipboardData.getData('text/plain'); const uri = e.clipboardData.getData('text/uri-list'); const html = e.clipboardData.getData('text/html');
    if (text || uri || html) { e.preventDefault(); handlePasteText(text, html, uri); return; }
    if (Array.from(e.clipboardData.types ?? []).length) { e.preventDefault(); setPasteOpen(true); setError('That pasted content type is not supported here. Paste plain text below or choose an image file instead. Nothing was added.'); notify('That pasted content type is not supported. Paste plain text or choose an image file. Nothing was added.'); }
  };
  const duplicateSelected = () => { if (!selectedObj) return; if (selectedObj.presentation?.locked) { fail(new Error('That image is locked, so it cannot be duplicated. Nothing changed.')); return; } try { session.execute(actor, 'trip_board_duplicate', selectedObj.ref.kind === 'card' ? { sourceCardId: selectedObj.ref.id, offsetX: 120, offsetY: 120 } : { sourcePresentationId: selectedObj.ref.id, offsetX: 120, offsetY: 120 }); refresh(); notify('Copy added'); } catch (e) { fail(e); } };
  const layer = (direction: 'front' | 'back') => { if (!selectedObj) return; try { const stack = nextStack(objects.map((o) => o.ref), selectedObj.ref, direction); commitRect(selectedObj, { ...selectedObj.rect, stack }); } catch (e) { fail(e); } };
  const nudge = (dx: number, dy: number) => { if (!selectedObj) return; try { commitRect(selectedObj, moveRect(selectedObj.rect, dx, dy, limitsFor(selectedObj))); } catch (e) { fail(e); } };
  const scaleSelected = (factor: number) => { if (!selectedObj) return; try { commitRect(selectedObj, resizeRect(selectedObj.rect, factor, limitsFor(selectedObj))); } catch (e) { fail(e); } };
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (isEditableTarget(e.target)) return;
    if (e.key === 'Escape') { if (gestureRef.current) { e.preventDefault(); cancelGesture(); } return; }
    if (!selectedObj) return;
    if (e.repeat) return;
    const step = 20;
    if (e.key.startsWith('Arrow')) {
      e.preventDefault();
      const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0; const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
      if (e.shiftKey) { try { const f = dx + dy > 0 ? 1.05 : 0.95; commitRect(selectedObj, resizeRect(selectedObj.rect, f, limitsFor(selectedObj))); } catch (err) { fail(err); } }
      else nudge(dx, dy);
    }
  };
  if (view === 'lanes') return <div className="m-free-board"><div className="m-free-toolbar" role="toolbar" aria-label="Board views"><button type="button" className="m-btn" onClick={() => setView('free')}>Free board</button><button type="button" className="m-btn ink" aria-pressed="true">Lanes</button></div><BoardView {...props} /></div>;
  return (
    <section className="m-free-board" aria-label="Free board" onKeyDown={onKeyDown} onCopy={onCopy}>
      {header}
      {(top || ghosts.length > 0) && <div className="mot-top">{top}{ghosts.length > 0 && <div className="m-free-ghosts" aria-label="Suggestions waiting">{ghosts.map((g) => <GhostReviewButton key={g.index} ghost={g} onReview={onReview}/>)}</div>}</div>}
      <div className="m-free-toolbar" role="toolbar" aria-label="Free board tools">
        <button type="button" className="m-btn ink" aria-pressed="true">Free board</button>
        <button type="button" className="m-btn" onClick={() => setView('lanes')}>Lanes</button>
        <label className="m-free-item-picker">Item <select aria-label="Board item" value={selectedObj ? `${selectedObj.ref.kind}:${selectedObj.ref.id}` : ''} onChange={(e) => { const key = e.target.value; if (!key) return; const obj = objects.find((o) => `${o.ref.kind}:${o.ref.id}` === key); if (!obj) return; setSelected(obj.ref); const el = Array.from(viewportRef.current?.querySelectorAll('[data-board-item]') ?? []).find((node) => (node as HTMLElement).dataset.boardItem === key); el?.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }}><option value="">Select an item</option>{objects.map((obj) => { const key = `${obj.ref.kind}:${obj.ref.id}`; const asset = obj.presentation?.assetId ? readAsset(session.parts, obj.presentation.assetId) : undefined; const label = obj.card ? (obj.card.title || 'Untitled') : (asset?.caption || 'Image'); return <option key={key} value={key}>{label}</option>; })}</select></label>
        <button type="button" className="m-btn" onClick={() => { if (!noteOpen) setNoteAbout(true); setNoteOpen(!noteOpen); setPasteOpen(false); }}>New note</button>
        <button type="button" className="m-btn" onClick={() => fileRef.current?.click()}>Add images</button>
        <button type="button" className="m-btn" disabled={busy} onClick={(e) => { artTriggerRef.current = e.currentTarget; setArtOpen(true); }}>Add FCC art</button>
        {museImage && <button type="button" className="m-btn" disabled={busy} onClick={() => setMuseOpen(true)}>Create with Muse Image</button>}
        <button type="button" className="m-btn" onClick={() => { crossClipboard.cancel(); setPasteOpen(!pasteOpen); }}>Paste</button>
        <button type="button" className="m-btn" aria-label="Zoom out" onClick={() => setZoom((z) => Math.max(0.05, +(z - 0.05).toFixed(2)))}>Zoom out</button>
        <span aria-live="polite">{Math.round(zoom * 100)}%</span>
        <button type="button" className="m-btn" aria-label="Zoom in" onClick={() => setZoom((z) => Math.min(1, +(z + 0.05).toFixed(2)))}>Zoom in</button>
        {busy && (ingestCommitted ? <span role="status">Saving image bytes…</span> : <><span role="status">Adding images…</span><button type="button" className="m-btn" onClick={cancelIngest}>Cancel images</button></>)}
        <button type="button" className="m-btn" aria-label="Undo" onClick={() => { if (session.undo((actor as Actor).id)) { refresh(); notify('Undid the last change'); } }}>Undo</button>
        <button type="button" className="m-btn" aria-label="Redo" onClick={() => { if (session.redo((actor as Actor).id)) { refresh(); notify('Redid the change'); } }}>Redo</button>
        {props.onOpenDay && <button type="button" className="m-btn" onClick={props.onOpenDay}>Open day</button>}
        {gestureLabel && <><span role="status">{gestureLabel}</span><button type="button" className="m-btn" onClick={cancelGesture}>Cancel</button></>}
      </div>
      <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" multiple hidden onChange={(e) => { const files = Array.from(e.target.files ?? []); e.target.value = ''; void ingest(files); }} />
      {error && <p className="m-free-error" role="alert">{error}</p>}
      {crossClipboard.panels}
      {noteOpen && <div className="m-free-panel"><label htmlFor="m-free-note-text">New note</label><textarea id="m-free-note-text" value={noteText} onChange={(e) => setNoteText(e.target.value)} /><fieldset><legend>Who sees it</legend><label><input type="radio" name="m-free-note-scope" value="private" checked={noteScope === 'private'} onChange={() => setNoteScope('private')} /> Just me</label><label><input type="radio" name="m-free-note-scope" value="stay" checked={noteScope === 'stay'} onChange={() => setNoteScope('stay')} /> Trip</label></fieldset>{selectedObj?.card && <label><input type="checkbox" checked={noteAbout} onChange={(e) => setNoteAbout(e.target.checked)} /> About “{selectedObj.card.title || 'Untitled'}”</label>}<button type="button" className="m-btn primary" onClick={() => addText(noteText, true)}>Add note</button><button type="button" className="m-btn" onClick={() => setNoteOpen(false)}>Cancel</button></div>}
      {pasteOpen && <div className="m-free-panel" role="region" aria-label="Paste text or choose a file"><p>Paste plain text here, or choose an image file. For a board copy, read the system clipboard or use the copy kept in this app.</p>{crossClipboard.pasteControls}<label htmlFor="m-free-paste-text">Plain text</label><textarea id="m-free-paste-text" value={pasteText} onChange={(e) => setPasteText(e.target.value)} /><button type="button" className="m-btn primary" onClick={() => addText(pasteText)}>Add text</button><button type="button" className="m-btn" onClick={() => fileRef.current?.click()}>Choose image files</button><button type="button" className="m-btn" onClick={() => { crossClipboard.cancel(); setPasteOpen(false); setPasteText(''); }}>Cancel</button></div>}
      {selectedObj && <details className="m-free-selected-details"><summary>Arrange selected item</summary><div className="m-free-selectedbar" role="toolbar" aria-label="Selected item actions">
        <button type="button" className="m-btn small" disabled={!!selectedObj.presentation?.locked} onClick={() => nudge(-20, 0)}>Move left</button><button type="button" className="m-btn small" disabled={!!selectedObj.presentation?.locked} onClick={() => nudge(20, 0)}>Move right</button><button type="button" className="m-btn small" disabled={!!selectedObj.presentation?.locked} onClick={() => nudge(0, -20)}>Move up</button><button type="button" className="m-btn small" disabled={!!selectedObj.presentation?.locked} onClick={() => nudge(0, 20)}>Move down</button>
        <button type="button" className="m-btn small" disabled={!!selectedObj.presentation?.locked} onClick={() => scaleSelected(0.9)}>Resize smaller</button><button type="button" className="m-btn small" disabled={!!selectedObj.presentation?.locked} onClick={() => scaleSelected(1.1)}>Resize larger</button>
        <button type="button" className="m-btn small" disabled={!!selectedObj.presentation?.locked} onClick={duplicateSelected}>Duplicate</button><button type="button" className="m-btn small" onClick={copySelected}>Copy</button><button type="button" className="m-btn small" disabled={!!selectedObj.presentation?.locked} onClick={() => void crossClipboard.openCopy(selectedObj.ref.kind === 'card' ? {sourceCardId:selectedObj.ref.id} : {sourcePresentationId:selectedObj.ref.id})}>Copy to another trip</button><button type="button" className="m-btn small" onClick={pasteCopied}>Paste copied item</button>
        <button type="button" className="m-btn small" disabled={!!selectedObj.presentation?.locked} onClick={() => layer('front')}>Bring to front</button><button type="button" className="m-btn small" disabled={!!selectedObj.presentation?.locked} onClick={() => layer('back')}>Send to back</button>
        <button type="button" className="m-btn small" data-free-open={selectedObj.ref.id} onClick={(e) => { openTriggerRef.current = e.currentTarget; if (selectedObj.card) setOpenCardId(selectedObj.card.id); else setOpenAssetId(selectedObj.presentation!.id); }}>Open / edit</button>
      </div></details>}
      <div ref={viewportRef} className="m-free-viewport" tabIndex={0} role="application" aria-label="Free board canvas. Select an item, then use the arrow keys to move it." onPaste={onPaste}
        onDragOver={(e) => { if (Array.from(e.dataTransfer.types ?? []).length) e.preventDefault(); }}
        onDrop={(e) => { const files = Array.from(e.dataTransfer.files ?? []); if (files.length) { e.preventDefault(); void ingest(files); return; } const text = e.dataTransfer.getData('text/plain'); const uri = e.dataTransfer.getData('text/uri-list'); const html = e.dataTransfer.getData('text/html'); if (text || uri || html) { e.preventDefault(); handlePasteText(text, html, uri); return; } if (Array.from(e.dataTransfer.types ?? []).length) { e.preventDefault(); setPasteOpen(true); setError('That dropped content type is not supported here. Paste plain text below or choose an image file instead. Nothing was added.'); notify('That dropped content type is not supported. Paste plain text or choose an image file. Nothing was added.'); } }}>
        <div className="m-free-world" style={{ width: 10000 * zoom, height: 10000 * zoom }}>
          {objects.map((obj, rank) => {
            const shown = preview?.ref.kind === obj.ref.kind && preview.ref.id === obj.ref.id ? preview.rect : obj.rect;
            const isSel = selected?.kind === obj.ref.kind && selected?.id === obj.ref.id;
            const style = { left: shown.x * zoom, top: shown.y * zoom, width: shown.width * zoom, height: shown.height * zoom, zIndex: rank } as React.CSSProperties;
            const asset = obj.presentation?.assetId ? readAsset(session.parts, obj.presentation.assetId) : undefined;
            const title = obj.card ? (obj.card.title || 'Untitled') : (asset?.caption || 'Image');
            return <article key={`${obj.ref.kind}:${obj.ref.id}`} data-board-item={`${obj.ref.kind}:${obj.ref.id}`} className={`m-free-object${isSel ? ' selected' : ''}`} style={style} aria-label={title} onClick={() => setSelected(obj.ref)} onFocus={() => setSelected(obj.ref)}>
              <button type="button" className="m-free-handle move" disabled={!!obj.presentation?.locked} aria-label={`Move ${title}`} onFocus={() => setSelected(obj.ref)} onPointerDown={(e) => startGesture(e, obj, 'move')} onPointerMove={(e) => moveGesture(e, obj)} onPointerUp={(e) => finishGesture(e, obj)} onPointerCancel={cancelGesture} onLostPointerCapture={cancelGesture}>Move</button>
              {obj.card ? <><h3>{obj.card.title || 'Untitled'}</h3><FreeCardPhoto session={session} card={obj.card} />{(obj.card.body || obj.card.travelerNote) && <p>{obj.card.travelerNote || obj.card.body}</p>}</> : obj.presentation ? <FreeAssetImage session={session} presentation={obj.presentation} rect={shown} /> : null}
              <button type="button" className="m-free-handle resize" disabled={!!obj.presentation?.locked} aria-label={`Resize ${title}`} onFocus={() => setSelected(obj.ref)} onPointerDown={(e) => startGesture(e, obj, 'resize')} onPointerMove={(e) => moveGesture(e, obj)} onPointerUp={(e) => finishGesture(e, obj)} onPointerCancel={cancelGesture} onLostPointerCapture={cancelGesture}>Resize</button>
            </article>;
          })}
        </div>
      </div>
      {artOpen && <Suspense fallback={<p role="status">Opening FCC art…</p>}><ArtworkPicker trip={{ destination: readTripMeta(session.doc), destinations }} onClose={closeArtworkPicker} onInsert={insertBoardArtwork} /></Suspense>}
      {museOpen && <FocusSheet label="Create with Muse Image" onClose={() => setMuseOpen(false)}><Suspense fallback={<p role="status">Opening Muse Image…</p>}><MuseImagePanel session={session} actor={actor as Actor} refresh={refresh} notify={notify} origin={origin} onClose={() => setMuseOpen(false)} /></Suspense></FocusSheet>}
      {openCard && <FocusSheet label={`Card · ${openCard.title || 'Untitled'}`} onClose={() => { setOpenCardId(null); window.setTimeout(() => openTriggerRef.current?.focus(), 0); }}><button type="button" className="m-btn" onClick={() => { setOpenCardId(null); window.setTimeout(() => openTriggerRef.current?.focus(), 0); }}>Close</button><TripCardView whenSaved={props.whenSaved} card={openCard} session={session} actor={actor as Actor} kind={readTripMeta(session.doc).kind} refresh={refresh} notify={notify} updatedSources={props.updatedSources} /></FocusSheet>}
      {openPresentation && <FocusSheet label="Image" onClose={() => { setOpenAssetId(null); window.setTimeout(() => openTriggerRef.current?.focus(), 0); }}><div><button type="button" className="m-btn" onClick={() => { setOpenAssetId(null); window.setTimeout(() => openTriggerRef.current?.focus(), 0); }}>Close</button>{openPresentation.assetId && <AssetLarge session={session} assetId={openPresentation.assetId} />}<p>{openAsset?.caption || 'Image'}</p>{openAsset?.credit && <p>Credit: {openAsset.credit}</p>}</div></FocusSheet>}
    </section>
  );
}
function AssetLarge({ session, assetId }: { session: TripSession; assetId: string }) { const url = useAssetUrl(session, assetId); return url ? <img className="m-free-open-img" src={url} alt="" /> : null; }
export default FreeBoard;

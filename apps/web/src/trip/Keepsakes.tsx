// Keepsakes (predicted build 04): pick a trip photo, write a note, download a real PNG postcard.
import { useEffect, useMemo, useRef, useState } from 'react';
import { POSTCARD, itineraryHtml, memorabiliaHtml, pngWithPrintInfo, readAllCards, readAsset, readCard, readTripMeta, tripParts, type Actor, type TripSession } from '@writers-board/core';
import { Icon, type IconName } from './ui';
import { coverAssetId, useAssetMedia, useAssetUrl } from './trip-assets';
import { cityLabel } from './sample';
import type { SavedStatus } from './trip-store';
import { recordOutcome } from './metrics';
export {MemoryChoice} from './MemoryChoice';

type Template = 'postcard' | 'memory';
const TEMPLATES: { id: Template; name: string; hint: string; icon: IconName }[] = [
  { id: 'postcard', name: 'Postcard', hint: 'Photo with title and note', icon: 'postcard' },
  { id: 'memory', name: 'Memory page', hint: 'Photo with longer notes', icon: 'memory' },
];

const PX_PER_MM = POSTCARD.dpi / 25.4;
const MEMORY_HEIGHT_MM = 210;
const sizeFor = (memory: boolean) => ({ w: Math.round((POSTCARD.widthMm + POSTCARD.bleedMm * 2) * PX_PER_MM), h: Math.round(((memory ? MEMORY_HEIGHT_MM : POSTCARD.heightMm) + POSTCARD.bleedMm * 2) * PX_PER_MM) });

/** Draws the postcard at print size (with bleed). The original photo is never modified. */
export async function renderPostcard(photoUrl: string, heading: string, note: string, tracked: boolean): Promise<{ blob: Blob; photoWidth: number; photoHeight: number }> {
  const size = sizeFor(!tracked);
  const img = new Image();
  img.src = photoUrl;
  await img.decode();
  const canvas = document.createElement('canvas');
  canvas.width = size.w; canvas.height = size.h;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, size.w, size.h);
  const photoH = Math.round(size.h * (tracked ? 0.7 : 0.45));
  const scale = Math.max(size.w / img.naturalWidth, photoH / img.naturalHeight);
  const sw = size.w / scale, sh = photoH / scale;
  ctx.drawImage(img, (img.naturalWidth - sw) / 2, (img.naturalHeight - sh) / 2, sw, sh, 0, 0, size.w, photoH);
  await Promise.all([document.fonts.load("700 96px 'IBM Plex Sans'"), document.fonts.load("400 50px 'IBM Plex Sans'")]);
  ctx.fillStyle = '#000000';
  ctx.font = "700 96px 'IBM Plex Sans', sans-serif";
  if (tracked) ctx.letterSpacing = '22px';
  ctx.fillText(tracked ? heading.toUpperCase() : heading, 110, photoH + 150, size.w - 220);
  ctx.letterSpacing = '0px';
  let lines: string[] = [], fontSize = 50;
  for (; fontSize >= 32; fontSize -= 2) {
    ctx.font = `400 ${fontSize}px 'IBM Plex Sans', sans-serif`;
    lines = [];
    for (const paragraph of note.split('\n')) {
      let line = '';
      for (const word of paragraph.split(/\s+/)) {
        if (ctx.measureText(word).width > size.w - 224) throw new Error('A word is too long for this page. Add a space or shorten it.');
        const candidate = line ? `${line} ${word}` : word;
        if (line && ctx.measureText(candidate).width > size.w - 224) { lines.push(line); line = word; }
        else line = candidate;
      }
      lines.push(line);
    }
    if (photoH + 230 + Math.max(0, lines.length - 1) * fontSize * 1.4 <= size.h - 60) break;
  }
  if (fontSize < 32) throw new Error(tracked ? 'This note needs more room. Choose Memory page or shorten the note.' : 'This note is too long for one page. Shorten it to keep the text readable.');
  lines.forEach((line, i) => ctx.fillText(line, 112, photoH + 230 + i * fontSize * 1.4));
  const raw = await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not draw the postcard.'))), 'image/png'));
  // The file declares 300 dpi, so its physical size is the declared size, and says it is a derivative (MOT-35).
  const png = pngWithPrintInfo(new Uint8Array(await raw.arrayBuffer()), POSTCARD.dpi, 'MOT keepsake: a derivative of the trip photo. The original photo is unchanged.');
  return { blob: new Blob([png as BlobPart], { type: 'image/png' }), photoWidth: img.naturalWidth, photoHeight: img.naturalHeight };
}

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

function PhotoChoice({ session, assetId, selected, onPick, label }: { session: TripSession; assetId: string; selected: boolean; onPick: () => void; label: string }) {
  const url = useAssetUrl(session, assetId);
  return <button type="button" aria-pressed={selected} aria-label={label} onClick={onPick}>{url && <img src={url} alt="" />}</button>;
}

export function Keepsakes({ session, actor, tick, saved, refresh, whenSaved, onExport, onBack, notify }: { session: TripSession; actor: Actor; tick: number; saved: SavedStatus; refresh: () => void; whenSaved: () => Promise<void>; onExport: () => void; onBack: () => void; notify: (m: string) => void }) {
  void tick;
  const meta = readTripMeta(session.doc);
  // Draft identity belongs to the card/output, even when the photograph is reused.
  const photos = useMemo(() => {
    return readAllCards(tripParts(session.doc)).filter((c) => c.scope !== 'private' && c.assetIds.length).map((c) => ({ card: c, assetId: coverAssetId(c)! }))
      .filter(p => /^image\/(png|jpeg|webp|gif|avif)$/.test(readAsset(session.parts,p.assetId)?.mime??''));
  }, [session, tick]);
  const current = photos.find((p) => p.card.id === meta.keepsakeSelection?.cardId) ?? photos.find(p=>p.card.kind==='photo') ?? photos[0];
  const template:Template = meta.keepsakeSelection?.format??'postcard';
  const media = useAssetMedia(session, current?.assetId),url=media.url;
  const draft=current?.card.keepsakes?.[template],editKey=JSON.stringify([meta.boardId,current?.card.id,template]);
  const [rejected,setRejected]=useState<{key:string;text:string;error:string}|null>(null);
  const note=rejected?.key===editKey?rejected.text:draft?.caption??'';
  const [saveFailure,setSaveFailure]=useState('');
  const saveRun=useRef(0);
  useEffect(()=>()=>{saveRun.current++;},[session]);
  const [busy, setBusy] = useState(false);
  const persist=()=>{const run=++saveRun.current;refresh();void whenSaved().then(()=>{if(run===saveRun.current)setSaveFailure('');},error=>{if(run===saveRun.current)setSaveFailure(`${error instanceof Error?error.message:'Storage did not complete.'} Keep this tab open; check save status or download a personal ZIP backup below.`);});};
  const select=(cardId:string,format:Template)=>{try{session.execute(actor,'trip_keepsake_select',{cardId,format});persist();}catch(error){notify(error instanceof Error?error.message:'Could not select that photo.');}};
  const writeCaption=(caption:string)=>{
    if(!current)return;
    try{
      const selection={cardId:current.card.id,format:template};
      session.executeAll(actor,[...(meta.keepsakeSelection?.cardId!==selection.cardId||meta.keepsakeSelection.format!==selection.format?[{command:'trip_keepsake_select',input:selection}]:[]),{command:'trip_keepsake_caption',input:{...selection,caption}}]);
      setRejected(null);persist();
    }
    catch(error){setRejected({key:editKey,text:caption,error:error instanceof Error?error.message:'Could not save this caption.'});}
  };
  const heading = template === 'postcard' ? cityLabel(meta.city) : current?.card.title ?? meta.title;
  const size = sizeFor(template === 'memory');
  const [rendered, setRendered] = useState<{ image: string; blob: Blob; key: string; photoWidth: number; photoHeight: number } | null>(null);
  const [previewError, setPreviewError] = useState('');
  const revision=session.boardRev;
  const previewKey = JSON.stringify([meta.boardId,revision,current?.card.id,current?.assetId,url, heading, note, template]);
  useEffect(() => {
    if (!url) return;
    let live = true;
    const timer = setTimeout(() => {
      void renderPostcard(url, heading, note, template === 'postcard').then(({ blob, photoWidth, photoHeight }) => {
        if (!live || session.boardRev!==revision) return;
        setRendered({ image: URL.createObjectURL(blob), blob, key: previewKey, photoWidth, photoHeight }); setPreviewError('');
      }, (e: unknown) => { if (live) setPreviewError(e instanceof Error ? e.message : 'Could not prepare the preview.'); });
    }, 180);
    return () => { live = false; clearTimeout(timer); };
  }, [session,revision,url, heading, note, template, previewKey]);
  useEffect(() => () => { if (rendered) URL.revokeObjectURL(rendered.image); }, [rendered]);
  const ready = !!url && rendered?.key === previewKey && !previewError && rejected?.key!==editKey;
  const lowResolution = ready && rendered && (rendered.photoWidth < size.w || rendered.photoHeight < size.h * (template === 'postcard' ? .7 : .45));

  const downloadPostcard = () => {
    if (!ready || !rendered || session.boardRev!==revision || !current || readCard(session.parts,current.card.id)?.scope==='private') return;
    setBusy(true);
    try {
      if(meta.keepsakeSelection?.cardId!==current.card.id||meta.keepsakeSelection.format!==template){session.execute(actor,'trip_keepsake_select',{cardId:current.card.id,format:template});persist();}
      const { blob, photoWidth } = rendered;
      download(blob, `${template === 'postcard' ? 'postcard' : 'memory-page'}-${meta.city}.png`);
      recordOutcome('keepsake_created');
      const name = template === 'postcard' ? 'Postcard' : 'Memory page';
      notify(photoWidth < size.w ? `${name} download started. The photo is ${photoWidth}px wide, so a print would look soft.` : `${name} download started`);
    } catch (e) { notify(e instanceof Error ? e.message : 'Could not make the postcard.'); }
    finally { setBusy(false); }
  };
  const openPage = (html: string) => { const u = URL.createObjectURL(new Blob([html], { type: 'text/html' })); window.open(u, '_blank', 'noopener'); setTimeout(() => URL.revokeObjectURL(u), 60_000); };

  return (
    <section className="mot-studio" aria-label="Keepsakes">
      <div className="m-panel mot-studio-controls">
        <h2 className="mot-studio-title">Make it yours.</h2>
        <button type="button" className="m-btn ghost small mot-studio-back" style={{ marginLeft: -14 }} onClick={onBack}><Icon name="chevronLeft" /> Back to board</button>
        <hr className="m-rule" style={{ marginTop: 8 }} />
        <p className="m-eyebrow" style={{ marginBottom: 10 }}>Photo</p>
        {current ? (
          <>
            <div className="mot-photo-main">{url&&<img src={url} alt={current.card.title} />}</div>
            <p className="m-muted mot-original-label t-1" style={{ margin: '8px 0 12px' }}>Current photo · {current.card.title}</p>
            {photos.length > 1 && (
              <div className="mot-photo-pick">
                {photos.map((p) => <PhotoChoice key={p.card.id} session={session} assetId={p.assetId} label={`Use ${p.card.title}`} selected={p.card.id === current.card.id} onPick={() => select(p.card.id,template)} />)}
              </div>
            )}
          </>
        ) : <p className="m-muted">No photos on this board yet. Add one to a card from its ⋮ menu.</p>}
        <label className="m-eyebrow" htmlFor="mot-note" style={{ display: 'block', margin: '22px 0 10px' }}>Note</label>
        <textarea id="mot-note" className="m-field" rows={2} value={note} disabled={!current} onChange={(e) => writeCaption(e.target.value)} />
        {current&&draft?.caption===undefined&&rejected?.key!==editKey&&<p className="m-muted t-1">Optional suggestion: Our first evening on the river. <button type="button" className="m-btn small" onClick={()=>writeCaption('Our first evening on the river.')}>Use suggestion</button></p>}
        {draft?.photoChanged&&<p role="status">Photo changed; review this caption. Edit the note to confirm its wording for this photo.</p>}
        {rejected?.key===editKey&&<p role="alert" className="mot-preview-error">{rejected.error} Your text remains editable here; correct it before leaving.</p>}
        {previewError && <p role="status" className="mot-preview-error">{previewError}</p>}
        <p className="m-eyebrow" style={{ margin: '22px 0 0' }}>Template</p>
        {TEMPLATES.map((t) => (
          <label key={t.id} className="mot-template">
            <input type="radio" name="mot-template" checked={template === t.id} disabled={!current} onChange={() => {if(current)select(current.card.id,t.id);}} />
            <Icon name={t.icon} />
            <span><strong>{t.name}</strong><small>{t.hint}</small></span>
          </label>
        ))}
      </div>

      <div className="m-panel mot-studio-preview">
        <h2 className="m-label">Preview</h2>
        {/* The keepsake develops when its photo or template changes, then is postmarked across the preview's edge (Satori changes 4 and 6). */}
        <div className={`mot-postcard-wrap${template === 'memory' ? ' memory' : ''}`}>
          <figure className={`mot-postcard${template === 'memory' ? ' memory' : ''}`} style={{ margin: 0 }} aria-busy={media.status==='loading'||!!url && !ready}>
            {ready && rendered ? <img key={previewKey} className="reveal" src={rendered.image} alt={`${heading}. ${note}`} /> : <div className="mot-preview-empty">{media.status==='loading'?'Loading the selected photo…':media.status==='missing'?'Selected photo unavailable.':url ? 'Preparing your keepsake…' : 'Choose a photo to begin.'}</div>}
          </figure>
          {ready && <span key={previewKey} className="mot-postmark" aria-hidden="true"><b>{cityLabel(meta.city)}</b><span>300 dpi</span></span>}
        </div>
        <p className="mot-preview-status" role="status">{media.status==='none'?'Choose a photo to begin.':media.status==='loading'?'Loading the selected photo…':media.status==='missing'?'The selected photo bytes are unavailable in this browser. Import a ZIP backup containing the photo, or choose another photo. Your caption stays editable.':previewError ? 'Preview could not be prepared; review the note or restore the photo.' : !ready ? 'Updating preview…' : lowResolution ? 'Digital keepsake · this photo is too small for a sharp print.' : 'Preview matches your download. Original photo unchanged.'}</p>
      </div>

      <div className="m-panel mot-studio-download" style={{ display: 'flex', flexDirection: 'column' }}>
        <h2 className="m-label">Download</h2>
        <hr className="m-rule" style={{ marginTop: 0 }} />
        <strong className="t-3">{template === 'postcard' ? 'Digital postcard' : 'Memory page'}</strong>
        <div className="mot-file"><span className="ic"><Icon name="file" /></span><span className="m-muted">Image file<br />PNG · {POSTCARD.widthMm} × {template === 'postcard' ? POSTCARD.heightMm : MEMORY_HEIGHT_MM} mm with bleed</span></div>
        <div className="mot-download-dock"><button type="button" className="m-btn primary block" disabled={!url || busy || !ready} onClick={() => void downloadPostcard()}>{busy ? 'Drawing…' : template === 'postcard' ? 'Download postcard' : 'Download memory page'}</button><span className="mot-download-hint">PNG · original kept</span></div>
        <button type="button" className="m-btn block" style={{ marginTop: 10 }} onClick={onExport}>Open Export</button>
        <p className="m-muted t-2" style={{ marginTop: 12 }}>Your keepsake is a new file at 300 dpi; the original photo is unchanged. Open Export for your magazine or an editable package, and choose which notes to include.</p>
        <hr className="m-rule" />
        <p className="m-eyebrow" style={{ marginBottom: 8 }}>Trip pages</p>
        <div style={{ display: 'grid', gap: 8 }}>
          <button type="button" className="m-btn small block" onClick={() => openPage(itineraryHtml(session.doc))}>Itinerary page</button>
          <button type="button" className="m-btn small block" onClick={() => openPage(memorabiliaHtml(session.doc))}>Memorabilia page</button>
        </div>
        <hr className="m-rule" />
        <p className="m-muted">Print ordering is not connected yet.</p>
        <div className="mot-done" style={{ marginTop: 'auto', paddingTop: 20 }}>
          <span className="ok" style={saved === 'saved' ? undefined : { background: 'var(--m-red)' }}><Icon name={saved === 'saved' ? 'check' : 'close'} /></span>
          <span><strong>{saved === 'saved' ? 'Saved on this device' : saved === 'error' ? 'Not saved: storage error' : 'Saving…'}</strong></span>
        </div>
        {(saved==='error'||saveFailure)&&<div role="alert"><p>{saveFailure||'Your editable work is in this tab. Check save status or download a personal ZIP backup before closing.'}</p><p>For a personal backup in Export, choose Include private content, then Export package.</p><button type="button" className="m-btn small" onClick={()=>{void whenSaved().then(()=>{setSaveFailure('');notify('Saved on this device');},error=>setSaveFailure(`${error instanceof Error?error.message:'Storage did not complete.'} Your edits remain in this tab. Checking status does not save these edits; download a personal ZIP backup before closing.`));}}>Check save status</button><button type="button" className="m-btn small" onClick={onExport}>Download personal backup</button></div>}
      </div>
    </section>
  );
}

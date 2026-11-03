import { useEffect, useRef, useState } from 'react';
import type * as Y from 'yjs';
import { exportLegacyTripPackage, inspectLegacyTrip, inspectLegacyTripPackage, repairLegacyTrip, type LegacyCardRepair, type LegacyTripInspection } from '@mot/core';
import { listStoredCandidates, persistRepairedTrip, probeTripStore, type OpenTrip } from './trip-store.ts';
import { getTripBlob, hasEphemeralAssets, storeImportedAssets } from './trip-assets';
import './trip-recovery.css';

export interface TripRecoverySource {
  bytes?: Uint8Array;
  originalUpdates?: Uint8Array[];
  fileName?: string;
  fileType?: string;
  boardId?: string;
  storeName?: string;
  context: string;
  error?: string;
  autoInspect?: boolean;
  isPackage?: boolean;
  backupOnly?: boolean;
}

type Candidate = Awaited<ReturnType<typeof listStoredCandidates>>[number];
interface Preview { doc: Y.Doc; repairs: LegacyCardRepair[]; }

function download(bytes: Uint8Array, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type }));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const finite = (v: string) => { const n = Number(v); return v.trim() !== '' && Number.isFinite(n) ? n : null; };
const toBase64 = (bytes: Uint8Array) => { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(s); };

export function TripRecovery({ source, onCancel, onRecovered, onImportFile }: { source: TripRecoverySource; onCancel: () => void; onRecovered: (trip: OpenTrip) => void; onImportFile: (file: File) => void }) {
  const [originalBytes, setOriginalBytes] = useState<Uint8Array | undefined>(source.bytes);
  const [originalUpdates, setOriginalUpdates] = useState<Uint8Array[] | undefined>(source.originalUpdates);
  const [documentBytes, setDocumentBytes] = useState<Uint8Array | undefined>(source.bytes);
  const [inspection, setInspection] = useState<LegacyTripInspection | null>(null);
  const [importedAssets, setImportedAssets] = useState<Map<string, Uint8Array> | undefined>();
  const [isPackage, setIsPackage] = useState(Boolean(source.isPackage));
  const [backupOnly, setBackupOnly] = useState(Boolean(source.backupOnly));
  const [error, setError] = useState<string | undefined>(source.error);
  const [notice, setNotice] = useState<string | undefined>();
  const [coords, setCoords] = useState<Record<string, { x: string; y: string }>>({});
  const [preview, setPreview] = useState<Preview | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [selectedStore, setSelectedStore] = useState<string | undefined>(source.storeName);
  const [busy, setBusy] = useState(false);
  const mounted = useRef(true);
  const generation = useRef(0);
  const isCurrent = (gen: number) => mounted.current && generation.current === gen;
  const acceptController = useRef<AbortController | null>(null);
  const previewRef = useRef<Preview | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const discardPreview = () => { previewRef.current?.doc.destroy(); previewRef.current = null; setPreview(null); };
  const invalidate = () => { generation.current += 1; acceptController.current?.abort(); acceptController.current = null; };
  const cancel = () => { invalidate(); discardPreview(); setBusy(false); onCancel(); };

  const applyInspection = (ins: LegacyTripInspection, docBytes: Uint8Array, orig: Uint8Array, pkg: boolean, assets: Map<string, Uint8Array> | undefined, gen: number) => {
    if (!isCurrent(gen)) return;
    if (source.boardId && ins.meta.boardId !== source.boardId) { discardPreview(); setInspection(null); setDocumentBytes(undefined); setImportedAssets(undefined); setBackupOnly(false); setError(`That copy belongs to board ${ins.meta.boardId}, not ${source.boardId}; it was refused.`); return; }
    discardPreview(); setInspection(ins); setDocumentBytes(docBytes); setOriginalBytes(orig); setIsPackage(pkg); setImportedAssets(assets); setBackupOnly(false);
    setCoords(Object.fromEntries(ins.issues.map((i) => [i.id, { x: String(i.x), y: String(i.y) }])));
  };

  const inspectBytes = async (bytes: Uint8Array, pkgHint: boolean, gen: number, force = false) => {
    if (!isCurrent(gen)) return;
    setError(undefined); setNotice(undefined);
    if (source.backupOnly && !force) { if (isCurrent(gen)) { setBackupOnly(true); setOriginalBytes(bytes); } return; }
    if (pkgHint) {
      try { const r = await inspectLegacyTripPackage(bytes); if (!isCurrent(gen)) return; applyInspection(r.inspection, r.documentBytes, bytes, true, r.assets, gen); return; }
      catch (e) { if (isCurrent(gen)) { setBackupOnly(true); setOriginalBytes(bytes); setError(e instanceof Error ? e.message : 'This ZIP backup could not be validated.'); } return; }
    }
    try { applyInspection(inspectLegacyTrip(bytes), bytes, bytes, false, undefined, gen); return; } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      try { const r = await inspectLegacyTripPackage(bytes); if (!isCurrent(gen)) return; applyInspection(r.inspection, r.documentBytes, bytes, true, r.assets, gen); return; } catch { if (!isCurrent(gen)) return; }
      if (isCurrent(gen)) { setBackupOnly(true); setOriginalBytes(bytes); setError(msg); }
    }
  };

  const inspectStore = async (name: string) => {
    const gen = generation.current + 1; generation.current = gen; acceptController.current?.abort(); acceptController.current = null; discardPreview();
    setSelectedStore(name); setBusy(true); setError(undefined); setNotice(undefined); setInspection(null); setDocumentBytes(undefined); setOriginalBytes(undefined); setOriginalUpdates(undefined); setImportedAssets(undefined); setCoords({});
    try { const r = await probeTripStore(name); if (!isCurrent(gen)) return; if (r.kind === 'absent') throw new Error('That older copy is no longer present.'); await inspectBytes(r.bytes, false, gen, true); }
    catch (e) { if (!isCurrent(gen)) return; const err = e as Error & { original?: Uint8Array; bytes?: Uint8Array; originalUpdates?: Uint8Array[] }; if (err.originalUpdates) setOriginalUpdates(err.originalUpdates); if (err.original ?? err.bytes) setOriginalBytes(err.original ?? err.bytes); setBackupOnly(true); setError(e instanceof Error ? e.message : 'That copy could not be read.'); }
    finally { if (isCurrent(gen)) setBusy(false); }
  };

  useEffect(() => {
    const onPageHide = () => { generation.current += 1; acceptController.current?.abort(); acceptController.current = null; };
    window.addEventListener('pagehide', onPageHide); return () => window.removeEventListener('pagehide', onPageHide);
  }, []);
  useEffect(() => {
    mounted.current = true; const gen = generation.current + 1; generation.current = gen; acceptController.current?.abort(); acceptController.current = null; setBusy(false);
    setOriginalBytes(source.bytes); setOriginalUpdates(source.originalUpdates); setDocumentBytes(source.bytes); setInspection(null); setImportedAssets(undefined); setBackupOnly(Boolean(source.backupOnly)); setError(source.error); setNotice(undefined); setCoords({}); setSelectedStore(source.storeName); discardPreview();
    if (source.bytes && (source.autoInspect || source.backupOnly)) void inspectBytes(source.bytes, Boolean(source.isPackage), gen);
    else if (!source.bytes && source.storeName && source.autoInspect) void inspectStore(source.storeName);
    const boardId = source.boardId, listGeneration = generation.current;
    setCandidates([]);
    if (boardId) void listStoredCandidates(boardId).then((list) => { if (isCurrent(listGeneration)) setCandidates(list); }).catch((error: unknown) => { if (isCurrent(listGeneration)) setError(error instanceof Error ? error.message : 'Could not list saved copies.'); });
    return () => { mounted.current = false; generation.current += 1; acceptController.current?.abort(); acceptController.current = null; previewRef.current?.doc.destroy(); previewRef.current = null; };
  }, [source]);

  const previewRepair = (event: React.FormEvent) => {
    event.preventDefault(); if (!inspection || !documentBytes) return;
    const repairs: LegacyCardRepair[] = [];
    for (const issue of inspection.issues) { const c = coords[issue.id]; const x = c ? finite(c.x) : null; const y = c ? finite(c.y) : null; if (x === null || y === null) { setError(`Enter finite X and Y coordinates for ${issue.id}.`); return; } repairs.push({ id: issue.id, x, y }); }
    try { discardPreview(); const doc = repairLegacyTrip(documentBytes, repairs); const next = { doc, repairs }; previewRef.current = next; setPreview(next); setError(undefined); setNotice(inspection.issues.length === 0 ? 'Preview ready: a schema 3 copy with no coordinate changes.' : 'Preview ready. No saved board has been changed.'); }
    catch (e) { setError(e instanceof Error ? e.message : 'Repair could not be previewed.'); }
  };

  const accept = async () => {
    if (!preview || !inspection || !documentBytes || busy) return;
    const capturedPreview = preview; const capturedInspection = inspection; const capturedBytes = documentBytes; const capturedAssets = importedAssets; const gen = generation.current;
    const controller = new AbortController(); acceptController.current = controller; setBusy(true); setError(undefined);
    try {
      if (capturedAssets) { await storeImportedAssets(capturedPreview.doc, capturedAssets); if (controller.signal.aborted || !isCurrent(gen)) return; if (hasEphemeralAssets(capturedPreview.doc)) throw new Error('Imported image bytes could not be saved on this device. The repaired board was not adopted.'); }
      else if (capturedInspection.assets.length > 0) { const missing: string[] = []; for (const asset of capturedInspection.assets) { if (!(await getTripBlob(asset.hash))) missing.push(asset.id); if (controller.signal.aborted || !isCurrent(gen)) return; } if (missing.length && isCurrent(gen)) setNotice(`Some original image files are not available in this browser (${missing.join(', ')}). Their references are preserved in the repaired document.`); }
      const trip = await persistRepairedTrip(capturedInspection.meta.boardId, capturedPreview.doc, { bytes: capturedBytes, storeName: selectedStore }, controller.signal);
      if (controller.signal.aborted || !isCurrent(gen)) { trip.destroy(); return; }
      if (previewRef.current === capturedPreview) previewRef.current = null; capturedPreview.doc.destroy(); setPreview(null); onRecovered(trip);
    } catch (e) { if (!controller.signal.aborted && isCurrent(gen)) setError(e instanceof Error ? e.message : 'Repair could not be saved.'); }
    finally { if (isCurrent(gen)) setBusy(false); }
  };

  const exportLegacy = async () => {
    if (!inspection || !documentBytes || busy) return; const gen = generation.current; const capturedInspection = inspection; const capturedBytes = documentBytes; const capturedAssets = importedAssets; setBusy(true); setError(undefined);
    try {
      let map: Map<string, Uint8Array>;
      if (capturedAssets) map = capturedAssets;
      else { map = new Map(); for (const asset of capturedInspection.assets) { const blob = await getTripBlob(asset.hash); if (!isCurrent(gen)) return; if (!blob) throw new Error(`Missing image ${asset.id}. Restore its original bytes before exporting.`); map.set(asset.id, new Uint8Array(await blob.arrayBuffer())); if (!isCurrent(gen)) return; } }
      const zip = await exportLegacyTripPackage(capturedBytes, map); if (!isCurrent(gen)) return;
      download(zip, `${capturedInspection.meta.boardId}-legacy.zip`, 'application/zip');
    } catch (e) { if (isCurrent(gen)) setError(e instanceof Error ? e.message : 'Legacy package could not be exported.'); }
    finally { if (isCurrent(gen)) setBusy(false); }
  };

  const fileName = source.fileName ?? (selectedStore || (inspection ? `${inspection.meta.boardId}.yjs` : 'original-backup'));
  const fileType = source.fileType ?? (isPackage ? 'application/zip' : 'Raw Yjs document');
  const originalName = isPackage || fileName.endsWith('.zip') ? fileName : fileName.endsWith('.yjs') ? fileName : `${fileName}.yjs`;

  return (
    <main className="mot trip-recovery-main">
      <div className="m-panel trip-recovery">
        <p className="m-eyebrow">{source.context} · Local recovery only</p>
        <h1>Recover your trip</h1>
        <p className="m-muted">Nothing here contacts a network or a model. Your original is retained unchanged; a separate copy is adopted only after it is durably reopened and you explicitly accept a previewed repair.</p>
        {error && <p role="alert" className="trip-recovery-error">{error}</p>}
        {notice && <p role="status">{notice}</p>}
        <div className="trip-recovery-actions">
          {originalBytes && <button type="button" className="m-btn" onClick={() => download(originalBytes, originalName, isPackage ? 'application/zip' : 'application/octet-stream')}>Download original backup</button>}
          {originalUpdates && <button type="button" className="m-btn" onClick={() => download(new TextEncoder().encode(JSON.stringify({ updates: originalUpdates.map(toBase64) })), 'raw-update-sequence.json', 'application/json')}>Raw update sequence backup; does not include image files</button>}
          <button type="button" className="m-btn" disabled={busy} onClick={() => { invalidate(); discardPreview(); fileRef.current?.click(); }}>Import ZIP</button>
          <input ref={fileRef} type="file" accept=".zip,application/zip" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onImportFile(f); }} />
          <button type="button" className="m-btn" onClick={cancel}>Cancel recovery</button>
        </div>
        {originalBytes && <p className="m-muted t-2">Original file: {fileName} · {fileType}. {isPackage ? 'Original ZIP backup; this is the exact file or package received.' : 'Raw document backup; does not include image files.'}</p>}
        {originalUpdates && <p className="m-muted t-2">Raw update sequence backup; does not include image files. {originalUpdates.length === 0 || originalUpdates.every((u) => u.byteLength === 0) ? 'This store is empty.' : 'This contains every raw update in sequence; no single update is presented as a complete backup.'}</p>}
        {backupOnly && <p>This copy cannot be repaired or relabelled here. Download the original backup above{isPackage ? '' : ''} and keep it safe.</p>}
        {candidates.length > 0 && (
          <section aria-label="Older copies on this device">
            <h2 className="t-3">Older copies on this device</h2>
            <p className="m-muted t-2">Older copies are never opened automatically. Inspect one only if you choose it.</p>
            {candidates.map((c) => <div key={c.name} className="trip-recovery-candidate"><span>{c.label}</span><button type="button" className="m-btn small" disabled={busy} onClick={() => void inspectStore(c.name)}>Inspect this older copy</button></div>)}
          </section>
        )}
        {inspection && (
          <>
            <section aria-label="Trip inspection">
              <h2 className="t-3">{inspection.meta.title}</h2>
              <p className="m-muted">Schema {inspection.version} · Board {inspection.meta.boardId} · {inspection.cards.length} cards · {inspection.assets.length} assets · {inspection.presentations.length} presentations</p>
              {inspection.issues.length > 0 ? <ul>{inspection.issues.map((i) => <li key={i.id}><strong>{i.id}</strong>: rectangle {i.x}–{i.x + i.width}, {i.y}–{i.y + i.height} (1200×900). {i.reason}</li>)}</ul> : <p role="status">No geometry issues found.</p>}
              <details className="trip-recovery-details"><summary>Inspect trip contents</summary>
                <div>{inspection.cards.map((card) => <article key={card.id}><h3>{card.title}</h3><p className="m-muted t-2">{card.id} · {card.stage} · x {card.x} · y {card.y} · scope {card.scope}</p><p>{card.body}</p>{card.source && <pre>{JSON.stringify(card.source, null, 2)}</pre>}</article>)}</div>
                <pre>{JSON.stringify(inspection, null, 2)}</pre>
              </details>
            </section>
            {!backupOnly && (
              <form onSubmit={previewRepair}>
                {inspection.issues.map((issue) => (
                  <div key={issue.id} className="trip-recovery-coords">
                    <strong>{issue.id}</strong>
                    <label>X <input className="m-field" disabled={busy} aria-label={`X for ${issue.id}`} required inputMode="decimal" value={coords[issue.id]?.x ?? ''} onChange={(e) => { discardPreview(); setCoords((old) => ({ ...old, [issue.id]: { x: e.target.value, y: old[issue.id]?.y ?? '' } })); }} /></label>
                    <label>Y <input className="m-field" disabled={busy} aria-label={`Y for ${issue.id}`} required inputMode="decimal" value={coords[issue.id]?.y ?? ''} onChange={(e) => { discardPreview(); setCoords((old) => ({ ...old, [issue.id]: { x: old[issue.id]?.x ?? '', y: e.target.value } })); }} /></label>
                  </div>
                ))}
                <div className="trip-recovery-actions"><button type="submit" className="m-btn primary" disabled={busy}>{inspection.issues.length === 0 ? 'Preview copy' : 'Preview repair'}</button><button type="button" className="m-btn" disabled={busy} onClick={() => void exportLegacy()}>Export legacy package</button></div>
              </form>
            )}
            {preview && (
              <section aria-label="Repair preview">
                <h2 className="t-3">Repair preview</h2>
                <p>Schema {inspection.version} → 3. Only the listed coordinates change; no other fields change.</p>
                <p className="m-muted t-2">The preview viewport can clip rectangles; the full textual coordinates above and below remain visible.</p>
                {preview.repairs.length === 0 ? <p>No coordinate changes.</p> : <ul>{preview.repairs.map((r) => { const old = inspection.cards.find((c) => c.id === r.id)!; return <li key={r.id}>{r.id}: rectangle {old.x}–{old.x + 1200}, {old.y}–{old.y + 900} → {r.x}–{r.x + 1200}, {r.y}–{r.y + 900}</li>; })}</ul>}
                <svg className="trip-recovery-svg" viewBox="0 0 10000 10000" role="img" aria-label="Static geometry preview">{inspection.issues.map((i) => <rect key={`o-${i.id}`} x={i.x} y={i.y} width="1200" height="900" fill="none" stroke="var(--m-red)" strokeWidth="80" />)}{preview.repairs.map((r) => <rect key={`n-${r.id}`} x={r.x} y={r.y} width="1200" height="900" fill="none" stroke="green" strokeWidth="80" />)}</svg>
                <div className="trip-recovery-actions"><button type="button" className="m-btn primary" disabled={busy} onClick={() => void accept()}>Accept repair</button><button type="button" className="m-btn" disabled={busy} onClick={discardPreview}>Discard preview</button></div>
              </section>
            )}
          </>
        )}
      </div>
    </main>
  );
}

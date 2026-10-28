import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {diagnosticText,readTripMeta,type DiagnosticReceipt,type MagazineDocument,type OperationState,type TripSession} from '@writers-board/core';
import {artifactInventory,createTripArtifact,downloadArtifact,forgetTripArtifact,prepareMagazine,restoreTripArtifact,type ArtifactProgress,type ExportArtifact} from './artifacts';
import {listArtifacts,type ArtifactScope,type StoredArtifact} from './artifact-store';
import {Icon} from './ui';
import type {TripArtifact} from './agentApi';
import '@fontsource/ibm-plex-serif/400.css';
import '@fontsource/ibm-plex-serif/600.css';
import './export.css';

type Format='pdf'|'zip';
type Output={status:'idle'|'running'|'done'|'failed'|'cancelled';progress:Partial<Record<ArtifactProgress['stage'],ArtifactProgress>>;operation?:OperationState;artifact?:ExportArtifact;message?:string;diagnostic?:DiagnosticReceipt;};
const initial=():Output=>({status:'idle',progress:{}});
const steps:Record<Format,Record<ArtifactProgress['stage'],string>>={pdf:{collect:'Gather the art',layout:'Lay out the pages',write:'Write the PDF',verify:'Read it back'},zip:{collect:'Collect board, layout and notes',layout:'Copy art and credits',write:'Write the ZIP',verify:'Read it back'}};
const stages=['collect','layout','write','verify'] as const;
const scopeLabel=(scope:ArtifactScope)=>scope==='personal'?'Personal · includes private content':scope==='guide'?'Guide only':'Shared trip copy';
const bytes=(size:number)=>size<1024?`${size.toLocaleString()} bytes`:`${(size/1024/1024>=1?size/1024/1024:size/1024).toFixed(1)} ${size/1024/1024>=1?'MB':'KB'} · ${size.toLocaleString()} bytes`;
function useSvgUrl(svg?:string){const[url,setUrl]=useState<string>();useEffect(()=>{if(!svg){setUrl(undefined);return;}const next=URL.createObjectURL(new Blob([svg],{type:'image/svg+xml'}));setUrl(next);return()=>URL.revokeObjectURL(next);},[svg]);return url;}

export interface ExportScreenProps {session:TripSession;tick:number;onBack?:()=>void;notify?:(message:string)=>void;onExported?:(artifact:TripArtifact)=>void;}
export function ExportScreen({session,tick,onBack,notify,onExported}:ExportScreenProps){
  const[includePrivate,setIncludePrivate]=useState(false),[sharedVariant,setSharedVariant]=useState<'guide'|'stay'>('stay');
  const scope:ArtifactScope=includePrivate?'personal':sharedVariant;
  const[outputs,setOutputs]=useState<Record<Format,Output>>({pdf:initial(),zip:initial()}),[magazine,setMagazine]=useState<MagazineDocument>(),[previewBusy,setPreviewBusy]=useState(false),[previewError,setPreviewError]=useState(false),[saved,setSaved]=useState<StoredArtifact[]>([]),[storageUnavailable,setStorageUnavailable]=useState(false);
  const controllers=useRef<Partial<Record<Format,AbortController>>>({}),alive=useRef(true);
  const meta=readTripMeta(session.doc),inventory=useMemo(()=>artifactInventory(session.doc,scope),[session,tick,scope]);
  const cover=useSvgUrl(magazine?.pages[0]?.svg),second=useSvgUrl(magazine?.pages[1]?.svg);
  const receiptCover=useSvgUrl(outputs.pdf.artifact?.coverSvg);
  const busy=Object.values(outputs).some(output=>output.status==='running');
  const refreshSaved=useCallback(async()=>{try{const records=await listArtifacts(session.boardId);if(alive.current){setSaved(records);setStorageUnavailable(false);}return records;}catch{if(alive.current)setStorageUnavailable(true);return[];}},[session]);
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;Object.values(controllers.current).forEach(controller=>controller?.abort());};},[session]);
  useEffect(()=>{
    let current=true;setOutputs({pdf:initial(),zip:initial()});
    void refreshSaved().then(async records=>{for(const format of ['pdf','zip'] as const){const record=records.find(record=>record.format===format&&record.scope===scope);if(!record)continue;try{const artifact=await restoreTripArtifact(record.id);if(current&&alive.current)setOutputs(previous=>previous[format].status==='idle'?{...previous,[format]:{status:'done',artifact,progress:{}}}:previous);}catch{/* A failed checksum is never called a ready file. */}}});
    return()=>{current=false;};
  },[session,scope,refreshSaved]);
  useEffect(()=>{
    const controller=new AbortController();setPreviewBusy(true);setPreviewError(false);setMagazine(undefined);
    void prepareMagazine(session,controller.signal,includePrivate,{variant:scope}).then(value=>{if(!controller.signal.aborted)setMagazine(value);}).catch(()=>{if(!controller.signal.aborted)setPreviewError(true);}).finally(()=>{if(!controller.signal.aborted)setPreviewBusy(false);});
    return()=>controller.abort();
  },[session,tick,scope,includePrivate]);
  const update=(format:Format,change:Partial<Output>)=>{if(alive.current)setOutputs(previous=>({...previous,[format]:{...previous[format],...change}}));};
  const run=async(format:Format)=>{
    const controller=new AbortController();controllers.current[format]=controller;update(format,{status:'running',progress:{},artifact:undefined,message:undefined,diagnostic:undefined});
    const current=()=>alive.current&&controllers.current[format]===controller;
    try{
      const artifact=await createTripArtifact(session,format,controller.signal,{includePrivate,variant:scope,onProgress:progress=>{if(current())setOutputs(previous=>({...previous,[format]:{...previous[format],progress:{...previous[format].progress,[progress.stage]:progress}}}));},onState:operation=>{if(current())update(format,{operation});},onDiagnostic:diagnostic=>{if(current())update(format,{diagnostic});}});
      if(current()){update(format,{status:'done',artifact,diagnostic:artifact.storageDiagnostic});onExported?.(artifact);void refreshSaved();}
    }catch(error){if(current())update(format,{status:controller.signal.aborted?'cancelled':'failed',message:controller.signal.aborted?'Cancelled. Your board is unchanged.':error instanceof Error?error.message:'The export could not finish. Your board is unchanged.'});}
    finally{if(controllers.current[format]===controller)delete controllers.current[format];}
  };
  const copy=async(receipt:DiagnosticReceipt)=>{try{await navigator.clipboard.writeText(diagnosticText(receipt));notify?.('Diagnostic receipt copied. Nothing was sent anywhere.');}catch{notify?.('Select the diagnostic receipt below and copy it.');}};
  const remove=async(id:string)=>{try{await forgetTripArtifact(id);setOutputs(previous=>({pdf:previous.pdf.artifact?.id===id?initial():previous.pdf,zip:previous.zip.artifact?.id===id?initial():previous.zip}));await refreshSaved();notify?.('Export removed from this browser. Your trip board is unchanged.');}catch{notify?.('The kept file could not be removed. Try again.');}};
  const restore=async(id:string)=>{try{downloadArtifact(await restoreTripArtifact(id));}catch{notify?.('This kept file could not be read. Make a fresh export from your board.');}};
  const card=(format:Format)=>{
    const output=outputs[format],artifact=output.artifact,pdf=format==='pdf';
    const readyCover=pdf?receiptCover:undefined,shownInventory=artifact?.inventory??inventory;
    return <article className="mot-export-output" aria-label={pdf?'Magazine PDF':'Editable package'} key={format}>
      <div className="mot-export-object">{pdf?<div className="mot-export-magstack">{(readyCover??cover)?<div className="mot-export-mini"><img src={readyCover??cover} alt={`Cover of ${meta.title}`} /></div>:<div className="mot-export-empty-cover"><Icon name="doc" /><span>{previewBusy?'Preparing your cover…':previewError?'Cover preview unavailable':'Add content to make a magazine'}</span></div>}{second&&(!artifact||artifact.revision===session.boardRev)&&<div className="mot-export-mini mot-export-mini-back"><img src={second} alt="Second page preview" /></div>}</div>:<div className="mot-export-package" aria-label="Actual package inventory"><strong>{artifact?.filename??`${meta.title}.mot.zip`}</strong><span>trip.json<em>{shownInventory.cards} cards</em></span><span>layout.json<em>{shownInventory.placements} placements</em></span><span>assets/<em>{shownInventory.assets} files</em></span><span>Notes in trip.json<em>{shownInventory.notes}</em></span><span>Credited assets<em>{shownInventory.credits}</em></span></div>}</div>
      <div className="mot-export-body"><h2>{pdf?'Magazine':'Editable package'} <small>{pdf?'PDF · A5 magazine':'ZIP · reopens offline'}</small></h2><p>{pdf?'Your trip as an art-first issue. The preview and PDF use the same pages.':'Your board, layout, notes, selected images and source credits. Reopen it in MoT, even offline.'}</p></div>
      <div className="mot-export-act">
        {output.status!=='idle'&&output.status!=='done'&&<ol className="mot-export-steps" aria-label={`${pdf?'PDF':'Package'} progress`} aria-live="polite">{stages.map(stage=>{const progress=output.progress[stage],working=progress&&!progress.done,failed=working&&output.status==='failed';return<li className={progress?.done?'done':failed?'bad':working?'now':''} key={stage}><span className="mot-export-circle">{progress?.done?<Icon name="check" />:failed?'!':''}</span><span>{steps[format][stage]}</span><em>{progress?.total!==undefined?`${progress.completed.toLocaleString()} of ${progress.total.toLocaleString()} ${progress.unit}`:working?'Working…':''}</em></li>;})}</ol>}
        {output.status==='running'?<button type="button" className="m-btn" onClick={()=>controllers.current[format]?.abort()}>Cancel {pdf?'PDF':'package'}</button>:output.status==='done'&&artifact?<>
          <div className="mot-export-ticket"><span className="mot-export-stamp">Ready</span><dl><dt>File</dt><dd>{artifact.filename}</dd><dt>Type</dt><dd>{artifact.mime}</dd><dt>Size</dt><dd>{bytes(artifact.byteCount)}</dd><dt>Revision</dt><dd>r{artifact.revision} · {artifact.boardId}</dd><dt>Made</dt><dd>{new Date(artifact.createdAt).toLocaleString()}</dd><dt>Copy</dt><dd>{scopeLabel(artifact.scope)}</dd><dt>SHA-256</dt><dd className="mot-export-hash" title={artifact.sha256}>{artifact.sha256}</dd></dl></div>
          <div className="mot-export-states"><div className="mot-export-state"><span className="mot-export-circle"><Icon name="check" /></span><span>Download ready<small>The file exists; its bytes were read back.</small></span><button className="m-btn small primary" type="button" onClick={()=>downloadArtifact(artifact)}>Download</button></div><div className={`mot-export-state${artifact.kept?'':' no'}`}><span className="mot-export-circle">{artifact.kept?<Icon name="check" />:'!'}</span><span>{artifact.kept?'Kept in this browser':'Not kept in this browser'}<small>{artifact.kept?'Available below after reload, until you remove it.':'Download it before closing this tab. Your board is unchanged.'}</small></span></div></div>
          {artifact.revision!==session.boardRev&&<p className="mot-export-note">This file is from r{artifact.revision}. Export again to include the current r{session.boardRev}.</p>}
          <details className="mot-export-agent"><summary>For agents · the same real artifact</summary><pre>{JSON.stringify({artifactId:artifact.id,filename:artifact.filename,type:artifact.mime,bytes:artifact.byteCount,sha256:artifact.sha256,boardId:artifact.boardId,revision:artifact.revision,createdAt:artifact.createdAt,scope:artifact.scope,downloadReady:true,keptInBrowser:artifact.kept,url:artifact.url,urlLifetime:'This tab; recreated from kept bytes after reload'},null,2)}</pre></details>
          <div className="mot-export-actions"><button className="m-btn small ghost" type="button" onClick={()=>void run(format)}>Export again</button><button className="m-btn small ghost" type="button" onClick={()=>void remove(artifact.id)}>Remove file</button></div>
        </>:<>
          {pdf&&output.status==='idle'&&<p className="mot-export-mode">Digital <span>A5 pages · no filler</span></p>}
          {output.message&&<div className="mot-export-notice" role="status"><strong>{output.status==='cancelled'?'Export cancelled':'Export stopped'}</strong><p>{output.message}</p></div>}
          <button type="button" className="m-btn ink" onClick={()=>void run(format)}><Icon name="file" />{output.status==='failed'?'Try again':output.status==='cancelled'?'Start again':`Export ${pdf?'PDF':'package'}`}</button>
        </>}
        {output.diagnostic&&<details className="mot-export-agent"><summary>Diagnostic receipt · no private content</summary><pre>{diagnosticText(output.diagnostic)}</pre><button className="m-btn small" type="button" onClick={()=>void copy(output.diagnostic!)}>Copy diagnostic receipt</button></details>}
      </div>
    </article>;
  };
  return <section className="mot-export" aria-label="Export your trip"><header className="mot-export-heading"><div>{onBack&&<button type="button" className="m-btn small ghost" onClick={onBack}><Icon name="chevronLeft" />Back to board</button>}<h1>Export</h1><p>Two things you can take away. Each is a real file with a receipt.</p></div></header>
    <div className="mot-export-privacy"><label><input type="checkbox" checked={includePrivate} disabled={busy} onChange={event=>setIncludePrivate(event.target.checked)} />Include private content</label>{!includePrivate&&<label>Shared copy <select aria-label="Export copy scope" value={sharedVariant} disabled={busy} onChange={event=>setSharedVariant(event.target.value as 'guide'|'stay')}><option value="stay">Trip · guide and stay</option><option value="guide">Guide only</option></select></label>}<p>{includePrivate?'A personal keepsake containing your private material. Check the file before sharing.':'Shared by default: private cards, layers and their media are excluded.'}</p></div>
    <div className="mot-export-outputs">{card('pdf')}{card('zip')}</div>
    <section className="mot-export-kept" aria-label="Kept exports"><h2>Kept in this browser</h2><p>These are exported files. Removing one leaves your trip board and its original media unchanged.</p>{storageUnavailable?<p className="mot-export-note">Export storage is unavailable. New files can still be downloaded from this tab.</p>:saved.length?<ul>{saved.map(record=><li key={record.id}><Icon name="file" /><span><strong>{record.filename}</strong><small>{scopeLabel(record.scope)} · r{record.revision} · {new Date(record.createdAt).toLocaleString()} · {bytes(record.byteCount)}</small></span><button className="m-btn small" type="button" onClick={()=>void restore(record.id)}>Download</button><button className="m-btn small ghost" type="button" onClick={()=>void remove(record.id)}>Remove</button></li>)}</ul>:<p className="mot-export-note">No exported files have been kept for this board yet.</p>}</section>
  </section>;
}

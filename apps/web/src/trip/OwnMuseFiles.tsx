import {useEffect,useRef,useState} from 'react';
import {FileExchange,FILE_BYTES,GUIDE_VERSION,guidanceMarkdown,readAllCards,readAsset,readCard,readTripMeta,TRIP_COMMANDS,type Actor,type ContextRequest,type FileProposalRecord,type FileReceipt,type FileReview,type ProposalOp,type TripSession} from '@writers-board/core';
import type {OpenTrip} from './trip-store';
import {FocusSheet} from './ui';
import {IndexeddbFileExchangeStore,getFileDocumentIdentity} from './file-exchange-store';
import {downloadFileBytes,fileContractText,fileHandoffBundle} from './file-handoff';
import {getTripBlob} from './trip-assets';
import {publicCatalogueReader} from '../artwork/public-catalogue-browser';
import './own-muse-files.css';
export interface OwnMuseFilesProps {session:TripSession;open:OpenTrip;actor:Actor;tick:number;active:boolean;onClose:()=>void;onExport:()=>void;refresh:()=>void;whenSaved:()=>Promise<void>;hasPendingNativeProposalId:(id:string)=>boolean;}
const encoder=new TextEncoder();
const text=(value:unknown)=>value===undefined?'Not set':value===null?'Clear':typeof value==='string'?value:JSON.stringify(value,null,2);
const errorText=(error:unknown)=>error instanceof Error?error.message:'The local file action could not finish.';
const ALLOWED=['trip_card_create','trip_card_update','trip_card_move','trip_task_set_status'] as const;

export function fileOperationDiff(session:TripSession,op:ProposalOp):{label:string;fields:{name:string;before:unknown;after:unknown}[]}{
 const id=op.input.id??op.input.cardId,card=typeof id==='string'?readCard(session.parts,id):undefined;
 if(op.command==='trip_asset_attach'){const asset=op.input.asset as {id:string};return{label:`Attach image to ${card?.title??String(id)}`,fields:[{name:'assetIds',before:card?.assetIds??[],after:[...new Set([...(card?.assetIds??[]),asset.id])]}]};}
 const fields=Object.entries(op.input).filter(([name])=>name!=='id'&&name!=='cardId').map(([name,after])=>({name,before:card?(card as unknown as Record<string,unknown>)[name]:undefined,after}));
 if(op.command==='trip_card_create'){
  const definition=TRIP_COMMANDS.find(command=>command.name===op.command)!;const normalized=definition.input.parse(op.input) as Record<string,unknown>;
  return{label:'Create a new '+String(op.input.kind??'card'),fields:[...Object.entries(normalized).map(([name,after])=>({name,before:undefined,after})),{name:'scope (native default)',before:undefined,after:readTripMeta(session.doc).kind==='host_guide'?'private':'stay'}]};
 }
 return{label:`${op.command==='trip_card_move'?'Move':op.command==='trip_task_set_status'?'Set task status for':'Update'} ${card?.title??String(id)}`,fields};
}
export async function importOwnProposalFile(file:Pick<File,'size'|'arrayBuffer'>,service:{importProposal:(bytes:Uint8Array)=>Promise<FileReview>},signal:AbortSignal):Promise<FileReview>{
 signal.throwIfAborted();if(file.size>FILE_BYTES)throw new Error('Proposal exceeds the 512 KiB limit. Choose the returned JSON file.');
 const buffer=await file.arrayBuffer();signal.throwIfAborted();if(buffer.byteLength>FILE_BYTES)throw new Error('Proposal exceeds the 512 KiB limit.');
 const review=await service.importProposal(new Uint8Array(buffer));signal.throwIfAborted();return review;
}

export function OwnMuseFiles(props:OwnMuseFilesProps){
 const {session,open,actor,active,tick}=props;void tick;
 const current=useRef(props);current.current=props;
 const engine=useRef<FileExchange|null>(null),owner=useRef<TripSession|null>(null),controller=useRef<AbortController|null>(null),run=useRef(0);
 const [ready,setReady]=useState(false),[initialization,setInitialization]=useState('Opening this browser’s local file journal…');
 const [snapshot,setSnapshot]=useState(''),[snapshotError,setSnapshotError]=useState(''),[attempt,setAttempt]=useState(0);
 const [selected,setSelected]=useState<string[]>([]),[constraints,setConstraints]=useState('');
 const [issued,setIssued]=useState<{context:ContextRequest;bytes:Uint8Array}|null>(null),[review,setReview]=useState<FileReview|null>(null),[chosen,setChosen]=useState<number[]>([]);
 const [journal,setJournal]=useState<FileProposalRecord[]>([]),[receipt,setReceipt]=useState<FileReceipt|null>(null),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState<string|null>(null),[paste,setPaste]=useState('');
 const [diffs,setDiffs]=useState<ReturnType<typeof fileOperationDiff>[]>([]),[revoked,setRevoked]=useState<string[]>([]);
 const meta=readTripMeta(session.doc),cards=readAllCards(session.parts).filter(card=>card.scope!=='private'),record=journal.find(item=>item.proposalId===review?.proposalId&&item.envelopeHash===review.envelopeHash);
 const selectedUnavailable=selected.some(id=>!cards.some(card=>card.id===id)),sameSession=owner.current===session,usable=ready&&sameSession;
 const validIssue=issued&&sameSession&&!revoked.includes(issued.context.contextRequestId)&&issued.context.baseBoardRevision===session.boardRev&&Date.parse(issued.context.expiresAt)>Date.now();
 const stale=!!record&&record.revision!==session.boardRev,canApply=!!record&&!revoked.includes(record.contextRequestId)&&['review','persisted'].includes(record.state)&&!stale;
 const canUndo=!!review&&!!record?.applied.length&&['persisted','applied-in-memory'].includes(record.state)&&session.canUndo('proposal:'+review.proposalId);
 const visible=(token:number)=>current.current.active&&run.current===token&&owner.current===current.current.session;
 const close=()=>{run.current++;controller.current?.abort();setBusy(null);props.onClose();};
 useEffect(()=>{
  let live=true,created:FileExchange|null=null;engine.current=null;owner.current=null;setReady(false);setReview(null);setIssued(null);setSelected([]);setReceipt(null);setJournal([]);setDiffs([]);setRevoked([]);setError('');setInitialization('Opening this browser’s local file journal…');
  void getFileDocumentIdentity(open.persistence).then(async identity=>{
   if(!live)return;
   created=new FileExchange(session,actor,new IndexeddbFileExchangeStore(),{documentIdentity:identity,readDocumentIdentity:()=>getFileDocumentIdentity(open.persistence,false),whenSaved:()=>current.current.whenSaved(),hasPendingNativeProposalId:id=>current.current.hasPendingNativeProposalId(id),hasAssetBytes:async id=>{const asset=readAsset(session.parts,id);return!!asset&&!!await getTripBlob(asset.hash);}});
   engine.current=created;owner.current=session;const records=await created.inspect();if(live){setJournal(records);setReady(true);setInitialization('Local journal ready.');}
  }).catch(cause=>{if(live)setInitialization(errorText(cause)+' Download a personal ZIP backup or use another supported browser.');});
  return()=>{live=false;run.current++;controller.current?.abort();created?.cancel();};
 },[session,open,actor.id,actor.kind]);
 useEffect(()=>{
  if(!active){run.current++;controller.current?.abort();setBusy(null);return;}
  const abort=new AbortController();setSnapshotError('');
  void publicCatalogueReader.manifest(abort.signal).then(manifest=>{if(!abort.signal.aborted)setSnapshot(manifest.snapshotId);},cause=>{if(!abort.signal.aborted)setSnapshotError(errorText(cause)+' New requests need a known snapshot. Already issued proposals can still be imported locally.');});
  if(engine.current&&owner.current===session)void engine.current.inspect().then(records=>{if(!abort.signal.aborted)setJournal(records);}).catch(cause=>{if(!abort.signal.aborted)setError(errorText(cause));});
  return()=>abort.abort();
 },[active,attempt,session]);
 const action=async(label:string,work:(service:FileExchange,abort:AbortController,token:number)=>Promise<void>)=>{
  if(!engine.current||!usable||busy)return;const token=++run.current,abort=new AbortController();controller.current?.abort();controller.current=abort;setBusy(label);setError('');setNotice('');
  try{await work(engine.current,abort,token);}catch(cause){props.refresh();try{const records=await engine.current.inspect();if(visible(token))setJournal(records);}catch{/* Preserve the original failure and require inspection/reissue. */}if(visible(token)&&!abort.signal.aborted)setError(errorText(cause)+' Inspect the journal and current board; keep a personal backup. Reissue context for further changes.');}
  finally{if(visible(token))setBusy(null);}
 };
 const prepare=()=>void action('Preparing context',async(service,_abort,token)=>{
  const result=await service.issue({selectedCardIds:[...selected],allowedCommands:[...ALLOWED],guideVersion:GUIDE_VERSION,catalogSnapshot:snapshot,constraints:constraints?constraints.split('\n'):[]});
  if(visible(token)){setIssued(result);setNotice('Context issued durably. Inspect its exact JSON, then download only if you want to share it.');}
 });
 const imported=async(service:FileExchange,result:FileReview,token:number)=>{const before=result.envelope.proposal.ops.map(op=>fileOperationDiff(session,op)),records=await service.inspect();if(visible(token)){if(review?.envelopeHash!==result.envelopeHash)setDiffs(before);setReview(result);setChosen([]);setReceipt(null);setJournal(records);setNotice('Imported for human review. No changes are selected or applied by importing.');}};
 const importFile=(file:File)=>void action('Validating proposal',async(service,abort,token)=>{await imported(service,await importOwnProposalFile(file,service,abort.signal),token);});
 const importPaste=()=>void action('Validating pasted proposal',async(service,abort,token)=>{
  if(paste.length>FILE_BYTES)throw new Error('Proposal exceeds the 512 KiB limit.');const bytes=encoder.encode(paste);if(bytes.length>FILE_BYTES)throw new Error('Proposal exceeds the 512 KiB UTF-8 limit.');abort.signal.throwIfAborted();const result=await service.importProposal(bytes);abort.signal.throwIfAborted();await imported(service,result,token);
 });
 const mutate=(kind:'apply'|'save'|'undo'|'reject'|'revoke',contextRequestId?:string)=>void action(kind==='apply'?'Applying selected changes':kind==='save'?'Checking persistence':kind==='undo'?'Undoing this proposal':kind==='reject'?'Rejecting proposal':'Revoking context',async(service,abort,token)=>{
  let result:FileReceipt|undefined;
  if(kind==='revoke'){if(!contextRequestId)throw new Error('No context is selected.');await service.revoke(contextRequestId);if(owner.current===session)setRevoked(value=>[...new Set([...value,contextRequestId])]);}
  else{if(!review)throw new Error('Import a valid proposal first.');if(kind==='apply')result=await service.apply(review,[...chosen],abort.signal);else if(kind==='save')result=await service.retryPersistence(review);else if(kind==='undo')result=await service.undo(review);else await service.reject(review);}
  props.refresh();const records=await service.inspect();if(visible(token)){setJournal(records);setChosen([]);if(result)setReceipt(result);setNotice(result?`${kind==='undo'?'Proposal Undo completed.':kind==='save'?'Persistence checked without applying changes.':`${result.appliedOps} changes applied in this action.`} ${result.persisted?'Saved on this device.':'Not confirmed saved; keep a personal backup.'}`:kind==='revoke'?'Context revoked. Reissue before proposing further work.':'Proposal rejected. Its ID remains reserved.');}
 });
 const reissue=()=>{setReview(null);setIssued(null);setChosen([]);setReceipt(null);setError('');setNotice('Review the current trip and issue a fresh context. Existing proposal reservations remain in the journal.');};
 const download=(bytes:Uint8Array,name:string,mime?:string)=>{if(current.current.active){downloadFileBytes(bytes,name,mime);setNotice('Download started. Share the file with your own Muse explicitly.');}};
 if(!active)return null;
 return <FocusSheet label="Use your own Muse with files" onClose={close}><div className="m-panel mot-own-files">
  <header><div><h2>Use your own Muse with files</h2><p className="m-muted">Use the Muse account and file tools you already have. Nothing is uploaded automatically.</p></div><button type="button" className="m-icon-btn" aria-label="Close file exchange" onClick={close}>×</button></header>
  <p role="status">{initialization}{busy?` · ${busy}…`:''}</p>
  <section aria-label="Context to share"><h3>1. Choose the exact context</h3><p>Trip: <strong>{meta.title}</strong> · city {meta.cityId??'not registered'} · timezone {meta.timeZone??'unknown'}.</p><p className="m-muted">The file includes this trip title, city, timezone, selected card IDs, titles and bodies, board/revision/token bindings, your request and a maximum 24-hour expiry. Private and unselected cards, captions, booking/access fields, history, household records and image bytes are excluded. Read the exact text before sharing; remove any sensitive information from shared card text.</p>
   <fieldset disabled={!!busy}><legend>Cards to include · {selected.length} chosen</legend>{cards.length?cards.map(card=><div className="mot-own-file-card" key={card.id}><label><input type="checkbox" checked={selected.includes(card.id)} onChange={event=>setSelected(value=>event.target.checked?[...value,card.id]:value.filter(id=>id!==card.id))}/><strong>{card.title||'Untitled'}</strong> · {card.scope}</label><details><summary>Read exact card text</summary><pre>{card.body}</pre><small>Card ID: {card.id}</small></details></div>):<p>No shared cards. You can request new text ideas using the trip details and constraints alone.</p>}</fieldset>
   {selectedUnavailable&&<p role="alert">A selected item is no longer available for sharing. Clear the selection and review the current cards.</p>}{selectedUnavailable&&<button type="button" className="m-btn small" onClick={()=>setSelected([])}>Clear selection</button>}
   <label>Request or constraints<textarea className="m-field" rows={3} value={constraints} disabled={!!busy} onChange={event=>setConstraints(event.target.value)}/></label><p className="m-muted">One request or constraint per line, up to 50 lines of 512 characters. This text-only route permits proposed card creation, text edits, moves and task status; no image reference or media fetch is authorized.</p>
   <p className="m-muted">Catalogue snapshot: {snapshot||'not loaded'}. Only its small manifest is read here.</p>{snapshotError&&<p role="alert">{snapshotError}</p>}<button type="button" className="m-btn small" disabled={!!busy} onClick={()=>setAttempt(value=>value+1)}>Refresh snapshot manifest</button>
   <button type="button" className="m-btn ink" disabled={!usable||!!busy||!snapshot||!meta.cityId||selectedUnavailable} onClick={prepare}>Issue selected context</button>
   {issued&&sameSession&&<div className="mot-own-file-issued"><p>Request {issued.context.contextRequestId} · base r{issued.context.baseBoardRevision} · expires {issued.context.expiresAt}</p><details><summary>Inspect exact issued JSON before download</summary><pre>{new TextDecoder().decode(issued.bytes)}</pre></details>{!validIssue&&<p role="alert">This context is stale, expired or revoked. Issue fresh context; no old file will be downloaded.</p>}<div className="mot-own-file-actions"><button type="button" className="m-btn primary" disabled={!validIssue||!!busy} onClick={()=>{if(validIssue)download(fileHandoffBundle(issued.bytes),'mot-muse-context.zip','application/zip');}}>Download context ZIP</button><button type="button" className="m-btn" disabled={!validIssue||!!busy} onClick={()=>{if(validIssue)download(issued.bytes,'mot-context.json');}}>Download context JSON</button><button type="button" className="m-btn small" disabled={!!busy} onClick={()=>mutate('revoke',issued.context.contextRequestId)}>Revoke context</button></div></div>}
   <div className="mot-own-file-actions"><button type="button" className="m-btn small" onClick={()=>download(encoder.encode(guidanceMarkdown()),'TRIP-GUIDE.md','text/markdown')}>Download guide · {GUIDE_VERSION}</button><button type="button" className="m-btn small" onClick={()=>download(encoder.encode(fileContractText()),'mot-proposal.schema.json','application/schema+json')}>Download schema</button></div><p className="m-muted">The ZIP includes context, guide, schema and instructions. You upload it yourself. If a hosted guide is older, use the bundled version and verify its version/hash.</p>
  </section>
  <section aria-label="Import proposal"><h3>2. Bring the proposal back</h3><label className="mot-own-file-upload">Import proposal file<input type="file" accept=".json,application/json,text/plain,application/octet-stream" disabled={!usable||!!busy} onChange={event=>{const file=event.target.files?.[0];event.target.value='';if(file)importFile(file);}}/></label><p className="m-muted">Return the JSON file to this original browser/profile. Maximum 512 KiB. A file's name, type and author are not permission to apply it. Import remains local and can use already issued requests while offline.</p><details><summary>Paste complete proposal JSON</summary><label>Complete JSON<textarea className="m-field" rows={6} value={paste} disabled={!!busy} onChange={event=>setPaste(event.target.value)}/></label><button type="button" className="m-btn small" disabled={!usable||!!busy||!paste.trim()} onClick={importPaste}>Validate pasted JSON</button></details></section>
  {review&&sameSession&&<section aria-label="Review file proposal"><h3>3. Review and choose changes</h3><p>Proposal {review.proposalId} · author label: {review.envelope.proposal.author} (untrusted) · {record?.state??'journal unavailable'}</p><p>{review.envelope.proposal.reason}</p><p className="m-muted">Nothing is selected by default. Review before/after fields and full operation details. All selected changes pass the native validator together.</p>{stale&&<p role="alert">The trip changed outside this receipt. Reissue context; no silent rebase is available.</p>}
   <ol className="mot-own-file-ops">{review.envelope.proposal.ops.map((op,index)=>{const diff=diffs[index]??fileOperationDiff(session,op),done=record?.applied.includes(index)??false;return <li key={index}><label><input type="checkbox" checked={done||chosen.includes(index)} disabled={done||!!busy||!canApply} onChange={event=>setChosen(value=>event.target.checked?[...value,index]:value.filter(i=>i!==index))}/><strong>{index+1}. {diff.label}</strong>{done?(record?.state==='undone'?' · undone':' · already applied'):''}</label><table><thead><tr><th>Field</th><th>Before</th><th>After</th></tr></thead><tbody>{diff.fields.map(field=><tr key={field.name}><th>{field.name}</th><td><pre>{text(field.before)}</pre></td><td><pre>{text(field.after)}</pre></td></tr>)}</tbody></table><details><summary>Full operation details</summary><pre>{JSON.stringify(op,null,2)}</pre></details></li>;})}</ol>
   <div className="mot-own-file-actions"><button type="button" className="m-btn primary" disabled={!canApply||!chosen.length||!!busy} onClick={()=>mutate('apply')}>Apply {chosen.length} selected changes</button><button type="button" className="m-btn" disabled={!canUndo||!!busy} onClick={()=>mutate('undo')}>Undo this proposal</button><button type="button" className="m-btn small" disabled={record?.state!=='review'||!!busy} onClick={()=>mutate('reject')}>Reject proposal</button><button type="button" className="m-btn small" disabled={!!busy} onClick={()=>mutate('revoke',review.envelope.contextRequestId)}>Revoke its context</button></div>
   {receipt&&<div role="status"><p>{receipt.persisted?'Saved on this device.':'Current state is not confirmed saved.'} {receipt.message}</p><p>{receipt.remainingOps} operations remain · receipt r{receipt.boardRev}.</p>{receipt.state==='applied-in-memory'&&<button type="button" className="m-btn small" disabled={!!busy} onClick={()=>mutate('save')}>Check persistence only</button>}</div>}
   <p className="m-muted">Undo is available only while this live session retains its trusted proposal stack. Closing this sheet retains it; reloading or importing a native package does not transfer Undo or local issuance grants.</p>
  </section>}
  {notice&&<p role="status">{notice}</p>}{error&&<p role="alert" className="mot-preview-error">{error}</p>}
  <div className="mot-own-file-actions"><button type="button" className="m-btn" disabled={!!busy} onClick={reissue}>Start fresh context</button><button type="button" className="m-btn" onClick={()=>{close();props.onExport();}}>Open personal backup export</button>{busy&&<button type="button" className="m-btn" onClick={()=>{run.current++;controller.current?.abort();setBusy(null);setError('Action cancelled. Inspect the journal before reissuing; uncertain work is never replayed.');}}>Stop current action</button>}</div>
  <details className="mot-own-file-journal"><summary>Inspect local journal · {journal.length} reservations</summary><p>Read-only history. An old receipt alone does not authorize Apply or Undo after reload. Uncertain intent, incomplete save or changed identity requires inspection and reissue.</p>{journal.map(item=><details key={item.proposalId}><summary>{item.proposalId} · {item.state} · {item.applied.length} applied</summary><pre>{JSON.stringify(item,null,2)}</pre></details>)}</details>
 </div></FocusSheet>;
}

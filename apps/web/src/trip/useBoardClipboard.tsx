import { useEffect, useRef, useState } from 'react';
import { captureBoardClipboard, type Actor, type SameBoardCopyRef, type TripSession } from '@mot/core';
import { captureClipboardTransfer, keepLocalBoardCopy, parseClipboardTransfer, pasteClipboardTransfer, readLocalBoardCopy, type ClipboardTransfer } from './board-clipboard-transfer';
interface Context { session:TripSession;actor:Actor;view:string;origin:()=>{x:number;y:number};refresh:()=>void;notify:(message:string)=>void; }
export function useBoardClipboard({session,actor,view,origin,refresh,notify}:Context) {
  const [copy,setCopy]=useState<{label:string;images:number;transfer?:ClipboardTransfer}|null>(null);
  const [paste,setPaste]=useState<{transfer:ClipboardTransfer;revision:number;origin:{x:number;y:number}}|null>(null);
  const [busy,setBusy]=useState<'copy'|'paste'|'saving'|'reading'|null>(null),[error,setError]=useState<string|null>(null);
  const [local,setLocal]=useState(readLocalBoardCopy);
  const context=useRef<object|null>(null),flight=useRef<AbortController|null>(null);
  const heading=useRef<HTMLHeadingElement>(null),trigger=useRef<HTMLElement|null>(null);
  const copyOpen=!!copy,pasteOpen=!!paste;
  useEffect(()=>{if(copyOpen||pasteOpen)heading.current?.focus();else if(trigger.current?.isConnected)trigger.current.focus();},[copyOpen,pasteOpen]);
  useEffect(()=>{const token={};context.current=token;setCopy(null);setPaste(null);setBusy(null);setError(null);setLocal(readLocalBoardCopy());return()=>{context.current=null;flight.current?.abort();};},[session,actor,view]);
  const cancel=()=>{flight.current?.abort();flight.current=null;setCopy(null);setPaste(null);setBusy(null);setError(null);};
  const begin=()=>{flight.current?.abort();const controller=new AbortController();flight.current=controller;const token=context.current;return{controller,current:()=>context.current===token&&flight.current===controller&&!controller.signal.aborted};};
  const report=(e:unknown)=>setError(e instanceof Error?e.message:'The board copy failed. Nothing was added.');
  const openCopy=async(ref:SameBoardCopyRef)=>{
    trigger.current=document.activeElement as HTMLElement;
    const {controller,current}=begin();setPaste(null);setError(null);
    try{
      const graph=captureBoardClipboard(session,ref);setCopy({label:graph.label,images:graph.assets.length});setBusy('copy');
      const transfer=await captureClipboardTransfer(graph,controller.signal);if(!current())return;setCopy({label:graph.label,images:graph.assets.length,transfer});
    }catch(e){if(current())report(e);}finally{if(current())setBusy(null);}
  };
  const retain=(transfer:ClipboardTransfer)=>{keepLocalBoardCopy(transfer);setLocal(transfer);};
  const systemCopy=()=>{
    const transfer=copy?.transfer;if(!transfer)return;
    // Prepared before this click: native write starts inside this informed user gesture.
    const {current}=begin();retain(transfer);setBusy('copy');setError(null);
    let pending:Promise<void>;
    try{if(!navigator.clipboard?.writeText)throw new Error('Clipboard unavailable');pending=navigator.clipboard.writeText(transfer.text);}catch(e){pending=Promise.reject(e);}
    void pending.then(()=>{if(current()){setCopy(null);notify('Copied to the system clipboard. The private in-app copy is also ready.');}},()=>{if(current()){setError('System clipboard access was denied. Your copy is kept in this app: switch trips, then Paste → Use in-app copy.');}}).finally(()=>{if(current())setBusy(null);});
  };
  const preview=(transfer:ClipboardTransfer)=>{trigger.current=document.activeElement as HTMLElement;cancel();setPaste({transfer,revision:session.boardRev,origin:origin()});};
  const handleText=(text:string):boolean=>{try{const transfer=parseClipboardTransfer(text);if(!transfer)return false;preview(transfer);return true;}catch(e){cancel();report(e);return true;}};
  const readSystem=async()=>{
    const {current}=begin();setBusy('reading');setError(null);
    try{if(!navigator.clipboard?.readText)throw new Error('Clipboard unavailable');const text=await navigator.clipboard.readText();if(!current())return;if(!handleText(text))setError('No board copy on the system clipboard. Use the in-app copy, or paste ordinary text below.');}
    catch{if(current())setError('System clipboard access is unavailable. Use the in-app copy, or focus the canvas and paste with your keyboard. Plain text and image files also work.');}finally{if(current())setBusy(null);}
  };
  const accept=async()=>{
    if(!paste||busy)return;const pinned=paste,{controller,current}=begin();setBusy('paste');setError(null);
    try{
      const result=await pasteClipboardTransfer(session,actor,pinned.transfer,controller.signal,{...pinned.origin,expectedRevision:pinned.revision,isCurrent:current,onCommitted:()=>{if(current()){setBusy('saving');refresh();}}});
      if(!current())return;setPaste(null);refresh();notify(result.persisted?'Private copy added to this trip':'Private copy is in this tab only. Try a personal ZIP backup before closing; package limits still apply.');
    }catch(e){if(current())report(e);}finally{if(current())setBusy(null);}
  };
  const counts=(t:ClipboardTransfer)=>`${t.graph.cards.length+t.graph.presentations.length} item(s), ${t.graph.assets.length} image record(s), including source images`;
  const panels=<>
    {error&&<p className="m-free-error" role="alert">{error}</p>}
    {copy&&<div className="m-free-panel" role="region" aria-label="Copy to another trip">
      <h3 ref={heading} tabIndex={-1} style={{overflowWrap:'anywhere'}}>Copy “{copy.label}” to another trip</h3><p>{copy.images} image record(s), including source images. The destination copy will be private.</p>
      <p>Copying to the system clipboard includes the selected notes and full original/source images, including cropped-out content and embedded metadata. Other apps may read this clipboard.</p>
      <p>Keep in this app avoids the system clipboard and stays available while you switch trips in this tab. A new copy replaces the previous in-app copy.</p>
      {busy==='copy'&&!copy.transfer&&<p role="status">Preparing original images…</p>}
      <button type="button" className="m-btn" disabled={!copy.transfer||!!busy} onClick={systemCopy}>Copy to system clipboard</button>
      <button type="button" className="m-btn" disabled={!copy.transfer||!!busy} onClick={()=>{retain(copy.transfer!);setCopy(null);notify('Copy kept in this app. Switch trips, then Paste → Use in-app copy.');}}>Keep in this app</button>
      <button type="button" className="m-btn" disabled={busy==='copy'&&!!copy.transfer} onClick={cancel}>Cancel copy</button>
    </div>}
    {paste&&<div className="m-free-panel" role="region" aria-label="Preview private board copy">
      <h3 ref={heading} tabIndex={-1} style={{overflowWrap:'anywhere'}}>Add “{paste.transfer.graph.label}”?</h3><p>{counts(paste.transfer)}. Everything added will be private.</p>
      <p>Source attribution and imported observations are unverified copied data. Bookings, confirmed facts and sharing permissions are excluded. The source trip stays unchanged.</p>
      <button type="button" className="m-btn primary" disabled={!!busy} onClick={()=>void accept()}>Add private copy</button>
      <button type="button" className="m-btn" disabled={busy==='saving'} onClick={cancel}>Cancel paste</button>
      {busy&&<p role="status">{busy==='saving'?'Saving original images…':'Checking original images…'}</p>}
    </div>}
  </>;
  const pasteControls=<div className="m-free-toolbar" role="group" aria-label="Board clipboard sources">
    {busy==='reading'&&<p role="status">Reading system clipboard…</p>}
    <button type="button" className="m-btn" disabled={!!busy} onClick={()=>void readSystem()}>Read system clipboard</button>
    <button type="button" className="m-btn" disabled={!local||!!busy} onClick={()=>{const ready=readLocalBoardCopy();if(ready)preview(ready);}}>Use in-app copy</button>
    {local&&<><p>In-app copy: {local.graph.label} · {counts(local)}</p><button type="button" className="m-btn" disabled={!!busy} onClick={()=>{keepLocalBoardCopy(null);setLocal(null);}}>Clear in-app copy</button></>}
  </div>;
  return{openCopy,handleText,panels,pasteControls,cancel};
}

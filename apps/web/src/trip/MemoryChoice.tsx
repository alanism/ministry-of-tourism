// WP9 uses the existing HTML page and native package; original photos and source notes stay intact.
import {useEffect,useRef,useState} from 'react';
import {encodeTrip,loadTrip,memoryShortlist,memorabiliaHtml,presentationScope,readAllCards,readAsset,readPresentations,readTripMeta,reusableArt,reviewKeepsakePages,sha256Hex,TRIP_PACKAGE_LIMITS,type Actor,type PageProblem,type Reaction,type TripSession} from '@writers-board/core';
import {getTripBlob,useAssetUrl} from './trip-assets';
import {createTripArtifact,downloadArtifact} from './artifacts';
import {dayLabel} from './sample';
import type {SavedStatus} from './trip-store';

function MemoryPhoto({session,assetId}:{session:TripSession;assetId?:string}){const url=useAssetUrl(session,assetId);return url?<img src={url} alt=""/>:null;}
const dataUrl=(blob:Blob)=>new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(new Error('The photo could not be read.'));reader.readAsDataURL(blob);});

export function MemoryChoice({session,actor,tick,saved,notify,refresh,whenSaved}:{session:TripSession;actor:Actor;tick:number;saved:SavedStatus;notify:(m:string)=>void;refresh:()=>void;whenSaved:()=>Promise<void>}){
 const reactions=readTripMeta(session.doc).memoryWorkflow?.reactions??{},shortlist=memoryShortlist(session,{reactions,limit:500}),art=reusableArt(session),chosen=shortlist.items.map(i=>i.cardId);
 const [limit,setLimit]=useState(12),[problems,setProblems]=useState<PageProblem[]|null>(null),[failure,setFailure]=useState(''),[html,setHtml]=useState(''),[busy,setBusy]=useState<'check'|'zip'|'page'|null>(null),[receipt,setReceipt]=useState<{filename:string;bytes:number;sha256:string}|null>(null);
 const run=useRef(0),controller=useRef<AbortController|null>(null);
 useEffect(()=>{run.current++;controller.current?.abort();setBusy(null);setProblems(null);setHtml('');setReceipt(null);return()=>{run.current++;controller.current?.abort();};},[session,tick]);
 const react=(ops:{cardId:string;reaction:Reaction|null}[])=>{
  try{session.executeAll(actor,ops.map(input=>({command:'trip_memory_react',input})));refresh();void whenSaved().catch(()=>notify('Your choice is in this tab. Download a ZIP package to keep it.'));}
  catch(error){setFailure(error instanceof Error?error.message:'The choice could not be saved.');}
 };
 const prepare=async(preview:boolean)=>{
  const token=++run.current,revision=session.boardRev,abort=new AbortController();controller.current?.abort();controller.current=abort;setBusy(preview?'page':'check');setFailure('');setHtml('');setReceipt(null);
  const doc=loadTrip(encodeTrip(session.doc));
  try{
   const cards=readAllCards(session.parts).filter(c=>chosen.includes(c.id)),placements=readPresentations(session.parts).filter(p=>presentationScope(session.parts,p)!=='private'&&(!p.cardId||chosen.includes(p.cardId)));
   const ids=new Set([...cards.flatMap(c=>c.assetIds),...placements.flatMap(p=>p.assetId?[p.assetId]:[])]),media=new Map<string,string>();let bytes=0;
   for(const id of ids){
    abort.signal.throwIfAborted();const asset=readAsset(session.parts,id),blob=asset?await getTripBlob(asset.hash):null;if(!asset||!blob)continue;
    bytes+=blob.size;if(blob.size>TRIP_PACKAGE_LIMITS.fileBytes||bytes>TRIP_PACKAGE_LIMITS.totalBytes)throw new Error('These images exceed the portable page limit. Choose fewer photos.');
    if(!/^image\/(png|jpeg|webp|gif|avif)$/.test(blob.type)||await sha256Hex(new Uint8Array(await blob.arrayBuffer()))!==asset.hash)throw new Error('A photo failed its checksum or format check. Restore the original and retry.');
    const image=await createImageBitmap(blob);try{if(!image.width||!image.height)throw new Error('A photo could not be decoded.');}finally{image.close();}
    media.set(id,await dataUrl(blob));
   }
   abort.signal.throwIfAborted();if(token!==run.current||revision!==session.boardRev)return;
   const checked=reviewKeepsakePages(session,{cardIds:chosen,hasBytes:id=>media.has(id)});setProblems(checked.problems);
   if(preview){if(checked.problems.some(p=>p.kind==='missing_image'))throw new Error('Restore missing photos or skip those memories before opening the page.');setHtml(memorabiliaHtml(doc,new Set(),new Set(chosen),media));}
  }catch(error){if(token===run.current&&!abort.signal.aborted)setFailure(`${error instanceof Error?error.message:'The page could not be checked.'} Your board is unchanged.`);}
  finally{doc.destroy();if(token===run.current)setBusy(null);}
 };
 const keep=async()=>{
  const token=++run.current,revision=session.boardRev,abort=new AbortController();controller.current?.abort();controller.current=abort;setBusy('zip');setFailure('');setReceipt(null);
  try{const artifact=await createTripArtifact(session,'zip',abort.signal,{variant:'stay'});abort.signal.throwIfAborted();if(token!==run.current||revision!==session.boardRev)return;downloadArtifact(artifact);setReceipt({filename:artifact.filename,bytes:artifact.byteCount,sha256:artifact.sha256});}
  catch(error){if(token===run.current&&!abort.signal.aborted)setFailure(`${error instanceof Error?error.message:'The package could not be made.'} Your board is unchanged; restore the missing item or retry.`);}
  finally{if(token===run.current)setBusy(null);}
 };
 return <section className="mot-memories" aria-label="Memories">
  <div className="m-panel mot-memory-main">
   <h2 className="mot-studio-title">Choose your memories.</h2><p className="m-muted t-2">A first list from your own photos and notes. Keep, maybe or skip each one; imperfect photos are welcome. Private cards stay out.</p>
   {!shortlist.items.length?<p>No photos or notes to choose from yet. Add one to a card, and it appears here.</p>:<ul className="mot-memory-list" aria-label="Memory shortlist">{shortlist.items.slice(0,limit).map(item=><li key={item.cardId} className="mot-memory">
    <MemoryPhoto session={session} assetId={item.assetId}/><strong>{item.title||'Untitled'}</strong>{item.note&&<p>{item.note}</p>}<p className="m-muted t-1">{item.why}{item.day?` · ${dayLabel(item.day)}`:''}</p>
    <div role="group" aria-label={`Reaction to ${item.title||'this memory'}`}>{(['keep','maybe','skip'] as const).map(reaction=><button key={reaction} type="button" className="m-btn small" aria-pressed={item.reaction===reaction} onClick={()=>react([{cardId:item.cardId,reaction}])}>{reaction[0]!.toUpperCase()+reaction.slice(1)}</button>)}</div>
   </li>)}</ul>}
   {shortlist.items.length>limit&&<button type="button" className="m-btn small" onClick={()=>setLimit(n=>n+12)}>Show more memories</button>}
   {!!shortlist.skipped.length&&<button type="button" className="m-btn small" onClick={()=>react(shortlist.skipped.map(cardId=>({cardId,reaction:null})))}>Show {shortlist.skipped.length} skipped</button>}
  </div>
  <aside className="m-panel mot-memory-side" aria-label="Keep your memories">
   <p className="m-label">Art you already have</p>{art.length?<ul>{art.map(a=><li key={a.assetId}><MemoryPhoto session={session} assetId={a.assetId}/>{a.credit??'Credit not recorded'} · {a.origin}</li>)}</ul>:<p className="m-muted">No FCC art or maps on this trip yet. Add some from Add, then FCC art.</p>}
   <hr className="m-rule"/><p className="m-label">Check the pages</p><button type="button" className="m-btn small block" disabled={!chosen.length||!!busy} onClick={()=>void prepare(false)}>{busy==='check'?'Checking…':'Check for problems'}</button>
   {problems&&(problems.length?<ul role="status" aria-label="Page problems">{problems.map(p=><li key={`${p.kind}:${p.ids.join(',')}`}>{p.detail}</li>)}</ul>:<p role="status">No missing images, likely clipping, wrong dates or overlaps found. Open the page to review its actual appearance.</p>)}
   <button type="button" className="m-btn small block" disabled={!chosen.length||!!busy} onClick={()=>void prepare(true)}>{busy==='page'?'Opening…':'Open memory page'}</button>
   <hr className="m-rule"/><p className="m-label">Keep them</p><p className="m-muted">The ZIP backs up all permitted trip photos, notes, layout and memory choices, including skipped memories. The page shows your current shortlist.</p>
   <button type="button" className="m-btn primary block" disabled={!!busy} onClick={()=>void keep()}>{busy==='zip'?'Making the package…':'Download ZIP package'}</button>
   {receipt&&<p role="status">Downloaded {receipt.filename} · {receipt.bytes.toLocaleString()} bytes · sha256 {receipt.sha256.slice(0,12)}…. Reopen with Import ZIP.</p>}
   {failure&&<p role="alert" className="mot-preview-error">{failure}</p>}
   <p className="m-muted">{saved==='saved'?'Your board is saved on this device.':saved==='error'?'Not saved on this device: download the package to keep your work.':'Saving your board…'} Sharing and shop links stay optional.</p>
  </aside>
  {html&&<section className="mot-memory-preview" aria-label="Memory page preview"><h3>Review your memory page</h3><iframe title="Memory page" sandbox="" srcDoc={html}/><button type="button" className="m-btn small" onClick={()=>setHtml('')}>Close memory page</button></section>}
 </section>;
}

import {useEffect,useRef,useState} from 'react';
import {applyProposal,readAllCards,readTripMeta,STAGES,undoProposal,type Actor,type FccCityContent,type TripSession} from '@writers-board/core';
import {browserFcc,citySlug} from './FccBrowser';
import {requestMuseProposal,type MusePhase} from './muse-client';
import type {Ghost} from './ProposalReview';
import './muse-plan.css';
type Result=Awaited<ReturnType<typeof requestMuseProposal>>;
interface Props {
 session:TripSession;actor:Actor;content?:FccCityContent;onAvailability:(available:boolean)=>void;onState:(label:string)=>void;onGhosts:(ghosts:Ghost[])=>void;
 refresh:()=>void;onClose:()=>void;notify:(message:string,action?:{label:string;run:()=>void})=>void;
}
const date=(value?:string)=>value?new Date(value).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}):'date not supplied';
export function MusePlan({session,actor,content,onAvailability,onState,onGhosts,refresh,onClose,notify}:Props){
 const meta=readTripMeta(session.doc),cityId=meta.cityId??citySlug(meta.city),cards=readAllCards(session.parts);
 const [runtime,setRuntime]=useState<{available:boolean;reason?:string;modelId?:string;adapter?:string}>({available:false,reason:'Checking the connection…'});
 const [issue,setIssue]=useState<FccCityContent>(),[issueState,setIssueState]=useState('Loading this city’s FCC issue…'),[attempt,setAttempt]=useState(0);
 const [prompt,setPrompt]=useState('Suggest a trip plan using this city’s FCC issue and my selected notes.'),[selected,setSelected]=useState<string[]>([]);
 const [phase,setPhase]=useState<MusePhase|'idle'>('idle'),[elapsed,setElapsed]=useState(0),[result,setResult]=useState<Result>(),[error,setError]=useState('');
 const [chosen,setChosen]=useState<number[]>([]),[applied,setApplied]=useState<number[]>([]);
 const controller=useRef<AbortController|undefined>(undefined),heading=useRef<HTMLHeadingElement>(null),errorMessage=useRef<HTMLParagraphElement>(null);
 const busy=phase!=='idle'&&phase!=='ready',test=runtime.adapter==='test',label=test?'Test adapter · not Muse':busy?`Muse working · ${elapsed}s`:runtime.available?'Muse · connected':'Muse off · manual-only';
 const full=issue?.articles.filter(a=>a.body.trim()).length??0,total=issue?.articles.length??0,grounding=!issue?'unavailable':total&&full===total?'full-issue':'catalogue-only';
 const selectedCount=cards.filter(c=>c.scope!=='private'&&selected.includes(c.id)).length,stale=!!result&&session.boardRev!==result.revision;
 const citation=(index:number)=>{const source=result?.proposal.ops[index]?.input.source as {id?:string}|undefined;return issue?.articles.find(a=>a.source.id===source?.id);};
 useEffect(()=>{const previous=document.activeElement as HTMLElement|null;heading.current?.focus();return()=>{controller.current?.abort();onGhosts([]);previous?.focus();};},[]);
 useEffect(()=>{onState(label);},[label,onState]);
 useEffect(()=>{if(error){errorMessage.current?.scrollIntoView({block:'nearest'});errorMessage.current?.focus({preventScroll:true});}},[error]);
 useEffect(()=>{if(!busy)return;const start=Date.now();setElapsed(0);const timer=setInterval(()=>setElapsed(Math.floor((Date.now()-start)/1000)),1000);return()=>clearInterval(timer);},[busy]);
 useEffect(()=>{
  const abort=new AbortController();
  void fetch('/api/muse/status',{signal:abort.signal}).then(async response=>{if(!response.ok)throw Error();const value=await response.json();if(!abort.signal.aborted){const available=value.available===true&&typeof value.modelId==='string';setRuntime({available,reason:typeof value.reason==='string'?value.reason:undefined,modelId:available?value.modelId:undefined,adapter:value.adapter==='test'?'test':undefined});onAvailability(available);}}).catch(()=>{if(!abort.signal.aborted){setRuntime({available:false,reason:'Muse is not connected. Board, FCC, art and export still work.'});onAvailability(false);}});
  return()=>abort.abort();
 },[session,onAvailability]);
 useEffect(()=>{
  const abort=new AbortController();controller.current?.abort();controller.current=undefined;setPhase('idle');setResult(undefined);setApplied([]);setSelected([]);setError('');setIssue(undefined);setIssueState('Loading this city’s FCC issue…');
  if(content?.city.id===cityId){setIssue(content);setIssueState('Saved FCC issue');return()=>abort.abort();}
  void browserFcc.getCity(cityId,{signal:abort.signal,offline:!navigator.onLine}).then(loaded=>{if(abort.signal.aborted)return;if(loaded.status==='unavailable'){setIssueState(loaded.reason);return;}setIssue(loaded.value);setIssueState(loaded.status==='ready'?'FCC issue loaded':loaded.status==='stale'?'Saved issue · refresh failed':'Offline · saved issue');});
  return()=>abort.abort();
 },[session,cityId,attempt,content]);
 useEffect(()=>{
  onGhosts(!result||stale?[]:result.proposal.ops.flatMap((op,index)=>{
   if(op.command!=='trip_card_create'||applied.includes(index))return [];
   const source=citation(index),stage=STAGES.find(s=>s===op.input.stage)??'plan';
   return[{index:1000+index,stage,title:String(op.input.title??'Suggestion'),body:String(op.input.body??''),label:test?'Test adapter · not added':'Muse · not added',citation:source?{title:source.title,url:source.source.canonicalUrl}:undefined,review:()=>document.getElementById('muse-choice-'+index)?.focus()}];
  }));
 },[result,stale,applied,onGhosts,test]);
 const ask=async()=>{
  if(controller.current||!runtime.available||prompt.length>8000||!prompt.trim())return;
  const abort=new AbortController();controller.current=abort;setError('');setResult(undefined);setApplied([]);setPhase('sending');
  try{
   const answer=await requestMuseProposal(session,{prompt,cardIds:selected},issue,abort.signal,fetch,value=>{if(controller.current===abort)setPhase(value);});
   if(controller.current!==abort||abort.signal.aborted)return;
   setResult(answer);setChosen(answer.proposal.ops.map((_,index)=>index));
  }catch(cause){if(controller.current===abort)setError(abort.signal.aborted?'Stopped. Nothing changed; a late answer will not be added.':cause instanceof Error?cause.message:'The request failed. Nothing changed. Try again.');}
  finally{if(controller.current===abort){controller.current=undefined;setPhase('idle');}}
 };
 const stop=()=>{controller.current?.abort();controller.current=undefined;setPhase('idle');setError('Stopped. Nothing changed; a late answer will not be added.');};
 const undo=(id:string)=>{undoProposal(session,id);setResult(undefined);setApplied([]);refresh();notify('Muse suggestions undone.');};
 const add=()=>{if(!result||stale||!chosen.length)return;try{const receipt=applyProposal(session,actor,result.proposal,chosen);setApplied(value=>[...value,...chosen]);setChosen([]);setResult({...result,revision:session.boardRev});refresh();notify(`Added ${receipt.appliedOps} suggestions.`,{label:'Undo',run:()=>undo(result.proposal.id)});}catch(cause){setError(cause instanceof Error?cause.message:'Nothing was added. Ask again.');}};
 return <aside className="m-panel mot-muse-plan" role="dialog" aria-label="Ask Muse" onKeyDown={event=>{if(event.key==='Escape'){event.stopPropagation();onClose();}}}>
  <header><div><h2 ref={heading} tabIndex={-1}>{result?'Review suggestions':'Ask Muse'}</h2><p className="mot-muse-meta">{label}{runtime.available&&runtime.modelId?` · ${runtime.modelId}`:''}</p></div><button type="button" className="m-icon-btn" aria-label="Close Ask Muse" onClick={onClose}>×</button></header>
  <div className="mot-muse-body">
   {error&&<p ref={errorMessage} tabIndex={-1} role="alert" className="mot-muse-warning">{error}</p>}
   {!runtime.available&&<div className="mot-muse-notice" role="status"><strong>Muse off · manual-only</strong><p>{runtime.reason??'Not connected on this server.'}</p><p>Board, FCC, art and export remain available.</p></div>}
   {busy?<div role="status"><h3>{test?'Test adapter working':'Working'} · {elapsed}s</h3><ol className="mot-muse-steps">{[['Send the request','sending'],['Waiting for the answer','waiting'],['Check against your board','validating'],['Ready to review','ready']].map(([title,key])=><li key={key} aria-current={phase===key?'step':undefined}>{title}{phase===key?' · now':''}</li>)}</ol><p className="m-muted">These are the steps the app can observe. Your board stays editable. Stop prevents a late answer from being added.</p></div>:result?<>
    <div className={'mot-muse-grounding '+(result.grounding==='full-issue'?'':'catalogue')}><h3>{result.grounding==='full-issue'?`From the full issue: ${total} FCC stories supplied in full`:result.grounding==='catalogue-only'?'Catalogue-only: built from titles and available text':'No FCC issue: suggestions are not issue-grounded'}</h3><p>Suggestions are not bookings or checked facts. Nothing is added until you choose it.</p></div>
    {stale?<div role="alert" className="mot-muse-notice"><strong>Your board changed</strong><p>Revision {result.revision} became {session.boardRev}. Nothing more was added. Ask again for the current board.</p></div>:<ol className="mot-muse-proposals" aria-label="Suggestions">{result.proposal.ops.map((op,index)=>{const source=citation(index),added=applied.includes(index);return <li key={index}>
     <label><input id={'muse-choice-'+index} type="checkbox" disabled={added} checked={added||chosen.includes(index)} onChange={e=>setChosen(value=>e.target.checked?[...value,index]:value.filter(i=>i!==index))}/><span><strong>{String(op.input.title??cards.find(c=>c.id===op.input.id)?.title??'Trip change')}</strong><span className="mot-muse-meta">→ {String(op.input.stage??'plan')} · {added?'added':test?'test adapter · not added':'Muse · not added'}</span></span></label>
     {source?<a className="mot-muse-citation" href={source.source.canonicalUrl} target="_blank" rel="noopener noreferrer"><span>{String((issue?.articles.indexOf(source)??0)+1).padStart(2,'0')}</span>{result.grounding==='catalogue-only'?'Catalogue: ':''}{source.title} · retrieved {date(source.source.retrievedAt)}</a>:<p className="mot-muse-meta">{test?'Test adapter':'Muse'}’s own suggestion · no source for this change</p>}
    </li>;})}</ol>}
    <p>{result.proposal.reason}</p>
    {!!result.proposal.sources.length&&<details><summary>Sources cited for this proposal</summary>{result.proposal.sources.map(source=><p key={source.id}><a href={source.url} target="_blank" rel="noopener noreferrer">{issue?.articles.find(a=>a.source.id===source.id)?.title??source.id}</a> · retrieved {date(source.retrievedAt)}</p>)}</details>}
    <p className="mot-muse-meta">Request {result.receipt.requestId} · {result.receipt.modelId} · {date(result.receipt.date)} · validated at revision {result.revision}</p>
    {!!applied.length&&<button type="button" className="m-btn" onClick={()=>undo(result.proposal.id)}>Undo added suggestions</button>}
   </>:<>
    <section className="mot-muse-reads"><h3>FCC’s {meta.city} issue <span className="mot-muse-meta">{full} of {total} in full</span></h3><p className="mot-muse-meta" role="status">{issueState}{total?` · retrieved ${date(issue!.articles[0]!.source.retrievedAt)}`:''}</p>
     {!!total&&<><ol className="mot-muse-stories" aria-label="Stories Muse reads">{issue!.articles.map((article,index)=><li key={article.id}><span>{String(index+1).padStart(2,'0')}</span><a href={article.source.canonicalUrl} title={`Published ${date(article.source.publishedAt)} · retrieved ${date(article.source.retrievedAt)}`} target="_blank" rel="noopener noreferrer">{article.title}</a><small>{article.body.trim()?'full text':'title only'}</small></li>)}</ol><details className="mot-muse-source-dates"><summary>Issue dates and sources</summary>{issue!.articles.map(article=><p className="mot-muse-meta" key={article.id}>{article.title} · published {date(article.source.publishedAt)} · retrieved {date(article.source.retrievedAt)} · version {article.source.version}</p>)}</details></>}
     {grounding!=='full-issue'&&<p className="mot-muse-warning">{issue?'Some full text is missing. This plan will be labelled catalogue-only.':'No issue is loaded. The request cannot claim FCC issue grounding.'}</p>}
     {/* The adapter tries twice per load; one manual retry keeps the total at four attempts. */}
     {!issue&&attempt<1&&<button type="button" className="m-btn" onClick={()=>setAttempt(value=>value+1)}>Retry FCC issue</button>}
    </section>
    <section><h3>Your cards Muse may read <span className="mot-muse-meta">{selectedCount} chosen</span></h3><div className="mot-muse-picks" role="group" aria-label="Cards to include">{cards.map(card=><button type="button" key={card.id} disabled={card.scope==='private'} aria-pressed={card.scope==='private'?false:selected.includes(card.id)} onClick={()=>setSelected(value=>value.includes(card.id)?value.filter(id=>id!==card.id):[...value,card.id])}>{card.title||'Untitled card'}{card.scope==='private'?' · private, never sent':''}</button>)}</div>{!cards.length&&<p className="m-muted">No cards on this trip yet. You can ask using the FCC issue and your request.</p>}</section>
    <label className="mot-muse-prompt"><span>Your request</span><textarea aria-label="Your request" value={prompt} onChange={e=>setPrompt(e.target.value)}/><span className={prompt.length>8000?'mot-muse-warning':'mot-muse-meta'}>{prompt.length.toLocaleString('en-GB')} / 8,000{prompt.length>8000?' · Nothing was sent.':''}</span></label>
    <details className="mot-muse-disclosure"><summary>What leaves this device <small>nothing until you press Ask</small></summary><h3>Sent when you ask</h3><ul><li>Your request and this board’s ID; the board title is excluded.</li><li>The {selectedCount} chosen non-private cards: ID, title, text, lane, day and time.</li><li>This city’s ID and grounding label; FCC article titles, available full text and source metadata: IDs, public links, city/country, publication/update/retrieval dates, version, content hash and editorial origin.</li><li>The picture ID list is empty. No pictures are selected by this composer.</li></ul><h3>Never sent</h3><ul><li>Private cards, unchosen cards, other boards and other guests’ material.</li><li>Picture files, image bytes or private host notes.</li><li>Card annotations outside the chosen card’s text.</li></ul><p>Goes to your MoT server, then the configured provider. Server diagnostics contain no request text and last for the process session, or at most 24 hours if the owner captures them. Provider retention follows the configured account terms.</p></details>
   </>}
  </div>
  <footer>{busy?<button type="button" className="m-btn" onClick={stop}>Stop</button>:result?<><button type="button" className="m-btn" onClick={()=>{setResult(undefined);setApplied([]);notify('Remaining suggestions declined. Nothing else changed.');}}>Decline remaining</button>{stale?<button type="button" className="m-btn primary" onClick={()=>void ask()}>Ask again</button>:<button type="button" className="m-btn primary" disabled={!chosen.length} onClick={add}>Add {chosen.length} to board</button>}</>:<><span className="mot-muse-meta">Muse suggests; you decide.</span><button type="button" className="m-btn primary" disabled={!runtime.available||!prompt.trim()||prompt.length>8000||issueState.startsWith('Loading')} onClick={()=>void ask()}>Ask Muse</button></>}</footer>
 </aside>;
}

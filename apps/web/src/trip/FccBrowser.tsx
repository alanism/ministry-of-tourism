import { useEffect, useState } from 'react';
import { createDiagnostic, createFccAdapter, FCC_ORIGIN, readTripMeta, type Actor, type CachedCity, type CityContentCache, type FccCityContent, type FccResult, type TripSession } from '@writers-board/core';
import { diagnostics } from './artifacts';
import {SourceLink} from './SourceContent';
import {sourceDate} from './source-card';
import {finishSourceLoad,type SourceLoadState} from './fcc-state';

export const citySlug=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
let cacheDb:Promise<IDBDatabase>|undefined;
const sourceDb=()=>cacheDb??=new Promise<IDBDatabase>((resolve,reject)=>{const request=indexedDB.open('mot-fcc-sources',1);request.onupgradeneeded=()=>request.result.createObjectStore('cities');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);request.onblocked=()=>reject(new Error('Source cache is blocked by another tab.'));});
export const browserCityCache:CityContentCache={
  async read(id){const db=await sourceDb();return new Promise<CachedCity|undefined>((resolve,reject)=>{const transaction=db.transaction('cities','readonly'),request=transaction.objectStore('cities').get(id);transaction.oncomplete=()=>resolve(request.result as CachedCity|undefined);transaction.onabort=transaction.onerror=()=>reject(transaction.error);});},
  async write(id,entry){const db=await sourceDb();await new Promise<void>((resolve,reject)=>{const transaction=db.transaction('cities','readwrite');transaction.objectStore('cities').put(entry,id);transaction.oncomplete=()=>resolve();transaction.onabort=transaction.onerror=()=>reject(transaction.error);});},
};
export const browserFcc=createFccAdapter({maxRetries:2,feedUrl:id=>`${import.meta.env.VITE_FCC_FEED_BASE??`${FCC_ORIGIN}/feeds/cities`}/${encodeURIComponent(id)}.json`,cache:browserCityCache,onDiagnostic:entry=>diagnostics.record(createDiagnostic({requestId:crypto.randomUUID(),operation:entry.operation,boardId:'public-source',revision:0,appVersion:'mot-integration-v2',sourceUrl:entry.sourceUrl,httpStatus:entry.httpStatus,errorClass:entry.errorClass==='network'?'network':entry.errorClass==='cancelled'?'cancelled':'unavailable'}))});

export interface FccBrowserState extends SourceLoadState {boardId:string;cityId:string;}
export function SourceFreshness({state,onOpen}:{state:FccBrowserState|undefined;onOpen?:()=>void}){
  if(!state)return null;
  const result=state.result,loaded=result&&result.status!=='unavailable'?result:undefined;
  const label=state.pending?'Refreshing FCC…':state.failure&&loaded?'Couldn’t refresh · last loaded copy':result?.status==='cached'&&state.offline?'Offline · saved copy':result?.status==='unavailable'&&state.offline?'Not available offline':result?.status==='unavailable'?'FCC unavailable':loaded?'FCC · '+loaded.value.city.name:'FCC content not loaded';
  const stopped=state.failure?.code==='network'||(state.failure?.code==='http'&&(state.failure.httpStatus??0)>=500);
  return <div className="mot-source-state" role="status" aria-label="FCC source freshness">
    {onOpen?<button type="button" className="m-btn" onClick={onOpen}>{label}</button>:<strong>{label}</strong>}
    {loaded&&<span>Retrieved {sourceDate(loaded.retrievedAt)}</span>}
    {state.failure&&<p>{state.failure.code==='cancelled'?'FCC did not answer in time. ':''}Nothing was lost. {loaded?'The last loaded issue is kept. ':''}Your notes and checks are unchanged.</p>}
    {stopped&&<p>Stopped after 3 tries.</p>}
    {!state.pending&&!state.failure&&state.updatedKeys.length>0&&<p>FCC updated {state.updatedKeys.length} {state.updatedKeys.length===1?'story':'stories'}. Your notes and checks were kept.</p>}
  </div>;
}
export function FccBrowser({session,actor,refresh,notify,onContent,onState,initialState}:{session:TripSession;actor:Actor;refresh:()=>void;notify:(message:string)=>void;onContent:(content:FccCityContent|undefined)=>void;onState?:(state:FccBrowserState)=>void;initialState?:FccBrowserState}) {
  const meta=readTripMeta(session.doc),id=meta.cityId??citySlug(meta.city);
  const [attempt,setAttempt]=useState(0),[state,setState]=useState<SourceLoadState>(()=>initialState??{pending:true,offline:false,updatedKeys:[]}),[error,setError]=useState('');
  const result=state.result,loaded=result&&result.status!=='unavailable'?result.value:undefined;
  useEffect(()=>{onContent(loaded);},[loaded,onContent]);
  useEffect(()=>{onState?.({...state,boardId:session.boardId,cityId:id});},[state,session.boardId,id,onState]);
  useEffect(()=>{
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000),offline=!navigator.onLine;let live=true;
    setState(previous=>({...previous,pending:true,failure:undefined}));
    void browserFcc.getCity(id,{signal:controller.signal,offline}).then(value=>{if(live)setState(previous=>finishSourceLoad(previous,value,id,offline));}).catch(()=>{
      if(live)setState(previous=>finishSourceLoad(previous,{status:'unavailable',reason:'FCC content could not be loaded. Your board is unchanged.',error:{code:'invalid_feed',message:'FCC content could not be loaded.'}},id,offline));
    }).finally(()=>clearTimeout(timer));
    return()=>{live=false;clearTimeout(timer);controller.abort();};
  },[session,id,attempt]);
  const add=(input:Record<string,unknown>)=>{setError('');try{session.execute(actor,'trip_card_create',input);refresh();notify('FCC source added to this trip. Your notes stay separate.');}catch(cause){setError(cause instanceof Error?cause.message:'The source could not be added.');}};
  return <section className="mot-fcc" aria-label="Explore FCC"><h2>Explore FCC · {meta.city}</h2><p className="m-muted">Public FCC requests send only the city ID. Historical editorial is separate from current opening hours, prices and your own notes.</p><button type="button" className="m-btn" disabled={state.pending} onClick={()=>setAttempt(value=>value+1)}>Refresh FCC content</button>
    <SourceFreshness state={{...state,boardId:session.boardId,cityId:id}}/>
    {!result&&state.pending&&<p>Loading the selected city's issue…</p>}
    {result?.status==='unavailable'&&<div><p>{result.reason}</p><button className="m-btn" type="button" disabled={state.pending} onClick={()=>setAttempt(value=>value+1)}>Retry FCC</button><p className="m-muted">Your board and artwork remain usable.</p></div>}
    {error&&<p role="alert">{error}</p>}
    {loaded&&<><h3>Articles</h3>{loaded.articles.map(article=><article key={article.id} className="m-panel mot-fcc-item"><h3>{article.title}</h3><p className="mot-source-attribution">FCC Magazine{article.source.publishedAt?' · published '+sourceDate(article.source.publishedAt):''} · retrieved {sourceDate(article.source.retrievedAt)}</p><SourceLink url={article.source.canonicalUrl}/><details><summary>Read article</summary><pre>{article.body}</pre></details><button type="button" className="m-btn" onClick={()=>add({kind:'note',title:article.title,body:article.body.slice(0,2000),sourceText:article.body,travelerNote:'',stage:'explore',provenance:'fcc',source:article.source})}>Add opening excerpt</button></article>)}
      <h3>Places</h3>{loaded.places.map(place=><article key={place.id} className="m-panel mot-fcc-item"><h3>{place.name}</h3><SourceLink url={place.source.canonicalUrl}/><p className="mot-source-attribution">Venue · FCC · retrieved {sourceDate(place.source.retrievedAt)}</p><p className="m-muted">FCC editorial · current operating details unverified</p><button type="button" className="m-btn" onClick={()=>add({kind:'place',title:place.name,body:'',placeId:place.id,stage:'explore',provenance:'fcc',source:place.source})}>Add place</button></article>)}
      <p className="m-muted">Almanac observations remain available from FCC's separate Almanac publication.</p>
    </>}
  </section>;
}

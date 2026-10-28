import { useEffect, useState } from 'react';
import { createDiagnostic, createFccAdapter, FCC_ORIGIN, readTripMeta, type Actor, type CachedCity, type CityContentCache, type FccCityContent, type FccResult, type TripSession } from '@writers-board/core';
import { diagnostics } from './artifacts';

export const citySlug=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
let cacheDb:Promise<IDBDatabase>|undefined;
const sourceDb=()=>cacheDb??=new Promise<IDBDatabase>((resolve,reject)=>{const request=indexedDB.open('mot-fcc-sources',1);request.onupgradeneeded=()=>request.result.createObjectStore('cities');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);request.onblocked=()=>reject(new Error('Source cache is blocked by another tab.'));});
export const browserCityCache:CityContentCache={
  async read(id){const db=await sourceDb();return new Promise<CachedCity|undefined>((resolve,reject)=>{const transaction=db.transaction('cities','readonly'),request=transaction.objectStore('cities').get(id);transaction.oncomplete=()=>resolve(request.result as CachedCity|undefined);transaction.onabort=transaction.onerror=()=>reject(transaction.error);});},
  async write(id,entry){const db=await sourceDb();await new Promise<void>((resolve,reject)=>{const transaction=db.transaction('cities','readwrite');transaction.objectStore('cities').put(entry,id);transaction.oncomplete=()=>resolve();transaction.onabort=transaction.onerror=()=>reject(transaction.error);});},
};
export const browserFcc=createFccAdapter({feedUrl:id=>`${import.meta.env.VITE_FCC_FEED_BASE??`${FCC_ORIGIN}/feeds/cities`}/${encodeURIComponent(id)}.json`,cache:browserCityCache,onDiagnostic:entry=>diagnostics.record(createDiagnostic({requestId:crypto.randomUUID(),operation:entry.operation,boardId:'public-source',revision:0,appVersion:'mot-integration-v2',sourceUrl:entry.sourceUrl,httpStatus:entry.httpStatus,errorClass:entry.errorClass==='network'?'network':entry.errorClass==='cancelled'?'cancelled':'unavailable'}))});

export function FccBrowser({session,actor,refresh,notify,onContent}:{session:TripSession;actor:Actor;refresh:()=>void;notify:(message:string)=>void;onContent:(content:FccCityContent|undefined)=>void}) {
  const meta=readTripMeta(session.doc),id=meta.cityId??citySlug(meta.city);
  const [attempt,setAttempt]=useState(0),[result,setResult]=useState<FccResult<FccCityContent>>(),[error,setError]=useState('');
  useEffect(()=>{const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);let live=true;setResult(undefined);onContent(undefined);void browserFcc.getCity(id,{signal:controller.signal,offline:!navigator.onLine}).then(value=>{if(live){setResult(value);onContent(value.status==='unavailable'?undefined:value.value);}}).finally(()=>clearTimeout(timer));return()=>{live=false;clearTimeout(timer);controller.abort();};},[session,id,attempt]);
  const add=(input:Record<string,unknown>)=>{try{session.execute(actor,'trip_card_create',input);refresh();notify('FCC source added to this trip. Your notes stay separate.');}catch(cause){setError(cause instanceof Error?cause.message:'The source could not be added.');}};
  return <section className="mot-fcc" aria-label="Explore FCC"><h2>Explore FCC · {meta.city}</h2><p className="m-muted">Public FCC requests send only the city ID. Historical editorial is separate from current opening hours, prices and your own notes.</p><button type="button" className="m-btn" onClick={()=>setAttempt(value=>value+1)}>Refresh FCC content</button>
    {!result&&<p role="status">Loading the selected city's issue…</p>}
    {result?.status==='unavailable'&&<div role="status"><p>{result.reason}</p><button className="m-btn" type="button" onClick={()=>setAttempt(value=>value+1)}>Retry FCC</button><p className="m-muted">Your board and artwork remain usable.</p></div>}
    {error&&<p role="alert">{error}</p>}
    {result&&result.status!=='unavailable'&&<><p role="status">{result.status==='ready'?'FCC source loaded':result.status==='cached'?'Cached issue':'Stale issue · refresh failed'} · retrieved {new Date(result.retrievedAt).toLocaleString()} · {result.value.articles.length} articles</p>
      <h3>Articles</h3>{result.value.articles.map(article=><article key={article.id} className="m-panel"><h3>{article.title}</h3><a href={article.source.canonicalUrl} target="_blank" rel="noopener noreferrer">Open source</a><details><summary>Read article</summary><pre>{article.body}</pre></details><button type="button" className="m-btn" onClick={()=>add({kind:'note',title:article.title,body:article.body.slice(0,2000),sourceText:article.body,travelerNote:'',stage:'explore',provenance:'fcc',source:article.source})}>Add opening excerpt</button></article>)}
      <h3>Places</h3>{result.value.places.map(place=><article key={place.id} className="m-panel"><h3>{place.name}</h3><a href={place.source.canonicalUrl} target="_blank" rel="noopener noreferrer">Open source</a><p className="m-muted">FCC editorial · current operating details unverified</p><button type="button" className="m-btn" onClick={()=>add({kind:'place',title:place.name,body:'',placeId:place.id,stage:'explore',provenance:'fcc',source:place.source})}>Add place</button></article>)}
      <p className="m-muted">Almanac observations remain available from FCC's separate Almanac publication.</p>
    </>}
  </section>;
}

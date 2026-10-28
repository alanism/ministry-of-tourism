import { useEffect, useRef, useState } from 'react';
import { fccShopUrl, readAllCards, readPresentations, readTripMeta, type ApparelArtRef, type MagazineDocument, type TripSession } from '@writers-board/core';
import { prepareMagazine } from './artifacts';
import { postcardPreviewSvg } from './magazine-view';
import { readableMagazineSvg } from './magazine-reading';
import { selectMagazineTee } from './magazine-controls';
import { useAssetUrl } from './trip-assets';
import './magazine.css';

function PageImage({svg,alt,printLayout}:{svg:string;alt:string;printLayout:boolean}){
  const ref=useRef<HTMLImageElement>(null),[width,setWidth]=useState(0),[reading,setReading]=useState(''),[failure,setFailure]=useState('');
  useEffect(()=>{const element=ref.current;if(!element)return;const observer=new ResizeObserver(([entry])=>setWidth(Math.floor(entry!.contentRect.width)));observer.observe(element);return()=>observer.disconnect();},[]);
  useEffect(()=>{const controller=new AbortController();setReading('');setFailure('');if(width>0&&!printLayout)void readableMagazineSvg(svg,width,controller.signal).then(value=>{if(!controller.signal.aborted)setReading(value);},error=>{if(!controller.signal.aborted)setFailure(error instanceof Error?error.message:'Page fitting failed.');});return()=>controller.abort();},[svg,width,printLayout]);
  const ready=printLayout||width>=440||!!reading;
  return <><img ref={ref} data-reading-ready={ready} src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(reading||svg)}`} alt={alt} />{failure&&<p role="alert">{failure} Read the trip text above.</p>}</>;
}

function TeeChoice({session,art,chosen,busy,onChoose}:{session:TripSession;art:ApparelArtRef;chosen:boolean;busy:boolean;onChoose:()=>void}){
  const cached=useAssetUrl(session,art.assetId);
  return <button type="button" className="mot-issue-tee" aria-pressed={chosen} disabled={busy} onClick={onChoose}><img src={cached??art.thumbnailUrl} alt="" loading="lazy" referrerPolicy="no-referrer" /><span>{art.label??'FCC tee'}</span>{chosen&&<strong>In your issue</strong>}</button>;
}
export function MagazineStudio({session,tick,onExport}:{session:TripSession;tick:number;onExport:()=>void}) {
  const [magazine,setMagazine]=useState<MagazineDocument>(),[error,setError]=useState(''),[includePrivate,setIncludePrivate]=useState(false);
  const [turned,setTurned]=useState(false),[fitPages,setFitPages]=useState(false);
  const [choosingTee,setChoosingTee]=useState(false),teeController=useRef<AbortController|null>(null);
  useEffect(()=>()=>teeController.current?.abort(),[session]);
  useEffect(()=>{const abort=new AbortController();setMagazine(undefined);setError('');void prepareMagazine(session,abort.signal,includePrivate).then(result=>{if(!abort.signal.aborted)setMagazine(result);},cause=>{if(!abort.signal.aborted)setError(cause instanceof Error?cause.message:'Preview unavailable.');});return()=>abort.abort();},[session,tick,includePrivate]);
  const visibleCards=new Set(readAllCards(session.parts).filter(card=>includePrivate||card.scope!=='private').map(card=>card.id));
  const specimens=readPresentations(session.parts).filter(layer=>(includePrivate||layer.scope!=='private')&&(!layer.cardId||visibleCards.has(layer.cardId))&&(layer.magazineRole==='specimen'||layer.pattern==='food-culture')&&layer.assetId&&!layer.locked).sort((a,b)=>a.zIndex-b.zIndex||a.id.localeCompare(b.id));
  const swapSpecimen=()=>{
    if(specimens.length<2)return;
    try{session.executeAll({kind:'human',id:'traveler-1',name:'You'},[{command:'trip_presentation_update',input:{id:specimens[0]!.id,zIndex:Math.max(...readPresentations(session.parts).map(layer=>layer.zIndex))+1}}]);}
    catch(cause){setError(cause instanceof Error?cause.message:'The artwork could not be changed.');}
  };
  const spreads=magazine?.spreads??[];
  const front=spreads.find(spread=>spread.section==='front-cover'),back=spreads.find(spread=>spread.section==='back-cover');
  const groups=front&&back?[{...front,id:'jacket',title:'Your personal issue',pageIds:[...back.pageIds,...front.pageIds]},...spreads.filter(spread=>spread!==front&&spread!==back)]:spreads;
  const wornTee=readTripMeta(session.doc).magazine?.wornTeeAssetId??spreads.find(spread=>spread.section==='style')?.usedSlots.find(slot=>slot.name==='worn')?.assetId;
  const chooseTee=async(art:ApparelArtRef)=>{
    const controller=new AbortController();teeController.current=controller;setChoosingTee(true);setError('');
    try{const result=await selectMagazineTee(session,{kind:'human',id:'traveler-1',name:'You'},art,magazine?.apparel??[],controller.signal);if(!result.persisted)setError('Your tee choice is ready in this tab. Download an editable package before closing to keep its images.');}
    catch(cause){if(!controller.signal.aborted)setError(cause instanceof Error?cause.message:'The tee could not be selected. Try again.');}
    finally{if(teeController.current===controller){teeController.current=null;setChoosingTee(false);}}
  };
  return <section className="mot-magazine-studio" aria-label="Trip magazine studio">
    <header className="mot-issue-heading"><div><h2>Your trip magazine</h2><p className="m-muted">Your artwork, places and notes, composed as an issue.</p></div><button type="button" className="m-btn primary" onClick={onExport}>Open Export</button></header>
    <label className="mot-issue-privacy"><input type="checkbox" checked={includePrivate} onChange={event=>setIncludePrivate(event.target.checked)} /> Include private notes and artwork in this preview</label>
    <div className="mot-issue-view"><label><input type="checkbox" checked={fitPages} onChange={event=>setFitPages(event.target.checked)} /> Show the fixed print layout</label><p className="m-muted">On a phone, words wrap within the page. The PDF keeps the A5 print layout.</p></div>
    <details className="mot-issue-transcript"><summary>Read the trip text</summary>{readAllCards(session.parts).filter(card=>includePrivate||card.scope!=='private').map(card=><article key={card.id}><h3>{card.title}</h3>{card.day&&<p className="m-muted">{card.day}{card.time?` · ${card.time}`:''}</p>}<p>{card.body}</p>{card.travelerNote&&<p>{card.travelerNote}</p>}</article>)}</details>
    {error&&<p role="alert">{error}</p>}
    {!magazine&&!error&&<p role="status">Composing your issue…</p>}
    {magazine&&!magazine.pages.length&&<p className="m-muted">Add a trip note, a place or FCC artwork to begin your issue.</p>}
    {!!groups.length&&<div className="mot-issue-layout">
      <nav className="mot-issue-contents" aria-label="Magazine contents"><h3>In this issue</h3>{groups.map((group,index)=><a href={`#issue-${group.id}`} key={group.id}><span>{String(index+1).padStart(2,'0')}</span>{group.title}</a>)}<p className="m-muted">{magazine!.pages.length} pages · revision {magazine!.revision}</p>{new Set(specimens.map(layer=>layer.assetId)).size>1&&<button type="button" className="m-btn small" onClick={swapSpecimen}>Swap lead specimen</button>}</nav>
      <div className="mot-issue-spreads">{groups.map((group,index)=>{
        const pages=group.pageIds.flatMap(id=>magazine!.pages.filter(page=>page.id===id));
        return <article className="mot-issue-spread" id={`issue-${group.id}`} key={group.id} aria-label={group.title}>
          <header><span>{String(index+1).padStart(2,'0')}</span><h3>{group.title}</h3></header>
          <div className={`mot-issue-paper${pages.length===1?' single':''}${group.id==='jacket'?' jacket':''}`}>{pages.map(page=>{
            const postcard=page.svg.includes('data-postcard-face="front"')&&page.svg.includes('data-postcard-face="back"');
            const image=<PageImage svg={postcard?postcardPreviewSvg(page.svg,turned):page.svg} alt={`${page.title??group.title} · page ${page.folio}`} printLayout={fitPages} />;
            return <figure className={page.section==='front-cover'?'front':''} key={page.id}>{postcard?<button className="mot-issue-postcard" type="button" aria-label="Turn the postcard over" aria-pressed={turned} onClick={()=>setTurned(value=>!value)}>{image}</button>:image}<figcaption>Page {page.folio}{postcard?' · Tap the postcard to turn it over':''}</figcaption></figure>;
          })}</div>
          {group.section==='style'&&!!magazine?.apparel?.length&&<div className="mot-issue-tee-choices" aria-label="Choose the tee in your issue"><h4>Choose the tee</h4><div>{magazine.apparel.map(art=><TeeChoice key={art.assetId} session={session} art={art} chosen={wornTee===art.assetId} busy={choosingTee} onChoose={()=>void chooseTee(art)} />)}</div>{choosingTee&&<p role="status">Keeping the original tee images… <button type="button" className="m-btn small" onClick={()=>teeController.current?.abort()}>Cancel tee selection</button></p>}</div>}
          {pages.some(page=>page.pattern==='merch'||page.pattern==='tee-advert')&&magazine?.cityId&&<p className="mot-issue-shop"><a className="m-btn ink" href={fccShopUrl(magazine.cityId)} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">Order on FCC →</a><span className="m-muted">Sizes, prices and delivery are on FCC. MoT takes no payment.</span></p>}
          {pages.some(page=>page.credits.length>0)&&<details className="mot-issue-credits"><summary>Credits and sources</summary>{[...new Set(pages.flatMap(page=>page.credits))].map(credit=><p key={credit}>{credit}</p>)}</details>}
        </article>;
      })}</div>
    </div>}
    {!!magazine?.warnings.length&&<details className="mot-issue-notes"><summary>Issue notes ({magazine.warnings.length})</summary>{magazine.warnings.map(warning=><p className="m-muted" key={warning}>{warning}</p>)}</details>}
  </section>;
}

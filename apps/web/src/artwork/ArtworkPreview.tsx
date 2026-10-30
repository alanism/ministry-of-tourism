import {useEffect,useRef,useState,type CSSProperties} from 'react';
import type {Artwork} from './catalog';
import {loadArtworkPreview,printSize} from './art-preview';

export default function ArtworkPreview({artwork,origin,away,busy,onAdd,onBack}:{artwork:Artwork;origin:string;away:boolean;busy:boolean;onAdd:()=>void;onBack:()=>void}){
 const [attempt,setAttempt]=useState(0),[loaded,setLoaded]=useState<{id:string;url?:string;width?:number;height?:number;error?:string}>();
 const heading=useRef<HTMLHeadingElement>(null),ref=artwork.artRef,size=printSize(artwork),[x,y,w,h]=artwork.crop??[0,0,1,1];
 useEffect(()=>{heading.current?.focus();},[artwork.id]);
 useEffect(()=>{
  const controller=new AbortController();let live=true,url:string|undefined;
  const timer=setTimeout(()=>controller.abort(),20000);setLoaded({id:artwork.id});
  void(async()=>{
   try{
    const {blob,width,height}=await loadArtworkPreview(artwork,controller.signal);controller.signal.throwIfAborted();
    if(live){url=URL.createObjectURL(blob);setLoaded({id:artwork.id,url,width,height});}
   }catch{if(live)setLoaded({id:artwork.id,error:controller.signal.aborted?'The preview timed out. Retry when connected.':'The preview could not be loaded. Retry, or add the original when connected.'});}
   finally{clearTimeout(timer);}
  })();
  return()=>{live=false;clearTimeout(timer);controller.abort();if(url)URL.revokeObjectURL(url);};
 },[artwork.id,artwork.src,artwork.thumb,artwork.original,attempt]);
 const current=loaded?.id===artwork.id?loaded:undefined;
 const style:CSSProperties={width:`${100/w}%`,height:`${100/h}%`,left:`${-100*x/w}%`,top:`${-100*y/h}%`};
 return <aside className="trip-art-preview" aria-label="Artwork preview">
  <button type="button" className="m-btn ghost art-back" disabled={busy} onClick={onBack}>Back to artwork</button>
  <div className="art-original-preview" aria-busy={!current?.url&&!current?.error}>
   {current?.url?<span className="artwork-crop" style={{aspectRatio:size.widthPx/size.heightPx}}><img src={current.url} alt={artwork.label} style={style}/></span>:current?.error?<div role="alert"><p>{current.error}</p>{attempt<3?<button type="button" className="m-btn" onClick={()=>setAttempt(v=>v+1)}>Try again</button>:<p>Three retries failed. Close this preview and try when connected.</p>}</div>:<p role="status">Loading preview…</p>}
  </div>
  <h3 ref={heading} tabIndex={-1}>{artwork.label}</h3>
  <div className="art-origin-row"><span className={away?'art-origin-chip':'art-source-chip'}>{away?'From ':''}{origin}{ref?.countryCode?', '+ref.countryCode:''}</span>{away&&<span className="art-source-chip">Not your destination</span>}</div>
  <dl className="art-source-facts">
   <dt>Drawn by</dt><dd>{ref?.credit??'Credit not supplied in this legacy catalog'}</dd>
   <dt>Collection</dt><dd>{artwork.collection==='brush-original'?'FCC brush portraits':'FCC city illustrations'} · {artwork.subject.replaceAll('-',' ')}</dd>
   <dt>Source size</dt><dd>{artwork.width} × {artwork.height} px{artwork.crop?' · source crop kept':''}</dd>
   <dt>Rights</dt><dd>{ref?.rightsStatus??'Unknown'} · credit stays with the picture</dd>
  </dl>
  <div className="art-renditions" aria-label="Image versions">
   <div><b>Browsing</b><span>Thumbnail</span></div>
   <div><b>Preview</b><span>{current?.width?`${current.width} × ${current.height} px loaded`:'Not loaded'}</span></div>
   <div><b>{artwork.original?'Original':'Available image'}</b><span>{artwork.width} px · fetched on Add</span></div>
  </div>
  <div className={'art-print-meter'+(size.soft?' soft':'')}>
   <p>At 300 dpi: up to <b>{size.widthCm.toFixed(1)} cm wide</b></p>
   <p className="art-meta">Source sizing{artwork.crop?' after crop':''}; original pixels verified on Add.</p>
   <div className="art-meter-bar"><span style={{width:Math.min(100,size.widthCm/22*100)+'%'}}/>{[10.5,14.8,21].map(cm=><i key={cm} style={{left:cm/22*100+'%'}}/>)}</div>
   <div className="art-meter-marks">{[['Card',10.5],['A5',14.8],['A4',21]].map(([label,cm])=><span key={label} style={{left:Number(cm)/22*100+'%'}}>{label}</span>)}</div>
   <p className="art-meta">Marks: postcard 10.5 cm · A5 14.8 cm · A4 21 cm.</p>
   <p className="art-meta">{size.soft?`Full-width on A5: ${size.a5Dpi} dpi, below 300. It may look soft on paper. Use it smaller or as a sticker.`:'The source has enough pixels for A5 at 300 dpi.'}</p>
  </div>
  <details className="art-source-record"><summary>Source record</summary>{ref?<><a href={ref.source.canonicalUrl} target="_blank" rel="noopener noreferrer">Open FCC source ↗</a><p>Retrieved {ref.source.retrievedAt}</p><p>{ref.source.version??'Version not supplied'}</p>{ref.depictedPlace&&<p>Depicts {ref.depictedPlace}</p>}</>:<p>No extended source record is supplied.</p>}</details>
  <footer className="art-add-row"><button type="button" className="m-btn primary" disabled={busy} onClick={onAdd}>{busy?'Adding…':'Add to board'}</button><p className="art-meta">Adds decoration to your trip. It won’t create a place, a booking or a stop.</p></footer>
 </aside>;
}

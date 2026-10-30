import {useEffect,useRef,useState,type CSSProperties} from 'react';
import type {Artwork} from './catalog';

export default function ArtworkThumbnail({ artwork }: { artwork: Artwork }) {
  const [result,setResult]=useState<{url:string;status:'loaded'|'failed'}>();
  const frame=useRef<HTMLSpanElement>(null),status=result?.url===artwork.thumb?result.status:'loading';
  const settle=(next:'loaded'|'failed')=>setResult(previous=>previous?.url===artwork.thumb?previous:{url:artwork.thumb,status:next});
  useEffect(()=>{
    if(status!=='loading')return;
    let timer:ReturnType<typeof setTimeout>|undefined;
    const start=()=>{timer??=setTimeout(()=>setResult(previous=>previous?.url===artwork.thumb?previous:{url:artwork.thumb,status:'failed'}),20000);};
    // Lazy thumbnails below the fold have not started loading; their wait starts when visible.
    const observer=typeof IntersectionObserver==='undefined'?undefined:new IntersectionObserver(entries=>{if(entries.some(entry=>entry.isIntersecting)){start();observer?.disconnect();}});
    if(observer&&frame.current)observer.observe(frame.current);else start();
    return()=>{observer?.disconnect();clearTimeout(timer);};
  },[artwork.thumb,status]);
  const [x, y, w, h] = artwork.crop ?? [0, 0, 1, 1];
  const style: CSSProperties = { width: `${100 / w}%`, height: `${100 / h}%`, left: `${-100 * x / w}%`, top: `${-100 * y / h}%` };
  return <span ref={frame} className="artwork-preview" aria-busy={status==='loading'}><span className="artwork-crop" style={{ aspectRatio: (artwork.width * w) / (artwork.height * h) }}>
    {status==='failed' ? <span className="artwork-thumb-error artwork-thumb-status">Preview unavailable. Open picture to retry.</span>
      : <><img key={artwork.thumb} src={artwork.thumb} alt="" loading="lazy" decoding="async" style={style} onLoad={()=>settle('loaded')} onError={()=>settle('failed')} />{status==='loading'&&<span className="artwork-thumb-error artwork-thumb-status" role="status">Loading preview…</span>}</>}
  </span></span>;
}

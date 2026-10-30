import type {Artwork} from './catalog';

/** Preview cancellation settles immediately; an uninterruptible decoder still releases its late bitmap. */
export async function loadArtworkPreview(artwork:Artwork,signal:AbortSignal){
 signal.throwIfAborted();
 let abort!:()=>void;
 const cancelled=new Promise<never>((_resolve,reject)=>{abort=()=>reject(signal.reason??new DOMException('Preview cancelled','AbortError'));signal.addEventListener('abort',abort,{once:true});});
 try{
  const work=(async()=>{
   const response=await fetch(artwork.src===artwork.original?artwork.thumb:artwork.src,{signal,credentials:'omit',redirect:'error'});
   if(signal.aborted){void response.body?.cancel().catch(()=>{});signal.throwIfAborted();}
   if(!response.ok)throw Error('Preview unavailable ('+response.status+').');
   const blob=await response.blob();signal.throwIfAborted();
   const pixels=await createImageBitmap(blob);
   try{signal.throwIfAborted();return{blob,width:pixels.width,height:pixels.height};}
   finally{pixels.close();}
  })();
  return await Promise.race([work,cancelled]);
 }finally{signal.removeEventListener('abort',abort);}
}

export function decorativeArtwork(art:Artwork){return art.subject!=='apparel'&&art.artRef?.kind!=='apparel-mockup';}
export function printSize(art:Artwork){
 const [, ,w,h]=art.crop??[0,0,1,1],widthPx=Math.round(art.width*w),heightPx=Math.round(art.height*h);
 return{widthPx,heightPx,widthCm:widthPx/300*2.54,a5Dpi:Math.round(widthPx/(14.8/2.54)),soft:widthPx/300*2.54<14.8};
}

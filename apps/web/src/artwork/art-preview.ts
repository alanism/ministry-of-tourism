import type {Artwork} from './catalog';

export function decorativeArtwork(art:Artwork){return art.subject!=='apparel'&&art.artRef?.kind!=='apparel-mockup';}
export function printSize(art:Artwork){
 const [, ,w,h]=art.crop??[0,0,1,1],widthPx=Math.round(art.width*w),heightPx=Math.round(art.height*h);
 return{widthPx,heightPx,widthCm:widthPx/300*2.54,a5Dpi:Math.round(widthPx/(14.8/2.54)),soft:widthPx/300*2.54<14.8};
}

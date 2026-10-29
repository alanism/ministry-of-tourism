import {expect,it} from 'vitest';
import {printSize,decorativeArtwork} from './art-preview';
import type {Artwork} from './catalog';
const art={width:480,height:720,crop:[0,0,.5,1]} as Artwork;
it('uses the cropped original pixels for print sizes, never a CSS enlargement',()=>{
 expect(printSize(art).widthPx).toBe(240);expect(printSize(art).widthCm).toBeCloseTo(2.032);expect(printSize(art).a5Dpi).toBe(41);expect(printSize(art).soft).toBe(true);
 expect(printSize({...art,width:2400,crop:undefined}).soft).toBe(false);
});
it('excludes explicit apparel metadata from normal art, including an incorrectly filed item',()=>{
 expect(decorativeArtwork({...art,artRef:{kind:'apparel-mockup'} as Artwork['artRef']})).toBe(false);
 expect(decorativeArtwork({...art,subject:'apparel'})).toBe(false);expect(decorativeArtwork({...art,subject:'maps'})).toBe(true);
});

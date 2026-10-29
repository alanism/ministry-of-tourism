import {describe,expect,it} from 'vitest';
import {artworkSchema} from './catalog';
import {selectCityApparel} from '@writers-board/core';
const ref={assetId:'fcc:bangkok:tee-1',category:'apparel',kind:'apparel-mockup',variant:'mono',role:'apparel-map-mono',originCityId:'bangkok',countryCode:'TH',thumbnailUrl:'https://foreignclubberscorespondence.web.app/tee-480.webp',renditionUrl:'https://foreignclubberscorespondence.web.app/tee-800.webp',originalUrl:'https://foreignclubberscorespondence.web.app/tee.png',width:1024,height:1536,mimeType:'image/png',credit:'FCC source credit',rightsStatus:'unknown',source:{provider:'fcc',sourceId:'tee-1',canonicalUrl:'https://foreignclubberscorespondence.web.app/bangkok.html',cityId:'bangkok',countryCode:'TH',kind:'artwork',retrievedAt:'2026-10-26',origin:'artwork'}};
const entry={id:ref.assetId,styleId:'fcc-editorial',label:'A map tee',subject:'apparel',city:'bangkok',thumb:ref.thumbnailUrl,src:ref.renditionUrl,original:ref.originalUrl,width:ref.width,height:ref.height,artRef:ref};
describe('MOT-84 ArtRefs survive legacy catalog decoding',()=>{
 it('retains the complete strict ArtRef instead of stripping its credit, origin or kind',()=>{
  expect(artworkSchema.parse(entry).artRef).toEqual(ref);
 });
 it('refuses conflicting display geometry or origins before the picker can insert them',()=>{
  expect(()=>artworkSchema.parse({...entry,width:500})).toThrow();expect(()=>artworkSchema.parse({...entry,city:'kyoto'})).toThrow();
 });
 it('feeds nested apparel references to the existing city-only merchandise selector',()=>{
  expect(selectCityApparel('bangkok',[entry])).toEqual([ref]);expect(selectCityApparel('kyoto',[entry])).toEqual([]);
 });
});

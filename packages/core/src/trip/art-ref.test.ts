import {describe,expect,it} from 'vitest';
import {artRefSchema,normalizeArtCategory,resolveArtRights} from './art-ref.ts';

const source={provider:'fcc',sourceId:'source-1',canonicalUrl:'https://foreignclubberscorespondence.web.app/bangkok.html',cityId:'bangkok',countryCode:'TH',kind:'artwork',retrievedAt:'2026-10-26',origin:'artwork'};
const ref={assetId:'fcc:bangkok:one',kind:'original-art',category:'city-ink',originCityId:'bangkok',countryCode:'TH',thumbnailUrl:'https://foreignclubberscorespondence.web.app/a-480.webp',renditionUrl:'https://foreignclubberscorespondence.web.app/a-960.webp',originalUrl:'https://foreignclubberscorespondence.web.app/a.png',width:1536,height:1024,mimeType:'image/png',credit:'Actual FCC credit',rightsStatus:'unknown',source};
describe('MOT-84 strict FCC ArtRef metadata',()=>{
 it('retains original metadata and validates known kinds without allowing apparel to masquerade as a map',()=>{
  expect(artRefSchema.parse(ref)).toEqual(ref);
  const tee={...ref,kind:'apparel-mockup',category:'apparel',variant:'mono',role:'apparel-map-mono'};
  expect(artRefSchema.parse(tee).kind).toBe('apparel-mockup');
  expect(()=>artRefSchema.parse({...tee,kind:'map'})).toThrow();
  expect(()=>artRefSchema.parse({...ref,kind:'map',category:'apparel'})).toThrow();
 });
 it('normalizes explicit source categories and collection provenance, never words in the label',()=>{
  expect(normalizeArtCategory('cafe','city-illustrations')).toEqual({kind:'original-art',category:'cafe'});
  expect(normalizeArtCategory('hotel','city-illustrations')).toEqual({kind:'original-art',category:'hotels'});
  expect(normalizeArtCategory('map','map-tee-apparel')).toEqual({kind:'apparel-mockup',category:'apparel'});
  expect(normalizeArtCategory('fashion','brush-original')).toEqual({kind:'original-art',category:'portraits'});
  expect(normalizeArtCategory('unclassified','city-illustrations')).toEqual({kind:'original-art',category:'other'});
 });
 it('carries explicit pack rights/credit and respects an entry restriction or credit override',()=>{
  expect(resolveArtRights({credit:'Pack artist',rightsStatus:'approved'},{})).toEqual({credit:'Pack artist',rightsStatus:'approved'});
  expect(resolveArtRights({credit:'Pack artist',rightsStatus:'approved'},{credit:'Entry artist',rightsStatus:'restricted'})).toEqual({credit:'Entry artist',rightsStatus:'restricted'});
  expect(()=>resolveArtRights({},{})).toThrow(/credit/i);
 });
 it('rejects missing credit, inconsistent origins, private image URLs and unrecognized metadata',()=>{
  for(const patch of [{credit:''},{source:{...source,cityId:'kyoto'}},{countryCode:'JP'},{thumbnailUrl:'https://127.0.0.1/private.png'},{width:0},{hiddenPrivateField:'must never ship'}])expect(()=>artRefSchema.parse({...ref,...patch})).toThrow();
 });
 it('leaves absent categories absent rather than converting an unknown category into maps or portraits',()=>{
  expect(normalizeArtCategory('model-in-map-tee','city-illustrations')).toEqual({kind:'original-art',category:'other'});
  expect(normalizeArtCategory('map','city-illustrations')).toEqual({kind:'map',category:'maps'});
  expect(normalizeArtCategory('tag','city-illustrations')).toEqual({kind:'sticker',category:'stickers'});
 });
});

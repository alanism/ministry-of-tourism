import {describe,expect,it} from 'vitest';
import {createArtRef,readRasterHeader} from '../../../../scripts/fcc-art-metadata.ts';
const input={cityId:'bangkok',countryCode:'TH',sourceId:'a'.repeat(64),label:'An actual source drawing',category:'city-ink',collection:'city-illustrations' as const,thumbnailUrl:'https://foreignclubberscorespondence.web.app/a-480.webp',renditionUrl:'https://foreignclubberscorespondence.web.app/a-960.webp',originalUrl:'https://foreignclubberscorespondence.web.app/a.png',width:1536,height:1024,mimeType:'image/png' as const,hash:'b'.repeat(64),snapshotDate:'2026-10-26'};
describe('MOT-84 generated identities and pixel evidence',()=>{
 it('has stable content-derived identities and changes identity when credit or rights changes',()=>{
  const policy={credit:'FCC actual source artist',rightsStatus:'approved' as const};
  const a=createArtRef(input,policy),b=createArtRef(input,policy);
  expect(a).toEqual(b);expect(a.assetId.length).toBeLessThanOrEqual(160);expect(a.credit).toBe(policy.credit);expect(a.rightsStatus).toBe('approved');
  expect(createArtRef({...input,credit:'A different explicit credit'},policy).assetId).not.toBe(a.assetId);
  expect(createArtRef({...input,rightsStatus:'restricted'},policy).assetId).not.toBe(a.assetId);
  expect(createArtRef({...input,crop:[0,0,.5,1]},policy).assetId).not.toBe(a.assetId);
 });
 it('uses declared apparel collection provenance even if a source category says map',()=>{
  const tee=createArtRef({...input,category:'map',collection:'map-tee-apparel',variant:'mono'},{credit:'FCC'});
  expect(tee.kind).toBe('apparel-mockup');expect(tee.category).toBe('apparel');expect(tee.role).toBe('apparel-map-mono');expect(tee.variant).toBe('mono');
 });
 it('reads actual PNG/WebP dimensions and refuses corrupt or zero-sized headers',()=>{
  const png=Buffer.alloc(33);Buffer.from([137,80,78,71,13,10,26,10]).copy(png);png.writeUInt32BE(13,8);png.write('IHDR',12);png.writeUInt32BE(1536,16);png.writeUInt32BE(1024,20);
  expect(readRasterHeader(png)).toEqual({width:1536,height:1024,mimeType:'image/png'});
  const webp=Buffer.alloc(32);webp.write('RIFF',0);webp.writeUInt32LE(22,4);webp.write('WEBPVP8X',8);webp.writeUInt32LE(10,16);webp.writeUIntLE(799,24,3);webp.writeUIntLE(1199,27,3);
  expect(readRasterHeader(webp)).toEqual({width:800,height:1200,mimeType:'image/webp'});
  png.writeUInt32BE(0,16);expect(()=>readRasterHeader(png)).toThrow();expect(()=>readRasterHeader(Buffer.from('not an image'))).toThrow();
 });
});

import {createHash} from 'node:crypto';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {createTrip,encodeTrip,TripSession} from '@writers-board/core';
import {prepareMagazine} from './artifacts';
const origin='https://foreignclubberscorespondence.web.app';
const photos=['brush','mono','color'].map((variant,index)=>{
 const bytes='original '+variant;
 return {assetId:variant,category:'apparel',kind:'apparel-mockup',originCityId:'bilbao',variant,role:['apparel-brush','apparel-map-mono','apparel-map-color'][index],
  thumbnailUrl:origin+'/assets/'+variant+'.png',renditionUrl:origin+'/assets/'+variant+'.png',originalUrl:origin+'/assets/'+variant+'.png',width:20,height:25,mimeType:'image/png',hash:createHash('sha256').update(bytes).digest('hex'),credit:'Actual FCC credit',rightsStatus:'unknown',
  source:{provider:'fcc',sourceId:variant,canonicalUrl:origin+'/bilbao.html',cityId:'bilbao',kind:'artwork',retrievedAt:'2026-10-29',origin:'artwork'}};
});
let failed='',corrupt='',wrongSize='',items:unknown[];
const closed=vi.fn();
beforeEach(()=>{
 failed=corrupt=wrongSize='';items=[...photos];
 vi.stubGlobal('FileReader',class {result='';onload?:()=>void;readAsDataURL(blob:Blob){void blob.arrayBuffer().then(buffer=>{this.result='data:'+blob.type+';base64,'+Buffer.from(buffer).toString('base64');this.onload?.();});}});
 vi.stubGlobal('createImageBitmap',vi.fn(async(blob:Blob)=>({width:(await blob.text()).includes(wrongSize)&&wrongSize?21:20,height:25,close:closed})));
 vi.stubGlobal('fetch',vi.fn(async(url:unknown)=>{
  const value=String(url);
  if(value==='/artwork/index.json')return Response.json({version:1,styles:[{id:'fcc',label:'FCC',manifest:'/artwork/fcc/manifest.json'}]});
  if(value.endsWith('manifest.json'))return Response.json({version:1,styleId:'fcc',subjects:[{id:'apparel',label:'Apparel'}],cities:[{id:'bilbao',label:'Bilbao'}],catalogs:[{subject:'apparel',city:'bilbao',count:items.length,url:'/artwork/fcc/bilbao/apparel.json'}]});
  if(value.endsWith('apparel.json'))return Response.json({version:1,styleId:'fcc',items});
  const variant=value.split('/').at(-1)!.replace('.png','');
  return variant===failed?new Response('',{status:503}):new Response(new Blob([variant===corrupt?'changed original':'original '+variant],{type:'image/png'}));
 }));
});
afterEach(()=>{vi.unstubAllGlobals();closed.mockClear();});
const make=()=>new TripSession(createTrip({title:'Private title stays here',city:'Bilbao',cityId:'bilbao',countryCode:'ES',timeZone:null}));
it('keeps the other two real variants when one photo fails, and never mutates the board',async()=>{
 failed='brush';const s=make(),before=encodeTrip(s.doc),issue=await prepareMagazine(s);
 expect(issue.apparel?.map(a=>a.assetId)).toEqual(['mono','color']);expect(issue.pages.filter(p=>p.pattern==='merch'||p.pattern==='tee-advert')).toHaveLength(2);
 expect(issue.warnings.join(' ')).toMatch(/1.*tee.*unavailable/i);expect(encodeTrip(s.doc)).toEqual(before);expect(closed).toHaveBeenCalledTimes(2);
});
it('drops only a changed original, verifies checksum and decoded dimensions, and preserves credit',async()=>{
 for(const mode of ['checksum','dimensions']){
  corrupt=mode==='checksum'?'mono':'';wrongSize=mode==='dimensions'?'mono':'';
  const issue=await prepareMagazine(make());expect(issue.apparel?.map(a=>a.assetId)).toEqual(['brush','color']);
  expect(issue.pages.filter(p=>p.assetIds.includes('mono'))).toEqual([]);expect(issue.pages.some(p=>p.credits.includes('Actual FCC credit'))).toBe(true);
 }
});
it('omits every tee frame when no classified apparel exists and recomposes missing metadata',async()=>{
 items=[];const empty=await prepareMagazine(make());expect(empty.apparel?.length??0).toBe(0);expect(empty.pages.filter(p=>p.pattern==='merch'||p.pattern==='tee-advert')).toEqual([]);
 items=photos.filter(a=>a.variant!=='mono');const partial=await prepareMagazine(make());expect(partial.apparel?.map(a=>a.variant)).toEqual(['brush','color']);expect(partial.pages.filter(p=>p.pattern==='merch'||p.pattern==='tee-advert')).toHaveLength(2);
});
it('does not replace a missing named variant with an unrelated fourth catalog style',async()=>{
 items=[...photos.filter(a=>a.variant!=='mono'),{...photos[0],assetId:'architecture',variant:'architecture',role:undefined}];
 const issue=await prepareMagazine(make());expect(issue.apparel?.map(a=>a.variant)).toEqual(['brush','color']);
});

import {expect,it} from 'vitest';
import {createFccAdapter,MemoryCityCache,type FccCityFeed} from './city-source.ts';
import {createTrip,readAllCards} from './model.ts';
import {TripSession} from './session.ts';
import {buildMagazine} from './magazine.ts';
import {exportTripPackage} from './package.ts';
import {importTripPackage} from './import.ts';
import {encodeTrip} from './persist.ts';
import {buildMuseRequest} from './muse.ts';

const origin='https://foreignclubberscorespondence.web.app',clean='Kyoto – somebody’s street — November · issue',body='Complete fictional publisher paragraph. '.repeat(40);
// Independently reproduce UTF-8 bytes interpreted as Windows-1252, as in the reviewed title.
const corrupt=new TextDecoder('windows-1252').decode(new TextEncoder().encode(clean));
const owner={kind:'human' as const,id:'owner',name:'Owner'};
const feed=(title=corrupt):FccCityFeed=>({schema:'fcc.city.feed',version:1,city:{id:'kyoto',name:'Kyoto',countryCode:'JP',timeZone:'Asia/Tokyo'},sourceVersion:'reviewed-source-v1',articles:[{id:'thesis',title,body,canonicalUrl:origin+'/magazine/kyoto/thesis.html',publishedAt:'2026-10-19'}],places:[],almanac:[]});
async function load(title=corrupt){
 const cache=new MemoryCityCache(),raw=feed(title),adapter=createFccAdapter({feedUrl:()=>origin+'/feeds/cities/kyoto.json',cache,now:()=>new Date('2026-10-28T00:00:00Z'),fetcher:async()=>Response.json(raw)}),result=await adapter.getCity('kyoto');
 if(result.status==='unavailable')throw new Error(result.reason);
 return {cache,raw,adapter,result};
}
function add(session:TripSession,article:{title:string;body:string;source:unknown}){session.execute(owner,'trip_card_create',{kind:'note',title:article.title,body:article.body,sourceText:article.body,source:article.source,provenance:'fcc',scope:'guide'});}
const bad=/\u00e2\u20ac|\u00c2\u00b7/;

it('recovers known FCC punctuation on fresh, offline and revalidated issues without changing raw source evidence',async()=>{
 const {cache,raw,result}=await load();expect(result.value.articles[0]!.title).toBe(clean);
 const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(body)))].map(b=>b.toString(16).padStart(2,'0')).join('');
 expect(result.value.articles[0]).toMatchObject({body,source:{id:'fcc:kyoto:thesis',sourceId:'thesis',canonicalUrl:raw.articles[0]!.canonicalUrl,publishedAt:'2026-10-19',retrievedAt:'2026-10-28T00:00:00.000Z',version:raw.sourceVersion,contentHash:hash}});
 expect((await cache.read('kyoto'))!.feed).toEqual(raw);
 const reopened=createFccAdapter({feedUrl:()=>origin+'/feeds/cities/kyoto.json',cache,fetcher:async()=>new Response(null,{status:304})});
 for(const options of [{offline:true},{}])expect(await reopened.getCity('kyoto',options)).toEqual({...result,status:'cached'});
 expect((await cache.read('kyoto'))!.feed).toEqual(raw);
});
it.each(['東京 — café, São Paulo, Ângela · こんにちは','A plain title','A beautiful street is still somebody’s street'])('leaves already-correct Unicode unchanged: %s',async title=>{
 const {result}=await load(title);expect(result.value.articles[0]!.title).toBe(title);expect(result.value.articles[0]!.body).toBe(body);
});
it('saves a clean FCC title for Muse, all magazine sections and a portable reopen while keeping the full source',async()=>{
 const {result}=await load(),s=new TripSession(createTrip({title:'Kyoto issue',city:'Kyoto',cityId:'kyoto',countryCode:'JP',timeZone:'Asia/Tokyo'}));
 try{
  add(s,result.value.articles[0]!);const before=readAllCards(s.parts);
  const request=buildMuseRequest(s,{cardIds:[],prompt:'Read this issue',cityContent:result.value});expect(request.grounding.articles[0]!.title).toBe(clean);expect(request.grounding.articles[0]!.body).toBe(body);
  const magazine=buildMagazine(s.doc);expect(bad.test(magazine.pages.map(p=>p.svg).join(''))).toBe(false);
  const opened=await importTripPackage(await exportTripPackage(s.doc,new Map(),{created:'2026-10-30T00:00:00Z'}));
  try{const reopened=new TripSession(opened.doc);expect(readAllCards(reopened.parts)).toEqual(before);expect(before[0]).toMatchObject({title:clean,body,sourceText:body});expect(bad.test(buildMagazine(opened.doc).pages.map(p=>p.svg).join(''))).toBe(false);reopened.destroy();}finally{opened.doc.destroy();}
 }finally{s.destroy();}
});
it('renders the legacy saved FCC title cleanly without rewriting the card or source snapshot',()=>{
 const s=new TripSession(createTrip({title:'Legacy Kyoto',city:'Kyoto',cityId:'kyoto',countryCode:'JP',timeZone:'Asia/Tokyo'}));
 try{
  for(let i=0;i<3;i++)add(s,{title:i===1?corrupt:'Editorial '+i,body,source:{id:'article-'+i,provider:'fcc',kind:'article',url:origin+'/magazine/kyoto/'+i+'.html',retrievedAt:'2026-10-28'}});
  const before=encodeTrip(s.doc),magazine=buildMagazine(s.doc),svg=magazine.pages.map(p=>p.svg).join('');
  expect(bad.test(svg)).toBe(false);expect(svg).toContain('somebody’s street');expect(encodeTrip(s.doc)).toEqual(before);expect(readAllCards(s.parts).find(c=>c.title===corrupt)).toBeDefined();
 }finally{s.destroy();}
});

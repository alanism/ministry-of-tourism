import {expect,it,vi} from 'vitest';
import {createTrip,encodeTrip,TripSession,type FccCityContent} from '@writers-board/core';
import {requestMuseProposal} from './muse-client';
const human={kind:'human' as const,id:'owner',name:'Owner'};
const make=()=>new TripSession(createTrip({title:'Private trip title',city:'San Sebastián',cityId:'san-sebastian',timeZone:null}));
const source={id:'fcc:ss:1',url:'https://foreignclubberscorespondence.web.app/san-sebastian.html',canonicalUrl:'https://foreignclubberscorespondence.web.app/san-sebastian.html',provider:'fcc' as const,sourceId:'1',cityId:'san-sebastian',kind:'article' as const,retrievedAt:'2026-10-29',version:'1',origin:'editorial' as const};
const issue:FccCityContent={city:{id:'san-sebastian',name:'San Sebastián',countryCode:'ES',timeZone:null},places:[],almanac:[],articles:[{id:source.id,cityId:source.cityId,title:'Story',body:'A full story.',source}]};
const response=(s:TripSession,ops:unknown[]=[],sources:unknown[]=[])=>new Response(JSON.stringify({status:'ok',proposal:{boardId:s.boardId,ops,reason:'A proposal',sources},receipt:{requestId:'transport-fixture',modelId:'test-adapter',date:'2026-10-29'}}));
it('rejects overlong requests before any HTTP request or board write',async()=>{
 const s=make(),fetcher=vi.fn(async()=>response(s)),before=encodeTrip(s.doc);
 await expect(requestMuseProposal(s,{prompt:'x'.repeat(8001),cardIds:[]},issue,undefined,fetcher)).rejects.toThrow(/8,?000|long/i);expect(fetcher).not.toHaveBeenCalled();expect(encodeTrip(s.doc)).toEqual(before);
});
it('does not grant a proposal authority over unselected cards',async()=>{
 const s=make(),id=s.execute<{id:string}>(human,'trip_card_create',{kind:'note',title:'Not selected'}).id,before=encodeTrip(s.doc);
 await expect(requestMuseProposal(s,{prompt:'Plan',cardIds:[]},issue,undefined,async()=>response(s,[{command:'trip_card_update',input:{id,title:'Changed'}}]))).rejects.toThrow(/covered|selected|revision/i);expect(encodeTrip(s.doc)).toEqual(before);
});
it('rejects invented citations without an issue and mismatched retrieval dates',async()=>{
 const s=make();for(const [content,cite] of [[undefined,source],[issue,{...source,retrievedAt:'2099-01-01'}]] as const){
  const minimal={id:cite.id,url:cite.canonicalUrl,retrievedAt:cite.retrievedAt};
  await expect(requestMuseProposal(s,{prompt:'Plan',cardIds:[]},content,undefined,async()=>response(s,[],[minimal]))).rejects.toThrow(/source|citation/i);
 }
});
it('rejects a forged per-suggestion source even when the overall citation is valid',async()=>{
 const s=make();await expect(requestMuseProposal(s,{prompt:'Plan',cardIds:[]},issue,undefined,async()=>response(s,[{command:'trip_card_create',input:{kind:'note',title:'Suggestion',source:{id:source.id,url:'https://evil.example/claim',retrievedAt:source.retrievedAt}}}],[{id:source.id,url:source.canonicalUrl,retrievedAt:source.retrievedAt}]))).rejects.toThrow(/source|citation/i);
});
it('refuses a complete issue above the unchanged server byte limit without truncating or posting',async()=>{
 const s=make(),content=structuredClone(issue);content.articles[0]!.body='a'.repeat(97000);const fetcher=vi.fn(async()=>response(s));
 await expect(requestMuseProposal(s,{prompt:'Plan',cardIds:[]},content,undefined,fetcher)).rejects.toThrow(/input limit/);expect(fetcher).not.toHaveBeenCalled();expect(content.articles[0]!.body).toHaveLength(97000);
});
it('rejects a late answer even when its transport ignores cancellation',async()=>{
 const s=make(),before=encodeTrip(s.doc),controller=new AbortController();let release!:()=>void;
 const waiting=new Promise<void>(resolve=>{release=resolve;});
 const pending=requestMuseProposal(s,{prompt:'Plan',cardIds:[]},issue,controller.signal,async()=>{await waiting;return response(s,[{command:'trip_card_create',input:{kind:'note',title:'Late'}}]);});
 controller.abort();release();await expect(pending).rejects.toThrow();expect(encodeTrip(s.doc)).toEqual(before);
});
it('resolves an optional citation URL to the known public article link for review',async()=>{
 const s=make(),cite={id:source.id,retrievedAt:source.retrievedAt};
 const result=await requestMuseProposal(s,{prompt:'Plan',cardIds:[]},issue,undefined,async()=>response(s,[],[cite]));
 expect(result.proposal.sources[0]!.url).toBe(source.canonicalUrl);
});

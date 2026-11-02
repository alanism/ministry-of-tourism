import {expect,it,vi} from 'vitest';
const observed=vi.hoisted(()=>({refs:[] as string[]}));
vi.mock('zod',async original=>{const actual=await original<typeof import('zod')>();return{...actual,z:{...actual.z,fromJSONSchema:(...args:Parameters<typeof actual.z.fromJSONSchema>)=>{observed.refs.push(String((args[0] as {$ref?:string}).$ref));return actual.z.fromJSONSchema(...args);}}};});
import type {FileExchangeStore,FileContextRecord} from './file-exchange';
import {createTrip} from './model';
import {TripSession} from './session';
it('does not compile unused validators on import and caches the exact contract validator at each first parse',async()=>{
 const{FileExchange}=await import('./file-exchange');expect(observed.refs).toEqual([]);
 const actor={kind:'human' as const,id:'owner',name:'Owner'},session=new TripSession(createTrip({boardId:'lazy-schema',title:'Synthetic',city:'Aspen',cityId:'aspen',timeZone:'America/Denver'})),card=session.execute<{id:string}>(actor,'trip_card_create',{kind:'note',title:'Selected',scope:'stay'}).id,contexts=new Map<string,FileContextRecord>();
 const store:FileExchangeStore={withBoardLock:async(_board,work)=>work(),getContext:async(_board,id)=>structuredClone(contexts.get(id)??null),putContext:async r=>{contexts.set(r.contextRequestId,structuredClone(r));},getProposal:async()=>null,putProposal:async()=>{},list:async()=>[]},service=new FileExchange(session,actor,store,{documentIdentity:'native-lazy',readDocumentIdentity:async()=> 'native-lazy',now:()=>Date.parse('2026-11-03T00:00:00Z'),whenSaved:async()=>{},hasAssetBytes:async()=>false,hasPendingNativeProposalId:()=>false});
 expect(observed.refs).toEqual([]);await service.issue({selectedCardIds:[card],guideVersion:'1',catalogSnapshot:'1'});await service.issue({selectedCardIds:[card],guideVersion:'1',catalogSnapshot:'1'});expect(observed.refs).toEqual(['#/$defs/contextRequest']);
 const invalid=new TextEncoder().encode('{}');await expect(service.importProposal(invalid)).rejects.toThrow();await expect(service.importProposal(invalid)).rejects.toThrow();expect(observed.refs).toEqual(['#/$defs/contextRequest','#/$defs/proposalArtifact']);expect(contexts.size).toBe(2);service.cancel();
});

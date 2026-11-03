import {expect,it,vi} from 'vitest';
vi.mock('./package.ts',()=>{throw Error('File exchange hashing must not initialize the unused portable package exporter');});
import {FileExchange,type FileExchangeStore,type FileContextRecord} from './file-exchange';
import {createTrip} from './model';
import {TripSession} from './session';
import {canonicalFileJson} from './file-exchange-json';
it('issues a native context with canonical SHA256 without loading the portable package exporter',async()=>{
 const actor={kind:'human' as const,id:'owner',name:'Owner'},session=new TripSession(createTrip({boardId:'sha-boundary',title:'Synthetic',city:'Aspen',cityId:'aspen',timeZone:'America/Denver'})),card=session.execute<{id:string}>(actor,'trip_card_create',{kind:'note',title:'Selected',body:'Explicit shared text',scope:'stay'}).id,contexts=new Map<string,FileContextRecord>();
 const store:FileExchangeStore={withBoardLock:async(_board,work)=>work(),getContext:async(_board,id)=>structuredClone(contexts.get(id)??null),putContext:async record=>{contexts.set(record.contextRequestId,structuredClone(record));},getProposal:async()=>null,putProposal:async()=>{},list:async()=>[]};
 const exchange=new FileExchange(session,actor,store,{documentIdentity:'native-boundary',readDocumentIdentity:async()=> 'native-boundary',now:()=>Date.parse('2026-11-03T00:00:00Z'),whenSaved:async()=>{},hasAssetBytes:async()=>false,hasPendingNativeProposalId:()=>false});
 const issued=await exchange.issue({selectedCardIds:[card],guideVersion:'1',catalogSnapshot:'1'}),{contextDigest,...body}=issued.context,expected=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonicalFileJson(body)));
 expect(contextDigest).toBe([...new Uint8Array(expected)].map(byte=>byte.toString(16).padStart(2,'0')).join(''));expect(contexts.size).toBe(1);expect(new TextDecoder().decode(issued.bytes)).toContain('Explicit shared text');exchange.cancel();
});

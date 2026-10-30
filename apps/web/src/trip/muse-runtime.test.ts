import {expect,it,vi} from 'vitest';
import {createTrip,encodeTrip,TripSession} from '@writers-board/core';
import {requestMuseProposal,museDiagnosticText} from './muse-client';
const make=()=>new TripSession(createTrip({title:'PRIVATE-BOARD-TITLE',city:'Bilbao',timeZone:null}));
it('retains typed failure and a projected receipt without server message/body/extra fields',async()=>{
 const s=make(),before=encodeTrip(s.doc);let caught:unknown;
 try{await requestMuseProposal(s,{prompt:'PRIVATE-PROMPT',cardIds:[]},undefined,undefined,async()=>Response.json({status:'error',error:{code:'timeout',message:'PRIVATE-PROVIDER-BODY'},receipt:{requestId:'request-safe',modelId:'muse-spark-1.3',date:'2026-10-29',latencyMs:123,prompt:'PRIVATE-PROMPT'}}));}catch(error){caught=error;}
 expect(caught).toMatchObject({code:'timeout',diagnostic:{requestId:'request-safe',boardId:s.boardId,revision:0}});expect(String(caught)).not.toContain('PRIVATE');
 const serialized=museDiagnosticText(caught as never);expect(serialized).not.toContain('PRIVATE');expect(JSON.parse(serialized)).toMatchObject({latencyMs:123,errorClass:'timed_out'});expect(encodeTrip(s.doc)).toEqual(before);
});
it('types a non-JSON proxy failure and a rate-limit response without trusting their text',async()=>{
 for(const [response,code] of [[new Response('<html>PRIVATE-PROXY</html>',{status:502}),'invalid_response'],[Response.json({status:'error',error:{code:'rate_limited',message:'PRIVATE-DETAIL'}},{status:429}),'rate_limited']] as const){
  await expect(requestMuseProposal(make(),{prompt:'Plan',cardIds:[]},undefined,undefined,async()=>response)).rejects.toMatchObject({code});
 }
});
it('types local oversized input before any request',async()=>{
 const fetcher=vi.fn();await expect(requestMuseProposal(make(),{prompt:'x'.repeat(8001),cardIds:[]},undefined,undefined,fetcher)).rejects.toMatchObject({code:'invalid_request'});expect(fetcher).not.toHaveBeenCalled();
});

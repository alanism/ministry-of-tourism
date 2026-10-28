import { describe,expect,it } from 'vitest';
import { createTrip,TripSession } from '@writers-board/core';
import { requestMuseProposal } from './muse-client';
const actor={kind:'human' as const,id:'owner',name:'Owner'};
describe('MOT-95 browser revision boundary',()=>{
  it('rejects a response after destination metadata changed during the request',async()=>{
    const session=new TripSession(createTrip({title:'Trip',city:'bilbao',timeZone:null}));
    const fetcher=async()=>{session.execute(actor,'trip_meta_update',{city:'Madrid',countryCode:'ES',timeZone:null});return new Response(JSON.stringify({status:'ok',proposal:{boardId:session.boardId,ops:[],reason:'Done',sources:[]},receipt:{requestId:'fixture',modelId:'fixture',date:'2026-10-28'}}),{status:200});};
    await expect(requestMuseProposal(session,{prompt:'Plan',cardIds:[]},undefined,undefined,fetcher as typeof fetch)).rejects.toThrow(/changed/);
  });
  it('sends only explicitly selected nonprivate cards and labels an absent issue',async()=>{
    const session=new TripSession(createTrip({title:'Trip',city:'bilbao',timeZone:null}));
    session.execute(actor,'trip_card_create',{kind:'note',title:'Secret',body:'stay-code',scope:'private'});
    let sent='';
    const fetcher=async(_url:unknown,options?:RequestInit)=>{sent=String(options?.body);return new Response(JSON.stringify({status:'unavailable',reason:'Owner has not enabled Muse'}),{status:503});};
    await expect(requestMuseProposal(session,{prompt:'Plan',cardIds:[]},undefined,undefined,fetcher as typeof fetch)).rejects.toThrow(/not enabled/);
    expect(sent).not.toContain('stay-code');expect(JSON.parse(sent).grounding.level).toBe('unavailable');
  });
});

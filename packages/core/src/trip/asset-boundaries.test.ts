import { describe, expect, it } from 'vitest';
import { createTrip, readAsset, readPresentations } from './model.ts';
import { TripSession } from './session.ts';
import { applyProposal, type Proposal } from './proposals.ts';
import { encodeTrip } from './persist.ts';
import { exportTripPackage, sha256Hex } from './package.ts';

const human={kind:'human' as const,id:'owner',name:'Owner'};
const agent={kind:'agent' as const,id:'agent',name:'Agent'};
const asset={id:'private-media',hash:'a'.repeat(64),mime:'image/png',role:'original' as const};
function fixture(){
  const session=new TripSession(createTrip({title:'Fixture',city:'Test',timeZone:null}));
  const privateCard=session.execute<{id:string}>(human,'trip_card_create',{kind:'photo',title:'Private photo',scope:'private'});
  const publicCard=session.execute<{id:string}>(human,'trip_card_create',{kind:'note',title:'Shared note',scope:'guide'});
  session.execute(human,'trip_asset_attach',{cardId:privateCard.id,asset});
  return {session,privateCard,publicCard};
}
describe('immutable media identity and agent sharing boundaries',()=>{
  it('rejects replacing an existing asset for either actor before any change',()=>{
    const {session}=fixture();const before=encodeTrip(session.doc);
    for(const actor of [human,agent])expect(()=>session.execute(actor,'trip_asset_register',{asset:{...asset,hash:'b'.repeat(64)}})).toThrow();
    expect(readAsset(session.parts,asset.id)!.hash).toBe(asset.hash);expect(encodeTrip(session.doc)).toEqual(before);
  });
  it('prevents linking private existing media through create, attach, register or placement',()=>{
    const {session,publicCard}=fixture();const before=encodeTrip(session.doc);
    const ops=[{command:'trip_card_create',input:{kind:'photo',title:'Leaked',assetIds:[asset.id]}},{command:'trip_asset_attach',input:{cardId:publicCard.id,asset}},{command:'trip_asset_register',input:{asset}},{command:'trip_presentation_create',input:{cardId:publicCard.id,assetId:asset.id}}];
    for(const op of ops)expect(()=>session.execute(agent,op.command,op.input)).toThrow(/private/i);
    expect(encodeTrip(session.doc)).toEqual(before);
  });
  it('does not route model-proposed private media through a human approver',()=>{
    const {session,publicCard}=fixture();const before=encodeTrip(session.doc);
    const proposal:Proposal={id:'media-proposal',boardId:session.boardId,token:session.token([publicCard.id]),ops:[{command:'trip_asset_attach',input:{cardId:publicCard.id,asset}}],sources:[],reason:'fixture',author:agent.id,status:'proposed'};
    expect(()=>applyProposal(session,human,proposal)).toThrow(/private/i);expect(encodeTrip(session.doc)).toEqual(before);
  });
  it('lets the owner place the same immutable asset more than once',()=>{
    const {session,privateCard}=fixture();session.execute(human,'trip_asset_register',{asset});
    for(const x of [.1,.5])session.execute(human,'trip_presentation_create',{cardId:privateCard.id,assetId:asset.id,x});
    expect(readPresentations(session.parts)).toHaveLength(2);expect(session.parts.assets.size).toBe(1);
  });
  it('rejects a model-chosen audience on new cards before applying any operations',()=>{
    const {session}=fixture();const before=encodeTrip(session.doc);
    const proposal:Proposal={id:'scope-proposal',boardId:session.boardId,token:session.token([]),ops:[{command:'trip_card_create',input:{kind:'note',title:'first'}},{command:'trip_card_create',input:{kind:'note',title:'Model audience',scope:'guide'}}],sources:[],reason:'fixture',author:agent.id,status:'proposed'};
    expect(()=>applyProposal(session,human,proposal)).toThrow(/scope|who can see/i);expect(encodeTrip(session.doc)).toEqual(before);
  });
  it('refuses to emit a backup whose original asset cannot pass its import limit',async()=>{
    const session=new TripSession(createTrip({title:'Large art',city:'Test',timeZone:null}));
    const card=session.execute<{id:string}>(human,'trip_card_create',{kind:'photo',title:'Large image'});
    const bytes=new Uint8Array(11*1024*1024);const large={...asset,id:'large',hash:await sha256Hex(bytes)};
    session.execute(human,'trip_asset_attach',{cardId:card.id,asset:large});
    await expect(exportTripPackage(session.doc,new Map([['large',bytes]]),{includePrivate:true})).rejects.toThrow(/too large|limit/i);
  });
});

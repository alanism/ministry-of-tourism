import { describe, expect, it } from 'vitest';
import { createTrip, encodeTrip, TripSession } from '@writers-board/core';
import { createTripApi } from './agentApi';

describe('MOT-70 trip agent boundary', () => {
  const make = () => new TripSession(createTrip({ title:'Trip',city:'bilbao',timeZone:'Europe/Madrid',boardId:'visible-trip' }));
  it('probes identity without exposing private content or mutating', () => {
    const session=make();
    session.execute({kind:'human',id:'owner',name:'Owner'},'trip_card_create',{kind:'note',title:'Private guest name',body:'stay-code',scope:'private'});
    const before=encodeTrip(session.doc);
    const api=createTripApi(session);
    expect(api.probe()).toMatchObject({boardId:'visible-trip',revision:session.boardRev});
    expect(JSON.stringify(api.probe())).not.toMatch(/stay-code|Private guest name/);
    expect(encodeTrip(session.doc)).toEqual(before);
    expect(api.capabilities().commands.every(command=>command.name.startsWith('trip_'))).toBe(true);
    expect(()=>api.call('board_read',{})).toThrow();
  });
  it('rejects stale or wrong-document changes before the first write', () => {
    const session=make(),api=createTripApi(session),before=encodeTrip(session.doc);
    expect(()=>api.execute({boardId:'hidden-writer',revision:0,ops:[{command:'trip_card_create',input:{kind:'note',title:'bad'}}]})).toThrow();
    expect(()=>api.execute({boardId:session.boardId,revision:999,ops:[]})).toThrow();
    expect(encodeTrip(session.doc)).toEqual(before);
  });
  it('applies an ordinary valid run directly and undoes it as one unit', () => {
    const session=make(),api=createTripApi(session);
    const receipt=api.execute({boardId:session.boardId,revision:0,ops:[{command:'trip_card_create',input:{kind:'note',title:'One'}},{command:'trip_card_create',input:{kind:'task',title:'Two'}}]});
    expect(receipt).toMatchObject({boardId:session.boardId,revision:1});
    expect(api.read().cards).toHaveLength(2);
    expect(api.undo()).toBe(true);
    expect(api.read().cards).toHaveLength(0);
  });
  it('reports persisted only after the durable-write promise completes',async()=>{
    const session=make();let finish!:()=>void;
    const durable=new Promise<void>(resolve=>{finish=resolve;});
    const api=createTripApi(session,{whenSaved:()=>durable});
    const saved=api.persist();
    expect(api.operation()?.phase).toBe('persisting');
    finish();await saved;
    expect(api.operation()).toMatchObject({phase:'persisted',boardId:session.boardId,revision:session.boardRev});
  });
  it('reads visible composition metadata while excluding private art',()=>{
    const session=make(),owner={kind:'human' as const,id:'owner',name:'Owner'};
    for(const [id,scope] of [['public-art','guide'],['private-art','private']] as const){
      session.execute(owner,'trip_asset_register',{asset:{id,hash:(scope==='guide'?'a':'b').repeat(64),mime:'image/png',role:'original'}});
      session.execute(owner,'trip_presentation_create',{assetId:id,scope});
    }
    const read=createTripApi(session).read();
    expect(read.presentations).toHaveLength(1);expect(read.assets.map(asset=>asset.id)).toEqual(['public-art']);
    expect(JSON.stringify(read)).not.toContain('private-art');
  });
});

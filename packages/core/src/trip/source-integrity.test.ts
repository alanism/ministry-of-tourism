import {describe,expect,it} from 'vitest';
import {createTrip} from './model.ts';
import {TripSession} from './session.ts';
import {encodeTrip} from './persist.ts';
describe('MOT-71 source integrity',()=>{
  it('does not let a direct agent replace source text or assert current verified facts',()=>{
    const session=new TripSession(createTrip({title:'Trip',city:'Bilbao',timeZone:null}));
    const {id}=session.execute<{id:string}>({kind:'human',id:'owner',name:'Owner'},'trip_card_create',{kind:'note',title:'Source',sourceText:'Original editorial',scope:'guide'});
    const before=encodeTrip(session.doc),agent={kind:'agent' as const,id:'agent',name:'Agent'};
    expect(()=>session.execute(agent,'trip_card_update',{id,sourceText:'Forged editorial'})).toThrow();
    expect(()=>session.execute(agent,'trip_card_update',{id,currentFacts:[{field:'price',value:'1',evidenceUrl:'https://example.com',observedAt:'2026-10-28'}]})).toThrow();
    expect(encodeTrip(session.doc)).toEqual(before);
  });
});

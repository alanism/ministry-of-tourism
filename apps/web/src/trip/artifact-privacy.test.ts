import {unzipSync,strFromU8} from 'fflate';
import {describe,expect,it} from 'vitest';
import {createTrip,TripSession} from '@writers-board/core';
import {createTripArtifact} from './artifacts';
describe('MOT-92 agent artifact privacy',()=>{
  it('excludes private content from an explicitly shared artifact',async()=>{
    const session=new TripSession(createTrip({title:'Trip',city:'Bilbao',timeZone:null}));
    session.execute({kind:'human',id:'owner',name:'Owner'},'trip_card_create',{kind:'note',title:'Private',body:'host-private-stay-code',scope:'private'});
    const artifact=await createTripArtifact(session,'zip',undefined,{includePrivate:false});
    const files=unzipSync(new Uint8Array(await (await fetch(artifact.url)).arrayBuffer()));
    expect(strFromU8(files['trip.json']!)).not.toContain('host-private-stay-code');
    URL.revokeObjectURL(artifact.url);
  });
});

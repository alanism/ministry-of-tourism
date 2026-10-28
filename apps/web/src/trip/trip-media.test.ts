import { afterEach, describe, expect, it, vi } from 'vitest';
import {createTrip,TripSession} from '@writers-board/core';
const hashing=vi.hoisted(()=>({wait:undefined as Promise<void>|undefined,started:undefined as (()=>void)|undefined,writes:0}));
vi.mock('../state/blobs',()=>({hashBlob:async()=>{hashing.started?.();if(hashing.wait)await hashing.wait;return 'a'.repeat(64);},putBlob:async()=>{hashing.writes++;throw new DOMException('Full','QuotaExceededError');},getBlob:async()=>null,blobUrl:async()=>null}));
import { getTripBlob, placeTripArtwork, storeTripBlob } from './trip-assets';
afterEach(()=>{hashing.wait=undefined;hashing.started=undefined;hashing.writes=0;vi.unstubAllGlobals();});

describe('MOT-90 quota recovery',()=>{
  it('retains selected bytes in this tab when durable storage fails',async()=>{
    const original=new Blob(['selected-original'],{type:'image/png'});
    const stored=await storeTripBlob(original);
    expect(stored).toMatchObject({hash:'a'.repeat(64),persisted:false});
    expect(await (await getTripBlob(stored.hash))!.text()).toBe('selected-original');
  });
  it('cancels hashing before any document or persistent-blob commit',async()=>{
    const session=new TripSession(createTrip({title:'Trip',city:'Bilbao',timeZone:null})),controller=new AbortController();
    let finish!:()=>void,started!:()=>void;
    hashing.wait=new Promise<void>(resolve=>{finish=resolve;});const began=new Promise<void>(resolve=>{started=resolve;});hashing.started=started;
    vi.stubGlobal('fetch',async()=>new Response(new Blob(['image'],{type:'image/png'})));
    const run=placeTripArtwork(session,{kind:'human',id:'owner',name:'Owner'},{id:'fixture',styleId:'fixture',subject:'objects',label:'Fixture',src:'https://foreignclubberscorespondence.web.app/assets/generated/fixture.png',thumb:'https://foreignclubberscorespondence.web.app/assets/generated/fixture.png',width:40,height:40},controller.signal);
    await began;controller.abort();finish();
    await expect(run).rejects.toThrow();expect(session.parts.assets.size).toBe(0);expect(session.parts.presentations.size).toBe(0);
  });
  it('reuses one registered original for repeated placements',async()=>{
    const session=new TripSession(createTrip({title:'Trip',city:'Bilbao',timeZone:null}));
    vi.stubGlobal('fetch',async()=>new Response(new Blob(['image'],{type:'image/png'})));
    const art={id:'fixture-repeat',styleId:'fixture',subject:'objects',label:'Fixture',src:'https://foreignclubberscorespondence.web.app/assets/generated/fixture.png',thumb:'https://foreignclubberscorespondence.web.app/assets/generated/fixture.png',width:40,height:40};
    for(let i=0;i<2;i++)await placeTripArtwork(session,{kind:'human',id:'owner',name:'Owner'},art,new AbortController().signal);
    expect(session.parts.assets.size).toBe(1);expect(session.parts.presentations.size).toBe(2);
  });
  it('checks available storage before attempting a known oversized write',async()=>{
    vi.stubGlobal('navigator',{storage:{estimate:async()=>({quota:100,usage:99})}});
    const result=await storeTripBlob(new Blob(['larger than one byte'],{type:'image/png'}));
    expect(result.persisted).toBe(false);expect(hashing.writes).toBe(0);
  });
});

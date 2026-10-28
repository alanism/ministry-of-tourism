import {afterEach,describe,expect,it,vi} from 'vitest';
import {createTrip,TripSession} from '@writers-board/core';
import * as artifacts from './artifacts';
import {unzipSync,strFromU8} from 'fflate';
afterEach(()=>{vi.useRealTimers();vi.restoreAllMocks();});
const session=()=>new TripSession(createTrip({title:'Export fixture',city:'Bilbao',timeZone:null}));
describe('real export delivery receipts',()=>{
  it('returns read-back bytes, creation time and SHA-256 even when browser keeping is unavailable',async()=>{
    const artifact=await artifacts.createTripArtifact(session(),'zip',undefined,{includePrivate:false});
    const richer=artifact as typeof artifact&{id:string;createdAt:string;sha256:string;kept:boolean};
    expect(richer.id).toBeTruthy();expect(richer.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);expect(richer.kept).toBe(false);
    const bytes=await(await fetch(artifact.url)).arrayBuffer();expect(bytes.byteLength).toBe(artifact.byteCount);
    const actual=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(byte=>byte.toString(16).padStart(2,'0')).join('');expect(richer.sha256).toBe(actual);
  });
  it('keeps a downloadable artifact available after the former fifteen-minute URL expiry',async()=>{
    vi.useFakeTimers();const revoke=vi.spyOn(URL,'revokeObjectURL');
    const artifact=await artifacts.createTripArtifact(session(),'zip',undefined,{includePrivate:false});
    await vi.advanceTimersByTimeAsync(16*60*1000);expect(revoke).not.toHaveBeenCalledWith(artifact.url);expect((await fetch(artifact.url)).ok).toBe(true);
  });
  it('defaults to a shared copy and honors guide-only inventory without touching excluded media',async()=>{
    const s=session(),owner={kind:'human' as const,id:'owner',name:'Owner'};
    for(const scope of ['guide','stay','private'])s.execute(owner,'trip_card_create',{kind:'note',title:`${scope}-content`,scope});
    const guide=await artifacts.createTripArtifact(s,'zip',undefined,{variant:'guide'});
    const decoded=strFromU8(unzipSync(new Uint8Array(await(await fetch(guide.url)).arrayBuffer()))['trip.json']!);
    expect(decoded).toContain('guide-content');expect(decoded).not.toContain('stay-content');expect(decoded).not.toContain('private-content');
    const shared=await artifacts.createTripArtifact(s,'zip');const sharedText=strFromU8(unzipSync(new Uint8Array(await(await fetch(shared.url)).arrayBuffer()))['trip.json']!);expect(sharedText).toContain('stay-content');expect(sharedText).not.toContain('private-content');
  });
  it('records a pre-aborted export as cancelled without advertising ready bytes',async()=>{
    const controller=new AbortController();controller.abort();const states:string[]=[];
    await expect(artifacts.createTripArtifact(session(),'zip',controller.signal,{onState:state=>states.push(state.phase)})).rejects.toThrow();
    expect(states.at(-1)).toBe('cancelled');expect(states).not.toContain('exported');
  });
});

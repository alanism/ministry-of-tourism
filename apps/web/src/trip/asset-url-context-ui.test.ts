import {afterEach,expect,it,vi} from 'vitest';
import {createTrip,encodeTrip,loadTrip,TripSession} from '@writers-board/core';
import {useAssetMedia,useAssetUrl} from './trip-assets';

// Exercise the hook's synchronous return and deferred effect separately, without a DOM dependency.
const hooks=vi.hoisted(()=>({cursor:0,states:[] as unknown[],effects:[] as {deps:unknown[];cleanup?:()=>void}[],pending:[] as (()=>void)[]}));
const storage=vi.hoisted(()=>({getBlob:vi.fn<(hash:string)=>Promise<Blob|null>>()}));
vi.mock('../state/blobs',()=>({getBlob:storage.getBlob,hashBlob:vi.fn(),putBlob:vi.fn()}));
vi.mock('react',async original=>({...await original<typeof import('react')>(),
 useState(initial:unknown){const slot=hooks.cursor++;if(!(slot in hooks.states))hooks.states[slot]=initial;return[hooks.states[slot],(value:unknown)=>{hooks.states[slot]=value;}];},
 useEffect(effect:()=>void|(()=>void),deps:unknown[]){const slot=hooks.cursor++,previous=hooks.effects[slot];if(previous&&deps.every((value,index)=>Object.is(value,previous.deps[index])))return;hooks.effects[slot]={deps};hooks.pending.push(()=>{previous?.cleanup?.();const cleanup=effect();if(cleanup)hooks.effects[slot]!.cleanup=cleanup;});},
}));
const actor={kind:'human' as const,id:'owner',name:'Owner'};
function fixture(){const session=new TripSession(createTrip({title:'Trip',city:'Bangkok',timeZone:'Asia/Bangkok',boardId:'trip'}));const {id}=session.execute<{id:string}>(actor,'trip_card_create',{kind:'photo',scope:'stay'});for(const assetId of ['first','same-bytes'])session.execute(actor,'trip_asset_attach',{cardId:id,asset:{id:assetId,hash:'a'.repeat(64),mime:'image/png',role:'original'}});return session;}
function render(session:TripSession,assetId:string|undefined){hooks.cursor=0;return useAssetUrl(session,assetId);}
function renderMedia(session:TripSession,assetId:string|undefined){hooks.cursor=0;return useAssetMedia(session,assetId);}
function effects(){for(const effect of hooks.pending.splice(0))effect();}
const settled=async()=>{await Promise.resolve();await Promise.resolve();};
afterEach(()=>{for(const effect of hooks.effects)effect?.cleanup?.();hooks.cursor=0;hooks.states=[];hooks.effects=[];hooks.pending=[];storage.getBlob.mockReset();vi.restoreAllMocks();});

it('refetches restored bytes for a new native session with the same asset ID and hash',async()=>{
 const session=fixture(),restored=new TripSession(loadTrip(encodeTrip(session.doc)));storage.getBlob.mockResolvedValue(null);vi.spyOn(URL,'createObjectURL').mockReturnValue('blob:restored');vi.spyOn(URL,'revokeObjectURL').mockImplementation(()=>{});
 expect(renderMedia(session,'first')).toEqual({url:null,status:'loading'});effects();await settled();expect(renderMedia(session,'first')).toEqual({url:null,status:'missing'});
 storage.getBlob.mockResolvedValue(new Blob(['restored'],{type:'image/png'}));expect(renderMedia(restored,'first')).toEqual({url:null,status:'loading'});effects();await settled();expect(renderMedia(restored,'first')).toEqual({url:'blob:restored',status:'ready'});session.destroy();restored.destroy();
});
it('hides the previous asset URL synchronously when a same-hash asset or scope changes',async()=>{
 const session=fixture();storage.getBlob.mockResolvedValue(new Blob(['photo'],{type:'image/png'}));vi.spyOn(URL,'createObjectURL').mockReturnValue('blob:first');vi.spyOn(URL,'revokeObjectURL').mockImplementation(()=>{});
 render(session,'first');effects();await settled();expect(render(session,'first')).toBe('blob:first');expect(render(session,'same-bytes')).toBeNull();effects();await settled();expect(render(session,'same-bytes')).toBe('blob:first');expect(render(session,undefined)).toBeNull();effects();session.destroy();
});
it('does not publish an old pending read after session/scope cancellation',async()=>{
 const session=fixture(),restored=new TripSession(loadTrip(encodeTrip(session.doc)));let finish!:(value:Blob|null)=>void;storage.getBlob.mockReturnValueOnce(new Promise(resolve=>{finish=resolve;}));const create=vi.spyOn(URL,'createObjectURL').mockReturnValue('blob:stale');vi.spyOn(URL,'revokeObjectURL').mockImplementation(()=>{});
 render(session,'first');effects();expect(render(restored,undefined)).toBeNull();effects();finish(new Blob(['private'],{type:'image/png'}));await settled();expect(render(restored,undefined)).toBeNull();expect(create).not.toHaveBeenCalled();session.destroy();restored.destroy();
});

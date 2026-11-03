import {expect,it,vi} from 'vitest';
import {createSharedRoomClient} from './shared-room-client';
const payload={id:'card',kind:'note',title:'Shared note',body:'Visible',stage:'plan',provenance:'traveler',assetIds:[],x:0,y:0};
const snapshot={serviceMode:'local-emulator',schemaMajor:1,capabilities:['room-cards/1'],roomId:'room',principal:{uid:'owner',role:'owner',membershipEpoch:1,householdId:null,householdEpoch:null},cards:[{version:1,authorUid:'owner',updatedAt:1,payload}],sync:'accepted'};
const auth=()=>({uid:'owner',getIdToken:vi.fn(async()=> 'synthetic-token')});
it('refuses nonlocal/non-demo configuration before obtaining identity or making requests',()=>{
 const identity=auth(),fetcher=vi.fn();
 for(const baseUrl of ['https://production.invalid','http://127.0.0.1.evil.invalid:8787','http://user:secret@127.0.0.1:8787','http://127.0.0.1:8787?secret=x'])expect(()=>createSharedRoomClient({baseUrl,projectId:'demo-room',auth:identity,fetcher})).toThrow();
 expect(()=>createSharedRoomClient({baseUrl:'http://127.0.0.1:8787',projectId:'production-project',auth:identity,fetcher})).toThrow();expect(identity.getIdToken).not.toHaveBeenCalled();expect(fetcher).not.toHaveBeenCalled();
});
it('sends only a header credential and binds strict returned data to initiating account and room',async()=>{
 const fetcher=vi.fn<typeof fetch>(async()=>Response.json(snapshot)),identity=auth(),client=createSharedRoomClient({baseUrl:'http://127.0.0.1:8787',projectId:'demo-room',auth:identity,fetcher});
 expect((await client.read('room')).principal.uid).toBe('owner');
 const [url,request]=fetcher.mock.calls[0]!;expect(url).toBe('http://127.0.0.1:8787/rooms/room');expect(request).toMatchObject({credentials:'omit',redirect:'error',referrerPolicy:'no-referrer',cache:'no-store'});expect(new Headers(request?.headers).get('authorization')).toBe('Bearer synthetic-token');
 fetcher.mockImplementation(async()=>Response.json({...snapshot,principal:{...snapshot.principal,uid:'other'}}));await expect(client.read('room')).rejects.toMatchObject({code:'unavailable'});
 fetcher.mockImplementation(async()=>Response.json({...snapshot,privateHistory:'PRIVATE-CANARY'}));await expect(client.read('room')).rejects.toMatchObject({code:'invalid-response'});
});
it('cancels before token use and ignores a late token or network result after cancellation',async()=>{
 const first=new AbortController(),identity=auth(),fetcher=vi.fn(async()=>Response.json(snapshot));first.abort();const client=createSharedRoomClient({baseUrl:'http://127.0.0.1:8787',projectId:'demo-room',auth:identity,fetcher});await expect(client.read('room',first.signal)).rejects.toThrow();expect(identity.getIdToken).not.toHaveBeenCalled();
 let token!:(value:string)=>void;identity.getIdToken.mockImplementation(()=>new Promise(resolve=>{token=resolve;}));const second=new AbortController(),pending=client.read('room',second.signal),rejected=expect(pending).rejects.toThrow();await Promise.resolve();second.abort();token('late-token');await rejected;expect(fetcher).not.toHaveBeenCalled();
});
it('does not echo server diagnostics and bounds streamed responses before accepting a snapshot',async()=>{
 const identity=auth(),fetcher=vi.fn(async()=>Response.json({error:{code:'unavailable',message:'PRIVATE-SERVER-CANARY',recoverableDraft:true}},{status:403})),client=createSharedRoomClient({baseUrl:'http://127.0.0.1:8787',projectId:'demo-room',auth:identity,fetcher});
 await expect(client.read('room')).rejects.toMatchObject({code:'unavailable'});try{await client.read('room');}catch(error){expect(String(error)).not.toContain('PRIVATE-SERVER-CANARY');}
 fetcher.mockImplementation(async()=>new Response('{}',{headers:{'content-length':String(50*1024*1024+1)}}));await expect(client.read('room')).rejects.toMatchObject({code:'limit'});
});
it('sends the exact strict operation and refuses a receipt for another operation or account',async()=>{
 const operation={roomId:'room',schemaMajor:1 as const,capability:'room-cards/1' as const,operationId:'operation',membershipEpoch:1,kind:'edit' as const,cardId:'card',baseVersion:1,payload:{...payload,kind:'note' as const,stage:'plan' as const,provenance:'traveler' as const}};
 const result={receipt:{operationId:'operation',uid:'owner',kind:'edit',cardId:'card',version:2,requestDigest:'a'.repeat(64),beforeDigest:'b'.repeat(64),afterDigest:'c'.repeat(64),acceptedAt:2},replayed:false};
 const fetcher=vi.fn<typeof fetch>(async()=>Response.json(result)),identity=auth(),client=createSharedRoomClient({baseUrl:'http://127.0.0.1:8787',projectId:'demo-room',auth:identity,fetcher});
 expect((await client.operate(operation)).receipt.version).toBe(2);expect(JSON.parse(String(fetcher.mock.calls[0]![1]?.body))).toEqual(operation);expect(String(fetcher.mock.calls[0]![0])).toBe('http://127.0.0.1:8787/rooms/room/operations');
 fetcher.mockImplementation(async()=>Response.json({...result,receipt:{...result.receipt,uid:'other'}}));await expect(client.operate(operation)).rejects.toMatchObject({code:'invalid-response'});
 const before=identity.getIdToken.mock.calls.length;await expect(client.operate({...operation,actor:{kind:'human',id:'forged'}} as never)).rejects.toThrow();expect(identity.getIdToken.mock.calls).toHaveLength(before);
});

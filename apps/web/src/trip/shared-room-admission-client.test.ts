import {expect,it,vi} from 'vitest';
import {createSharedRoomClient} from './shared-room-client';
import {consumeSharedRoomInvite,sharedRoomInviteUrl} from './shared-room-invite';
import {roomAdminOperationId,type RoomAdminReceipt} from '../../../../packages/core/src/trip/shared-room-admission';
const secret='a'.repeat(64),inviteId='b'.repeat(64),expiresAt=1800000000000,common={schemaMajor:1 as const,capability:'room-admission/1' as const,baseVersion:0};
async function intent<T extends Record<string,unknown>>(kind:RoomAdminReceipt['kind'],body:T){return{...body,operationId:await roomAdminOperationId('owner','room',kind,body)};}
function receipt(operationId:string,kind:RoomAdminReceipt['kind']){return{receipt:{operationId,uid:'owner',kind,requestDigest:'d'.repeat(64),version:1,acceptedAt:1},replayed:false};}
function fixture(){const fetcher=vi.fn<typeof fetch>(async(_url,init)=>Response.json({created:true,roomId:'room',...receipt(JSON.parse(String(init?.body)).operationId,'create')})),token=vi.fn(async()=>'synthetic-token');return{fetcher,token,client:createSharedRoomClient({baseUrl:'http://127.0.0.1:48125',projectId:'demo-mot-rooms',auth:{uid:'owner',getIdToken:token},fetcher})};}
it('uses strict creation preview data and no caller-supplied owner identity',async()=>{
 const f=fixture(),request=await intent('create',{...common,roomId:'room',title:'Deliberate shared room',cards:[]});await f.client.create(request);expect(JSON.parse(String(f.fetcher.mock.calls[0]![1]?.body))).toEqual(request);
 const before=f.token.mock.calls.length;await expect(f.client.create({...request,ownerUid:'forged'} as never)).rejects.toThrow();expect(f.token.mock.calls).toHaveLength(before);
});
it('puts the invite secret in a claim body only and follows exact owner admission endpoints',async()=>{
 const f=fixture(),claim=await intent('claim',{...common,inviteSecret:secret,expiresAt});f.fetcher.mockImplementation(async()=>Response.json({state:'pending',...receipt(claim.operationId,'claim')}));await f.client.claim('room',claim);expect(String(f.fetcher.mock.calls[0]![0])).toBe('http://127.0.0.1:48125/rooms/room/claims');expect(String(f.fetcher.mock.calls[0]![0])).not.toContain(secret);expect(JSON.parse(String(f.fetcher.mock.calls[0]![1]?.body))).toEqual(claim);
 const approve=await intent('approve',{...common,baseVersion:1,inviteId,confirmedSubject:'guest',expiresAt});f.fetcher.mockImplementation(async()=>Response.json({approved:true,...receipt(approve.operationId,'approve')}));await f.client.approve('room',approve);
 const revoke=await intent('revoke-invite',{...common,baseVersion:1,inviteId,expiresAt});f.fetcher.mockImplementation(async()=>Response.json({revoked:true,...receipt(revoke.operationId,'revoke-invite')}));await f.client.revokeInvite('room',revoke);expect(String(f.fetcher.mock.calls.at(-1)![0])).toContain('/revoke-invite');
 f.fetcher.mockImplementation(async()=>Response.json({roomId:'another',serverTime:1,members:[],claims:[],invites:[]}));await expect(f.client.admission('room')).rejects.toMatchObject({code:'invalid-response'});
});
it('creates a fragment-only invite with no trip query and strips fragments before interpreting them',()=>{
 const link=sharedRoomInviteUrl('https://mot.example/?trip=PRIVATE-TRIP&dates=PRIVATE-DATES#old','room',secret,expiresAt),url=new URL(link);expect(url.search).toBe('');expect(link).not.toContain('PRIVATE');expect(url.hash).toContain(secret);
 const order:string[]=[];const invite=consumeSharedRoomInvite(link,clean=>{order.push('stripped');expect(clean).not.toContain(secret);expect(new URL(clean).hash).toBe('');});expect(order).toEqual(['stripped']);expect(invite).toEqual({roomId:'room',inviteSecret:secret,expiresAt});
 expect(consumeSharedRoomInvite('https://mot.example/#room-invite=not-valid',()=>{order.push('invalid-stripped');})).toBeUndefined();expect(order.at(-1)).toBe('invalid-stripped');
});
it('never sends an owner invite secret and refuses a reply that tries to return one',async()=>{
 const f=fixture(),request=await intent('invite',{...common,role:'editor' as const,inviteDigest:inviteId,expiresAt});
 f.fetcher.mockImplementation(async()=>Response.json({inviteId,expiresAt,...receipt(request.operationId,'invite')}));await f.client.invite('room',request);const body=JSON.parse(String(f.fetcher.mock.calls[0]![1]?.body));expect(body.inviteDigest).toBe(inviteId);expect(body.inviteSecret).toBeUndefined();
 f.fetcher.mockImplementation(async()=>Response.json({inviteId,expiresAt,inviteSecret:secret,...receipt(request.operationId,'invite')}));await expect(f.client.invite('room',request)).rejects.toMatchObject({code:'invalid-response'});
 const before=f.token.mock.calls.length;await expect(f.client.invite('room',{...request,expiresAt:expiresAt+1})).rejects.toMatchObject({code:'conflict'});expect(f.token.mock.calls).toHaveLength(before);
});

import {expect,it} from 'vitest';
import {acceptRoomOwnershipTransfer,prepareRoomOwnershipTransfer,type RoomOwnershipState} from './shared-room-transfer';
const now=1_900_000_000_000,owner={uid:'owner',authenticatedAt:now-1000},recipient={uid:'editor',authenticatedAt:now-500};
const fixture=():RoomOwnershipState=>({roomId:'room',schemaMajor:1,closed:false,ownerUid:'owner',members:{owner:{role:'owner',epoch:1,active:true},editor:{role:'editor',epoch:3,active:true},viewer:{role:'viewer',epoch:1,active:true}}});
const offer=(state=fixture())=>prepareRoomOwnershipTransfer(state,owner,'editor','viewer','offer-1',now);
it('requires explicit bilateral context and atomically replaces exactly one owner without assigning a household',()=>{
 const state=fixture(),pending=offer(state),copy=structuredClone(state);expect(state).toEqual(copy);
 const next=acceptRoomOwnershipTransfer(state,pending,recipient,now);expect(next.ownerUid).toBe('editor');expect(next.members.owner).toEqual({role:'viewer',epoch:2,active:true});expect(next.members.editor).toEqual({role:'owner',epoch:4,active:true});expect(Object.values(next.members).filter(m=>m.role==='owner')).toHaveLength(1);expect(next.members.viewer).toEqual(state.members.viewer);expect(state).toEqual(copy);expect(JSON.stringify(next)).not.toContain('household');
});
it('requires an explicit existing non-owner role and rejects automatic ownership, same-account and inactive recipients',()=>{
 for(const role of [undefined,'owner','administrator'])expect(()=>prepareRoomOwnershipTransfer(fixture(),owner,'editor',role as 'viewer','offer',now)).toThrow();
 expect(()=>prepareRoomOwnershipTransfer(fixture(),owner,'owner','viewer','offer',now)).toThrow();const state=fixture();state.members.editor!.active=false;expect(()=>offer(state)).toThrow();
 expect(()=>prepareRoomOwnershipTransfer(fixture(),recipient,'viewer','viewer','offer',now)).toThrow();
});
it('checks both actual authentication times at acceptance without introducing an offer TTL',()=>{
 expect(()=>prepareRoomOwnershipTransfer(fixture(),{...owner,authenticatedAt:now-300001},'editor','viewer','offer',now)).toThrow();
 expect(()=>acceptRoomOwnershipTransfer(fixture(),offer(),{...recipient,authenticatedAt:now-300001},now)).toThrow();
 expect(()=>acceptRoomOwnershipTransfer(fixture(),offer(),recipient,now+300000)).toThrow();
 expect(()=>acceptRoomOwnershipTransfer(fixture(),offer(),{...recipient,authenticatedAt:now+1},now)).toThrow();
 const edge=prepareRoomOwnershipTransfer(fixture(),{...owner,authenticatedAt:now-300000},'editor','respondent','edge',now);expect(acceptRoomOwnershipTransfer(fixture(),edge,recipient,now).members.owner!.role).toBe('respondent');
});
it('rejects stale membership, role, room, ownership, closed state, replay and competing transfers',()=>{
 const pending=offer();for(const mutate of [(s:RoomOwnershipState)=>{s.members.owner!.epoch++;},(s:RoomOwnershipState)=>{s.members.editor!.epoch++;},(s:RoomOwnershipState)=>{s.members.editor!.role='viewer';},(s:RoomOwnershipState)=>{s.roomId='other';},(s:RoomOwnershipState)=>{s.ownerUid='viewer';},(s:RoomOwnershipState)=>{s.closed=true;},(s:RoomOwnershipState)=>{s.schemaMajor=2;}]){const state=fixture();mutate(state);expect(()=>acceptRoomOwnershipTransfer(state,pending,recipient,now)).toThrow();}
 expect(()=>acceptRoomOwnershipTransfer(fixture(),pending,{...recipient,uid:'viewer'},now)).toThrow();const next=acceptRoomOwnershipTransfer(fixture(),pending,recipient,now);expect(()=>acceptRoomOwnershipTransfer(next,pending,recipient,now)).toThrow();
 const competing=prepareRoomOwnershipTransfer(fixture(),owner,'viewer','editor','other-offer',now);expect(()=>acceptRoomOwnershipTransfer(next,competing,{uid:'viewer',authenticatedAt:now},now)).toThrow();
});
it('fails closed on invalid/unknown offers, malformed membership, clock rollback and epoch exhaustion',()=>{
 expect(()=>acceptRoomOwnershipTransfer(fixture(),{...offer(),hiddenAdmin:true},recipient,now)).toThrow();expect(()=>acceptRoomOwnershipTransfer(fixture(),{...offer(),ownerAuthenticatedAt:now+1},recipient,now)).toThrow();
 const state=fixture();state.members.viewer!.role='owner';expect(()=>offer(state)).toThrow();const exhausted=fixture();exhausted.members.editor!.epoch=Number.MAX_SAFE_INTEGER;expect(()=>acceptRoomOwnershipTransfer(exhausted,offer(exhausted),recipient,now)).toThrow();
 expect(()=>offer({...fixture(),members:{...fixture().members,editor:{role:'editor',epoch:-1,active:true}}})).toThrow();expect(()=>acceptRoomOwnershipTransfer(fixture(),offer(),recipient,Number.NaN)).toThrow();
});
it('counts active memberships while retaining revoked identities and never grants them transfer authority',()=>{
 const state=fixture();for(let i=0;i<20;i++)state.members['revoked-'+i]={role:'viewer',epoch:2,active:false};expect(acceptRoomOwnershipTransfer(state,offer(state),recipient,now).ownerUid).toBe('editor');expect(()=>prepareRoomOwnershipTransfer(state,owner,'revoked-0','viewer','offer',now)).toThrow();
});

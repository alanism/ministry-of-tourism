import {initialRoomAccounting,roomAccountingFields} from './room-emulator-snapshot.ts';
import type {Firestore} from 'firebase-admin/firestore';
import {parseFileJson,canonicalFileJson} from '../../core/src/trip/file-exchange-json.ts';
import {sha256Hex} from '../../core/src/trip/sha256.ts';
import {createRoomInvite,claimRoomInvite,approveRoomClaim,revokeRoomMember,roomCreateRequestSchema,roomInviteRequestSchema,roomClaimRequestSchema,roomApproveRequestSchema,roomRevokeRequestSchema,roomRevokeInviteRequestSchema,revokeRoomInvite,type RoomAdmissionState} from '../../core/src/trip/shared-room-admission.ts';
async function body(request:Request){const reader=request.body?.getReader();if(!reader)throw Error('unavailable');const chunks:Uint8Array[]=[];let n=0;while(true){const r=await reader.read();if(r.done)break;n+=r.value.length;if(n>65536){await reader.cancel();throw Error('intent limit');}chunks.push(r.value);}const out=new Uint8Array(n);let at=0;for(const c of chunks){out.set(c,at);at+=c.length;}return parseFileJson(out);}
const digest=(value:string)=>sha256Hex(new TextEncoder().encode(value));
function owner(meta:RoomAdmissionState,uid:string){const m=meta.members[uid];if((meta as RoomAdmissionState & {schemaMajor?:number}).schemaMajor!==1||meta.closed||meta.ownerUid!==uid||!m?.active||m.role!=='owner')throw Error('unavailable');}
/** Central service has already verified the actual Auth token before invoking this router. */
export async function roomAdmissionRoute(request:Request,uid:string,db:Firestore):Promise<unknown|null>{
 const path=new URL(request.url).pathname;
 if(request.method==='POST'&&path==='/rooms'){
  const input=roomCreateRequestSchema.parse(await body(request));if(input.cards.some(c=>c.assetIds.length))throw Error('Media publication unavailable');const creationDigest=await digest(canonicalFileJson(input));const now=Date.now();
  return db.runTransaction(async tx=>{const ref=db.doc('rooms/'+input.roomId),account=db.doc('accounts/'+uid);const[prior,profile]=await Promise.all([tx.get(ref),tx.get(account)]);if(prior.exists){const p=prior.data()!;if(p.schemaMajor===1&&p.ownerUid===uid&&p.creationDigest===creationDigest&&!p.closed)return{roomId:input.roomId,created:true};throw Error('unavailable');}const owned:string[]=profile.data()?.ownedRooms??[],joined:string[]=profile.data()?.joinedRooms??[];if(owned.length>=3||joined.length>=10)throw Error('Account room limit');
   tx.create(ref,{id:input.roomId,title:input.title,schemaMajor:1,ownerUid:uid,closed:false,receiptCount:0,creationDigest,createdAt:now,members:{[uid]:{role:'owner',epoch:1,active:true}},invites:{},claims:{},households:{},...roomAccountingFields(initialRoomAccounting({id:input.roomId,title:input.title,schemaMajor:1},input.cards.map(payload=>({version:1,authorUid:uid,updatedAt:now,payload})))),referencedObjects:0});for(const card of input.cards)tx.create(ref.collection('cards').doc(card.id),{version:1,authorUid:uid,updatedAt:now,payload:card});tx.set(account,{ownedRooms:[...owned,input.roomId],joinedRooms:[...joined,input.roomId]});return{roomId:input.roomId,created:true};});
 }
 const match=/^\/rooms\/([A-Za-z0-9][A-Za-z0-9._:-]{0,199})\/(admission|invites|claims|approve|revoke|revoke-invite)$/.exec(path);if(!match)return null;const roomId=match[1]!,action=match[2]!,ref=db.doc('rooms/'+roomId);
 if(request.method==='GET'&&action==='admission')return db.runTransaction(async tx=>{const doc=await tx.get(ref),meta=doc.data() as RoomAdmissionState|undefined;if(!meta)throw Error('unavailable');owner(meta,uid);return{roomId,invites:Object.entries(meta.invites).filter(([key,i])=>!i.revoked&&i.expiresAt>Date.now()&&(!i.used||meta.claims[key]?.state==='pending')).map(([inviteId,i])=>({inviteId,role:i.role,expiresAt:i.expiresAt,used:i.used,revoked:i.revoked})),members:Object.entries(meta.members).filter(([,m])=>m.active).map(([uid,m])=>({uid,role:m.role,epoch:m.epoch,active:m.active})),claims:Object.entries(meta.claims).filter(([key,c])=>c.state==='pending'&&!meta.invites[key]?.revoked&&(meta.invites[key]?.expiresAt??0)>Date.now()).map(([inviteId,c])=>({inviteId,uid:c.uid,role:c.role,state:c.state}))};});
 if(request.method!=='POST')throw Error('unavailable');const raw=await body(request),now=Date.now();
 if(action==='invites'){
  const input=roomInviteRequestSchema.parse(raw),secret=Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('hex'),inviteId=await digest(secret);
  await db.runTransaction(async tx=>{const doc=await tx.get(ref);if(!doc.exists||doc.get('schemaMajor')!==1)throw Error('unavailable');const next=createRoomInvite(doc.data() as RoomAdmissionState,uid,inviteId,input.role,now);tx.update(ref,{invites:next.invites});});return{inviteId,inviteSecret:secret,expiresAt:now+86400000};
 }
 if(action==='claims'){
  const input=roomClaimRequestSchema.parse(raw),inviteId=await digest(input.inviteSecret);
  await db.runTransaction(async tx=>{const doc=await tx.get(ref);if(!doc.exists||doc.get('schemaMajor')!==1)throw Error('unavailable');const next=claimRoomInvite(doc.data() as RoomAdmissionState,uid,inviteId,now);tx.update(ref,{invites:next.invites,claims:next.claims});});return{state:'pending'};
 }
 if(action==='approve'){
  const input=roomApproveRequestSchema.parse(raw);await db.runTransaction(async tx=>{const doc=await tx.get(ref);if(!doc.exists||doc.get('schemaMajor')!==1)throw Error('unavailable');const meta=doc.data() as RoomAdmissionState;owner(meta,uid);const claim=meta.claims[input.inviteId];if(!claim)throw Error('unavailable');const profile=db.doc('accounts/'+claim.uid),account=await tx.get(profile),joined:string[]=account.data()?.joinedRooms??[];if(joined.length>=10&&!joined.includes(roomId))throw Error('Joined room limit');const next=approveRoomClaim(meta,uid,input.inviteId,input.confirmedSubject,now);tx.update(ref,{members:next.members,claims:next.claims});tx.set(profile,{...(account.data()??{}),joinedRooms:joined.includes(roomId)?joined:[...joined,roomId]});});return{approved:true};
 }
 if(action==='revoke-invite'){
  const input=roomRevokeInviteRequestSchema.parse(raw);await db.runTransaction(async tx=>{const doc=await tx.get(ref);if(!doc.exists||doc.get('schemaMajor')!==1)throw Error('unavailable');const next=revokeRoomInvite(doc.data() as RoomAdmissionState,uid,input.inviteId);tx.update(ref,{invites:next.invites});});return{revoked:true};
 }
 if(action==='revoke'){
  const input=roomRevokeRequestSchema.parse(raw);await db.runTransaction(async tx=>{const doc=await tx.get(ref);if(!doc.exists||doc.get('schemaMajor')!==1)throw Error('unavailable');const next=revokeRoomMember(doc.data() as RoomAdmissionState,uid,input.uid);tx.update(ref,{members:next.members});});return{revoked:true};
 }
 throw Error('unavailable');
}

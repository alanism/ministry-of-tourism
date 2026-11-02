import type {Transaction,DocumentReference} from 'firebase-admin/firestore';
import type {RoomMember} from '../../core/src/trip/shared-room-domain.ts';
import {assertRoomSession,roomRegisteredSessionSchema} from '../../core/src/trip/shared-room-sessions.ts';
export interface RoomServicePrincipal {uid:string;roomId:string;membershipEpoch:number;sessionId:string;authenticatedAt?:number;networkAddress?:string;}
/** Firebase token verification belongs at the outer service boundary, never in caller JSON. */
export async function readRoomMembership(tx:Transaction,ref:DocumentReference,uid:string){
 const[room,memberDoc]=await Promise.all([tx.get(ref),tx.get(ref.collection('members').doc(uid))]);const meta=room.data();if(!meta||meta.schemaMajor!==1||meta.closed||meta.id!==ref.id)throw Error('Room operation unavailable');const stored=memberDoc.data()??meta.members?.[uid];if(!stored||!stored.active||!['owner','editor','viewer','respondent'].includes(stored.role)||!Number.isSafeInteger(stored.epoch)||stored.epoch<0)throw Error('Room operation unavailable');
 const member:RoomMember={role:stored.role,epoch:stored.epoch,active:stored.active};return{meta,member,memberRef:ref.collection('members').doc(uid),storedMember:stored};
}
/** Every protected operation re-reads current UID membership, epoch and logical session atomically. */
export async function authorizeRoom(tx:Transaction,ref:DocumentReference,principal:RoomServicePrincipal){
 if(principal.roomId!==ref.id)throw Error('Room operation unavailable');const current=await readRoomMembership(tx,ref,principal.uid);if(principal.membershipEpoch!==current.member.epoch||!/^[a-f0-9]{64}$/.test(principal.sessionId))throw Error('Room operation unavailable');const doc=await tx.get(ref.collection('sessions').doc(principal.sessionId));if(!doc.exists)throw Error('Room operation unavailable');const record=roomRegisteredSessionSchema.parse(doc.get('record'));assertRoomSession({roomId:ref.id,uid:principal.uid,closed:false,member:current.member,membershipEpoch:principal.membershipEpoch,sessions:{[record.id]:record}},principal.sessionId);return current;
}

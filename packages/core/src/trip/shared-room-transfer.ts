import {z} from 'zod';
import type {RoomMember} from './shared-room-domain.ts';
const id=z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/),integer=z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),nonOwnerRole=z.enum(['editor','viewer','respondent']);
const memberSchema=z.object({role:z.enum(['owner','editor','viewer','respondent']),epoch:integer,active:z.boolean()}).strict();
export interface RoomOwnershipState{roomId:string;schemaMajor:number;closed:boolean;ownerUid:string;members:Record<string,RoomMember>;}
/** Trusted service identity only: derive uid/authenticatedAt from verified Firebase tokens, never request fields. */
export interface RoomFreshPrincipal{uid:string;authenticatedAt:number;}
export const roomOwnershipOfferSchema=z.object({schemaMajor:z.literal(1),offerId:id,roomId:id,ownerUid:id,ownerEpoch:integer,ownerAuthenticatedAt:integer,recipientUid:id,recipientEpoch:integer,recipientRole:nonOwnerRole,formerOwnerRole:nonOwnerRole}).strict();
export type RoomOwnershipOffer=z.infer<typeof roomOwnershipOfferSchema>;
function fresh(principal:RoomFreshPrincipal,now:number){id.parse(principal.uid);integer.parse(now);integer.parse(principal.authenticatedAt);if(principal.authenticatedAt>now||now-principal.authenticatedAt>300000)throw Error('Both accounts must authenticate within five minutes');}
function current(state:RoomOwnershipState){
 id.parse(state.roomId);id.parse(state.ownerUid);if(state.schemaMajor!==1||state.closed)throw Error('Room transfer unavailable');
 const members=Object.entries(state.members);if(members.filter(([,member])=>member.active).length>16)throw Error('Invalid current membership');
 for(const[uid,member]of members){id.parse(uid);memberSchema.parse(member);}
 const owners=members.filter(([,member])=>member.role==='owner');if(owners.length!==1||owners[0]![0]!==state.ownerUid||!owners[0]![1].active)throw Error('Invalid current owner');
}
/** Entropy and durable offer storage belong outside this pure transition. Neither account is auto-confirmed. */
export function prepareRoomOwnershipTransfer(state:RoomOwnershipState,owner:RoomFreshPrincipal,recipientUid:string,formerOwnerRole:z.infer<typeof nonOwnerRole>,offerId:string,now:number):RoomOwnershipOffer{
 current(state);fresh(owner,now);id.parse(recipientUid);nonOwnerRole.parse(formerOwnerRole);
 const recipient=Object.hasOwn(state.members,recipientUid)?state.members[recipientUid]:undefined;
 if(owner.uid!==state.ownerUid||recipientUid===owner.uid||!recipient?.active||recipient.role==='owner')throw Error('Room transfer unavailable');
 return roomOwnershipOfferSchema.parse({schemaMajor:1,offerId,roomId:state.roomId,ownerUid:owner.uid,ownerEpoch:state.members[owner.uid]!.epoch,ownerAuthenticatedAt:owner.authenticatedAt,recipientUid,recipientEpoch:recipient.epoch,recipientRole:recipient.role,formerOwnerRole});
}
/** Adapter must read offer/current memberships and commit replacement atomically; stale/replayed offers cannot restore ownership. */
export function acceptRoomOwnershipTransfer<T extends RoomOwnershipState>(state:T,rawOffer:unknown,recipient:RoomFreshPrincipal,now:number):T{
 current(state);const offer=roomOwnershipOfferSchema.parse(rawOffer);fresh({uid:offer.ownerUid,authenticatedAt:offer.ownerAuthenticatedAt},now);fresh(recipient,now);
 const previous=state.members[offer.ownerUid],next=state.members[offer.recipientUid];
 if(state.roomId!==offer.roomId||state.ownerUid!==offer.ownerUid||offer.ownerUid===offer.recipientUid||recipient.uid!==offer.recipientUid||!previous?.active||previous.role!=='owner'||previous.epoch!==offer.ownerEpoch||!next?.active||next.role!==offer.recipientRole||next.epoch!==offer.recipientEpoch)throw Error('Ownership context changed; confirm a new transfer');
 if(previous.epoch===Number.MAX_SAFE_INTEGER||next.epoch===Number.MAX_SAFE_INTEGER)throw Error('Membership epoch capacity reached');
 return{...state,ownerUid:offer.recipientUid,members:{...state.members,[offer.ownerUid]:{...previous,role:offer.formerOwnerRole,epoch:previous.epoch+1},[offer.recipientUid]:{...next,role:'owner',epoch:next.epoch+1}}};
}

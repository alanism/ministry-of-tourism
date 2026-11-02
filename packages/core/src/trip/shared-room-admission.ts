import {z} from 'zod';
import {sharedRoomCardSchema,type RoomMember} from './shared-room-domain.ts';
const uid=z.string().min(1).max(200),digest=z.string().regex(/^[a-f0-9]{64}$/),role=z.enum(['editor','viewer','respondent']);
type GuestRole=z.infer<typeof role>;
interface Invite {role:GuestRole;expiresAt:number;used:boolean;revoked:boolean;}
interface Claim {uid:string;role:GuestRole;state:'pending'|'approved';}
export interface RoomAdmissionState {ownerUid:string;closed:boolean;members:Record<string,RoomMember>;invites:Record<string,Invite>;claims:Record<string,Claim>;}
const own=<T>(map:Record<string,T>,key:string)=>Object.hasOwn(map,key)?map[key]:undefined;
function owner(state:RoomAdmissionState,actor:string){const member=own(state.members,actor);if(state.closed||state.ownerUid!==actor||member?.role!=='owner'||!member.active)throw Error('Room operation unavailable');}
function clock(now:number){if(!Number.isSafeInteger(now)||now<0||now>Number.MAX_SAFE_INTEGER-86400000)throw Error('Invalid trusted clock');}
/** Service generates256random bits and hashes the secret before this pure transaction. Never store raw secret. */
export function createRoomInvite(state:RoomAdmissionState,actor:string,inviteDigest:string,invitedRole:GuestRole,now:number):RoomAdmissionState{
 owner(state,actor);digest.parse(inviteDigest);role.parse(invitedRole);clock(now);
 if(own(state.invites,inviteDigest))throw Error('Invite identity already used');
 if(Object.values(state.invites).filter(i=>!i.revoked&&i.expiresAt>now).length>=16)throw Error('Outstanding invite limit reached');
 return{...state,invites:{...state.invites,[inviteDigest]:{role:invitedRole,expiresAt:now+86400000,used:false,revoked:false}}};
}
/** An authenticated claim consumes the invite; it grants no membership/content read. */
export function claimRoomInvite(state:RoomAdmissionState,subject:string,inviteDigest:string,now:number):RoomAdmissionState{
 uid.parse(subject);digest.parse(inviteDigest);clock(now);const invite=own(state.invites,inviteDigest);
 if(state.closed||!invite||invite.revoked||invite.used||invite.expiresAt<=now||subject===state.ownerUid)throw Error('Room operation unavailable');
 return{...state,invites:{...state.invites,[inviteDigest]:{...invite,used:true}},claims:{...state.claims,[inviteDigest]:{uid:subject,role:invite.role,state:'pending'}}};
}
export function approveRoomClaim(state:RoomAdmissionState,actor:string,inviteDigest:string,confirmedSubject:string,now:number):RoomAdmissionState{
 owner(state,actor);digest.parse(inviteDigest);uid.parse(confirmedSubject);clock(now);const claim=own(state.claims,inviteDigest),invite=own(state.invites,inviteDigest);
 if(!claim||claim.state!=='pending'||claim.uid!==confirmedSubject||claim.uid===state.ownerUid||!invite||!invite.used||invite.revoked||invite.expiresAt<=now||claim.role!==invite.role)throw Error('Room operation unavailable');
 const existing=own(state.members,claim.uid);if(existing?.active)throw Error('Member already active');
 if(Object.values(state.members).filter(m=>m.active).length>=16)throw Error('Member limit reached');
 return{...state,members:{...state.members,[claim.uid]:{role:claim.role,epoch:(existing?.epoch??0)+1,active:true}},claims:{...state.claims,[inviteDigest]:{...claim,state:'approved'}}};
}
/** Security revocation deliberately bypasses ordinary content/receipt quotas. */
export function revokeRoomMember(state:RoomAdmissionState,actor:string,subject:string):RoomAdmissionState{
 owner(state,actor);uid.parse(subject);const member=own(state.members,subject);if(!member||subject===state.ownerUid)throw Error('Room operation unavailable');
 if(!member.active)return state;if(member.epoch===Number.MAX_SAFE_INTEGER)throw Error('Membership epoch capacity reached');
 return{...state,members:{...state.members,[subject]:{...member,active:false,epoch:member.epoch+1}}};
}

const wireId=z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/),hash=z.string().regex(/^[a-f0-9]{64}$/),common={schemaMajor:z.literal(1),capability:z.literal('room-admission/1')};
export const roomCreateRequestSchema=z.object({...common,roomId:wireId,title:z.string().trim().min(1).max(500),cards:z.array(sharedRoomCardSchema).max(500)}).strict().refine(x=>new Set(x.cards.map(c=>c.id)).size===x.cards.length,'Duplicate cards');
export const roomInviteRequestSchema=z.object({...common,role:z.enum(['editor','viewer','respondent'])}).strict();
export const roomClaimRequestSchema=z.object({...common,inviteSecret:hash}).strict();
export const roomApproveRequestSchema=z.object({...common,inviteId:hash,confirmedSubject:wireId}).strict();
export const roomRevokeRequestSchema=z.object({...common,uid:wireId}).strict();

export const roomCreateResultSchema=z.object({roomId:wireId,created:z.literal(true)}).strict();
export const roomInviteResultSchema=z.object({inviteId:hash,inviteSecret:hash,expiresAt:z.number().int().nonnegative()}).strict();
export const roomPendingClaimResultSchema=z.object({state:z.literal('pending')}).strict();
export const roomApprovalResultSchema=z.object({approved:z.literal(true)}).strict();
export const roomRevocationResultSchema=z.object({revoked:z.literal(true)}).strict();
export const roomAdmissionSnapshotSchema=z.object({roomId:wireId,members:z.array(z.object({uid:wireId,role:z.enum(['owner','editor','viewer','respondent']),epoch:z.number().int().nonnegative(),active:z.boolean()}).strict()).max(16),claims:z.array(z.object({inviteId:hash,uid:wireId,role:z.enum(['editor','viewer','respondent']),state:z.literal('pending')}).strict()).max(16)}).strict();

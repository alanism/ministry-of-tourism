import {roomCreateRequestSchema,roomClaimRequestSchema} from '../../../../packages/core/src/trip/shared-room-admission';
export function sharedRoomInviteUrl(base:string,roomId:string,secret:string,expiresAt:number):string{
 const page=new URL(base);if(page.protocol!=='https:'&&!(page.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(page.hostname)))throw Error('Unsupported invitation origin');
 roomCreateRequestSchema.shape.roomId.parse(roomId);roomClaimRequestSchema.shape.inviteSecret.parse(secret);roomClaimRequestSchema.shape.expiresAt.parse(expiresAt);
 const url=new URL('/',page.origin);url.hash=new URLSearchParams({room:roomId,'room-invite':secret,expires:String(expiresAt)}).toString();return url.href;
}
/** Caller must invoke before ordinary navigation/analytics. Returned secret stays in session memory only. */
export interface SharedRoomInvite{roomId:string;inviteSecret:string;expiresAt:number;}
export function consumeSharedRoomInvite(href:string,replace:(clean:string)=>void):SharedRoomInvite|undefined{
 const url=new URL(href);if(!url.hash.includes('room-invite'))return;
 const fragment=url.hash.slice(1);url.hash='';replace(url.href);
 const params=new URLSearchParams(fragment),room=roomCreateRequestSchema.shape.roomId.safeParse(params.get('room')),secret=roomClaimRequestSchema.shape.inviteSecret.safeParse(params.get('room-invite')),expiry=roomClaimRequestSchema.shape.expiresAt.safeParse(Number(params.get('expires')));
 if(!room.success||!secret.success||!expiry.success||params.getAll('room').length!==1||params.getAll('room-invite').length!==1||params.getAll('expires').length!==1||[...params.keys()].some(key=>!['room','room-invite','expires'].includes(key)))return;
 return{roomId:room.data,inviteSecret:secret.data,expiresAt:expiry.data};
}

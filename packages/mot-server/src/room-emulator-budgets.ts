import type {Firestore,Transaction,DocumentReference} from 'firebase-admin/firestore';
import {attemptRoomWrite,attemptRoomRedemption} from '../../core/src/trip/shared-room-limits.ts';
import {sha256Hex} from '../../core/src/trip/sha256.ts';
export class RoomRateLimit extends Error {retryAfterMs:number;constructor(retryAfterMs:number){super('Room attempt limit');this.retryAfterMs=retryAfterMs;}}
const digest=(s:string)=>sha256Hex(new TextEncoder().encode(s));
/** Independent admission transaction intentionally survives later semantic rejection. */
export async function admitRoomAttempt(db:Firestore,uid:string,roomId:string,networkAddress:string,redemption:boolean){
 const key=await digest(JSON.stringify(redemption?{uid,kind:'redemption'}:{uid,roomId})),networkKey=await digest(networkAddress);
 const result=await db.runTransaction(async tx=>{const now=Date.now(),account=db.doc('roomAttemptBuckets/'+key),network=db.doc('roomRedemptionNetworks/'+networkKey);const old=await tx.get(account);
  if(redemption){const other=await tx.get(network),next=attemptRoomRedemption(old.get('redemption'),other.get('redemption'),now);tx.set(account,{redemption:next.account},{merge:true});tx.set(network,{redemption:next.network});return next;}
  const next=attemptRoomWrite(old.get('write'),now);tx.set(account,{write:next.state},{merge:true});return next;
 });if(!result.allowed)throw new RoomRateLimit(result.retryAfterMs);
}
/** Prepare every read first; adapters apply this bounded redacted audit beside their atomic effect. */
export async function prepareRoomAudit(tx:Transaction,ref:DocumentReference,entry:{uid:string;kind:string;entityId:string;version:number;at:number}){
 if(!Number.isSafeInteger(entry.at)||!Number.isSafeInteger(entry.version)||entry.version<0||![entry.uid,entry.kind,entry.entityId].every(v=>typeof v==='string'&&v.length<=200))throw Error('Invalid security audit');
 const rows=await tx.get(ref.collection('securityAudit').orderBy('at','asc').limit(1025)),cutoff=entry.at-30*86400000,key=await digest(JSON.stringify(entry)),target=ref.collection('securityAudit').doc(key);
 const retained=rows.docs.filter(d=>d.get('at')>=cutoff&&d.id!==key),remove=rows.docs.filter(d=>d.get('at')<cutoff);remove.push(...retained.slice(0,Math.max(0,retained.length-1023)));
 return()=>{for(const doc of remove)tx.delete(doc.ref);tx.set(target,{uid:entry.uid,kind:entry.kind,entityId:entry.entityId,version:entry.version,at:entry.at});};
}

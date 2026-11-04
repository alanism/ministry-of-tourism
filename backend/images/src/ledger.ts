import {createHmac,randomBytes} from 'node:crypto';
import type {Firestore} from 'firebase-admin/firestore';
import {z} from 'zod';
import {ImageFailure,IMAGE_LIMITS} from './contract.ts';
const count=z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const stateSchema=z.object({version:z.literal(1),salt:z.string().regex(/^[a-f0-9]{64}$/),attempts:count,completed:count,halted:z.boolean(),leases:z.record(z.uuid(),z.number().int().nonnegative()).refine(v=>Object.keys(v).length<=IMAGE_LIMITS.concurrency)}).strict();
const counter=z.object({attempts:count}).strict();
const requestSchema=z.object({version:z.literal(1),actor:z.string().regex(/^[a-f0-9]{64}$/),nonce:z.string().regex(/^[a-f0-9]{64}$/),createdAt:z.number().int(),leaseUntil:z.number().int(),state:z.enum(['reserved','completed','failed'])}).strict();
export interface ImageReservation {requestId:string;nonce:string}
export interface ImageLedger {reserve(uid:string,requestId:string,attestationHash:string):Promise<ImageReservation>;complete(reservation:ImageReservation,known:boolean,success:boolean):Promise<void>}
export function createImageLedger(db:Firestore,now:()=>number=Date.now):ImageLedger{
  const global=db.doc('motImageControl/v1');
  return{
    async reserve(uid,id,attestation){
      if(!uid||uid.length>128||!z.uuid().safeParse(id).success||!/^[a-f0-9]{64}$/.test(attestation))throw new ImageFailure('unauthenticated');
      const nonce=randomBytes(32).toString('hex'),salt=randomBytes(32).toString('hex');
      const outcome=await db.runTransaction(async tx=>{
        const time=now(),day=new Date(time).toISOString().slice(0,10),previous=await tx.get(global);
        const state=previous.exists?stateSchema.parse(previous.data()):{version:1 as const,salt,attempts:0,completed:0,halted:false,leases:{} as Record<string,number>};
        const actor=createHmac('sha256',state.salt).update(uid).digest('hex');
        const request=db.doc(`motImageRequests/${id}`),daily=db.doc(`motImageDays/${day}`),guest=db.doc(`motImageActors/${actor}`);
        // Shared signed-jti marker prevents cross-route as well as cross-instance replay.
        const marker=db.doc(`motDiscoveryAttestations/${attestation}`);
        const [r,d,g,a]=await tx.getAll(request,daily,guest,marker);
        if(r!.exists||a!.exists)return'replayed' as const;
        if(state.halted)return'unavailable' as const;
        if(Object.values(state.leases).some(expiry=>expiry<=time)){tx.set(global,{...state,halted:true});return'unavailable' as const;}
        const dayCount=d!.exists?counter.parse(d!.data()).attempts:0,guestCount=g!.exists?counter.parse(g!.data()).attempts:0;
        if(state.attempts>=IMAGE_LIMITS.globalLifetime||dayCount>=IMAGE_LIMITS.globalDaily||guestCount>=IMAGE_LIMITS.guestLifetime)return'rate_limited' as const;
        if(Object.keys(state.leases).length>=IMAGE_LIMITS.concurrency)return'busy' as const;
        const leaseUntil=time+IMAGE_LIMITS.leaseMs;
        tx.set(global,{...state,attempts:state.attempts+1,leases:{...state.leases,[id]:leaseUntil}});
        tx.set(daily,{attempts:dayCount+1});tx.set(guest,{attempts:guestCount+1});
        tx.create(request,{version:1,actor,nonce,createdAt:time,leaseUntil,state:'reserved'});
        tx.create(marker,{requestId:id,createdAt:time});
        return'accepted' as const;
      },{maxAttempts:5});
      if(outcome!=='accepted')throw new ImageFailure(outcome);
      return{requestId:id,nonce};
    },
    async complete(reservation,known,success){
      await db.runTransaction(async tx=>{
        const request=db.doc(`motImageRequests/${reservation.requestId}`),[g,r]=await tx.getAll(global,request);
        if(!g!.exists||!r!.exists)throw new ImageFailure('unavailable');
        const state=stateSchema.parse(g!.data()),record=requestSchema.parse(r!.data());
        if(record.nonce!==reservation.nonce)throw new ImageFailure('unavailable');
        if(record.state!=='reserved')return;
        const leases={...state.leases};delete leases[reservation.requestId];
        tx.set(global,{...state,leases,completed:state.completed+(known&&success?1:0),halted:state.halted||!known});
        tx.set(request,{...record,state:known&&success?'completed':'failed'});
      },{maxAttempts:5});
    },
  };
}

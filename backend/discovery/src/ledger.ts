import {createHmac,randomBytes} from 'node:crypto';
import {z} from 'zod';
import type {Firestore} from 'firebase-admin/firestore';
import {DiscoveryFailure,PUBLIC_LIMITS,type Usage} from './contract.ts';

const count=z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const globalSchema=z.object({version:z.literal(1),salt:z.string().regex(/^[a-f0-9]{64}$/),attempts:count,
  inputTokens:count,outputTokens:count,halted:z.boolean(),leases:z.record(z.string().uuid(),z.number().int().nonnegative()).refine(v=>Object.keys(v).length<=PUBLIC_LIMITS.concurrency)}).strict();
const daySchema=z.object({attempts:count}).strict();
const requestSchema=z.object({version:z.literal(1),actor:z.string().regex(/^[a-f0-9]{64}$/),nonce:z.string().regex(/^[a-f0-9]{64}$/),
  createdAt:z.number().int().nonnegative(),leaseUntil:z.number().int().nonnegative(),state:z.enum(['reserved','completed','failed']),usage:z.object({inputTokens:count,outputTokens:count,totalTokens:count}).optional()}).strict();
export interface Reservation {requestId:string;nonce:string;}
export interface SharedLedger {
  available():Promise<boolean>;
  reserve(uid:string,requestId:string,attestationHash?:string):Promise<Reservation>;
  complete(reservation:Reservation,success:boolean,usage?:Usage):Promise<void>;
}

/** Each reservation is durable before external work. No provider call occurs inside a retryable transaction. */
export function createFirestoreLedger(db:Firestore,now:()=>number=Date.now):SharedLedger{
  const globalRef=db.doc('motDiscoveryControl/v1');
  return{
    async available(){
      const [global,day]=await db.getAll(globalRef,db.doc(`motDiscoveryDays/${new Date(now()).toISOString().slice(0,10)}`));
      if(!global!.exists)return true;
      const state=globalSchema.parse(global!.data()),dayState=day!.exists?daySchema.parse(day!.data()):{attempts:0};
      return!state.halted&&state.attempts<PUBLIC_LIMITS.lifetimeAttempts&&dayState.attempts<PUBLIC_LIMITS.dailyAttempts&&
        state.inputTokens+state.outputTokens<PUBLIC_LIMITS.observedTokens&&!Object.values(state.leases).some(expiry=>expiry<=now());
    },
    async reserve(uid,requestId,attestationHash){
      if(!uid||uid.length>128||!z.uuid().safeParse(requestId).success)throw new DiscoveryFailure('invalid_request');
      if(attestationHash!==undefined&&!/^[a-f0-9]{64}$/.test(attestationHash))throw new DiscoveryFailure('unauthenticated');
      const nonce=randomBytes(32).toString('hex'),initialSalt=randomBytes(32).toString('hex');
      const outcome=await db.runTransaction(async tx=>{
        const timestamp=now(),day=new Date(timestamp).toISOString().slice(0,10),requestRef=db.doc(`motDiscoveryRequests/${requestId}`),dayRef=db.doc(`motDiscoveryDays/${day}`);
        const global=await tx.get(globalRef);
        const attestationRef=attestationHash?db.doc(`motDiscoveryAttestations/${attestationHash}`):undefined;
        if(attestationRef&&(await tx.get(attestationRef)).exists)return'replayed' as const;
        const state=global.exists?globalSchema.parse(global.data()):{version:1 as const,salt:initialSalt,attempts:0,inputTokens:0,outputTokens:0,halted:false,leases:{} as Record<string,number>};
        const actor=createHmac('sha256',state.salt).update(uid).digest('hex'),actorRef=db.doc(`motDiscoveryActors/${day}-${actor}`);
        const [daily,actorDaily,previous]=await tx.getAll(dayRef,actorRef,requestRef);
        if(previous!.exists)return'replayed' as const;
        if(state.halted)return'unavailable' as const;
        // A crashed or uncertain request never refunds an attempt; halt for owner usage review.
        if(Object.values(state.leases).some(expiry=>expiry<=timestamp)){
          tx.set(globalRef,{...state,halted:true});return'unavailable' as const;
        }
        const dailyCount=daily!.exists?daySchema.parse(daily!.data()).attempts:0;
        const actorCount=actorDaily!.exists?daySchema.parse(actorDaily!.data()).attempts:0;
        if(state.attempts>=PUBLIC_LIMITS.lifetimeAttempts||dailyCount>=PUBLIC_LIMITS.dailyAttempts||actorCount>=PUBLIC_LIMITS.actorDailyAttempts||state.inputTokens+state.outputTokens+PUBLIC_LIMITS.outputTokens*(Object.keys(state.leases).length+1)>PUBLIC_LIMITS.observedTokens)return'rate_limited' as const;
        if(Object.keys(state.leases).length>=PUBLIC_LIMITS.concurrency)return'busy' as const;
        const leaseUntil=timestamp+PUBLIC_LIMITS.leaseMs;
        tx.set(globalRef,{...state,attempts:state.attempts+1,leases:{...state.leases,[requestId]:leaseUntil}});
        tx.set(dayRef,{attempts:dailyCount+1});tx.set(actorRef,{attempts:actorCount+1});
        tx.create(requestRef,{version:1,actor,nonce,createdAt:timestamp,leaseUntil,state:'reserved'});
        if(attestationRef)tx.create(attestationRef,{createdAt:timestamp,requestId});
        return'accepted' as const;
      },{maxAttempts:5});
      if(outcome!=='accepted')throw new DiscoveryFailure(outcome);
      return{requestId,nonce};
    },
    async complete(reservation,success,usage){
      await db.runTransaction(async tx=>{
        const requestRef=db.doc(`motDiscoveryRequests/${reservation.requestId}`),[global,request]=await tx.getAll(globalRef,requestRef);
        if(!global!.exists||!request!.exists)throw new DiscoveryFailure('unavailable');
        const state=globalSchema.parse(global!.data()),record=requestSchema.parse(request!.data());
        if(record.nonce!==reservation.nonce)throw new DiscoveryFailure('unavailable');
        if(record.state!=='reserved')return; // Completion is idempotent; usage cannot be counted twice.
        if(usage&&(!Number.isSafeInteger(usage.inputTokens)||!Number.isSafeInteger(usage.outputTokens)||!Number.isSafeInteger(usage.totalTokens)||usage.inputTokens<0||usage.outputTokens<0||usage.totalTokens!==usage.inputTokens+usage.outputTokens||usage.outputTokens>PUBLIC_LIMITS.outputTokens))usage=undefined;
        const leases={...state.leases};delete leases[reservation.requestId];
        const inputTokens=state.inputTokens+(usage?.inputTokens??0),outputTokens=state.outputTokens+(usage?.outputTokens??0);
        tx.set(globalRef,{...state,leases,inputTokens,outputTokens,halted:state.halted||!usage||inputTokens+outputTokens>=PUBLIC_LIMITS.observedTokens});
        tx.set(requestRef,{...record,state:success?'completed':'failed',...(usage?{usage}:{})});
      },{maxAttempts:5});
    },
  };
}

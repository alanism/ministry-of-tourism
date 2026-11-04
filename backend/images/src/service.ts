import {IMAGE_LIMITS,IMAGE_MODEL,ImageFailure,imageFailure,imageRequestSchema,type ImageSession} from './contract.ts';
import type {ImageLedger,ImageReservation} from './ledger.ts';
import {prepareServerPhoto,approvedReference,imageProviderBody,callImageProvider} from './provider.ts';
export interface ImageConfig {enabled:boolean;privacyAcknowledged:boolean;appId:string;expiresAt:string;key:()=>string}
export interface ImageDependencies {ledger:ImageLedger;fetcher?:typeof fetch;now?:()=>number}
export function createImageService(config:ImageConfig,deps:ImageDependencies){
  const now=deps.now??Date.now,fetcher=deps.fetcher??fetch;
  const configured=()=>config.enabled&&config.privacyAcknowledged&&/^1:944001311456:web:[a-z0-9]+$/.test(config.appId)&&Number.isFinite(Date.parse(config.expiresAt))&&Date.parse(config.expiresAt)>now()&&!!config.key().trim();
  return{
    status(){let available=false;try{available=configured();}catch{}return{available,transport:'firebase-attested-image',readiness:'configured-only',limits:{guestLifetime:IMAGE_LIMITS.guestLifetime,globalDaily:IMAGE_LIMITS.globalDaily,globalLifetime:IMAGE_LIMITS.globalLifetime,concurrency:IMAGE_LIMITS.concurrency},...(available?{expiresAt:config.expiresAt}:{reason:'The hackathon image allowance is not configured or has ended. You can choose BYOK.'})};},
    async generate(input:unknown,session:ImageSession,signal?:AbortSignal){
      let reservation:ImageReservation|undefined,dispatched=false,known=false,success=false,timedOut=false;
      const started=now(),controller=new AbortController(),cancel=()=>{if(!dispatched)controller.abort();};signal?.addEventListener('abort',cancel,{once:true});
      const timer=setTimeout(()=>{timedOut=true;controller.abort();},IMAGE_LIMITS.timeoutMs);
      let interrupt!:()=>void;const interrupted=new Promise<never>((_,reject)=>{interrupt=()=>reject(new ImageFailure(timedOut?'timeout':'cancelled'));controller.signal.addEventListener('abort',interrupt,{once:true});});void interrupted.catch(()=>{});
      try{
        if(!configured())throw new ImageFailure('unavailable');
        if(session.appId!==config.appId||!session.uid||session.uid.length>128||!/^[a-f0-9]{64}$/.test(session.attestationHash??''))throw new ImageFailure('unauthenticated');
        const parsed=imageRequestSchema.safeParse(input);if(!parsed.success)throw new ImageFailure('invalid_request');
        if(signal?.aborted)throw new ImageFailure('cancelled');
        const admission=deps.ledger.reserve(session.uid,parsed.data.requestId,session.attestationHash);
        void admission.then(late=>{if(controller.signal.aborted&&!reservation)void deps.ledger.complete(late,true,false).catch(()=>{});},()=>{});
        reservation=await Promise.race([admission,interrupted]);controller.signal.throwIfAborted();
        const result=await Promise.race([interrupted,(async()=>{
          const photo=await prepareServerPhoto(parsed.data.photoBase64);controller.signal.throwIfAborted();
          const reference=approvedReference(parsed.data.style),body=imageProviderBody(parsed.data.style,photo,reference),key=config.key().trim();
          if(!key)throw new ImageFailure('unavailable');controller.signal.throwIfAborted();
          dispatched=true;const image=await callImageProvider(body,key,controller.signal,fetcher);known=true;return image;
        })()]);
        controller.signal.throwIfAborted();if(signal?.aborted)throw new ImageFailure('cancelled');success=true;
        return{status:'ok' as const,data:[{b64_json:result.base64}],output_format:'png' as const,model:IMAGE_MODEL,createdAt:new Date(now()).toISOString(),elapsedMs:Math.max(0,now()-started),width:result.width,height:result.height};
      }catch(error){return imageFailure(controller.signal.aborted?timedOut?'timeout':'cancelled':error instanceof ImageFailure?error.code:'unavailable');}
      finally{
        clearTimeout(timer);signal?.removeEventListener('abort',cancel);controller.signal.removeEventListener('abort',interrupt);
        if(reservation)try{await deps.ledger.complete(reservation,!dispatched||known,success);}catch{/* Durable lease stays; admission halts after expiry. No refund/retry. */}
      }
    },
  };
}

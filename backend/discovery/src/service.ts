import {DISCOVERY_MODEL,type FccCityContent,type DiscoveryResponse} from './core-shim.ts';
import {DiscoveryFailure,PUBLIC_LIMITS,publicRequestSchema,safeFailure,type Usage} from './contract.ts';
import type {SharedLedger,Reservation} from './ledger.ts';
import {callPublicProvider,providerBody,publicCityLoader} from './provider.ts';

export interface VerifiedSession {uid:string;appId:string;attestationHash:string;}
export interface PublicDiscoveryConfig {enabled:boolean;contributorAcknowledged:boolean;appId:string;key:()=>string;}
export interface PublicDiscoveryDependencies {ledger:SharedLedger;fetcher?:typeof fetch;loadCity?:(id:string,signal:AbortSignal)=>Promise<FccCityContent>;}
export function createPublicDiscovery(config:PublicDiscoveryConfig,deps:PublicDiscoveryDependencies){
  const fetcher=deps.fetcher??fetch,loadCity=deps.loadCity??publicCityLoader(fetcher);
  const configured=()=>config.enabled&&config.contributorAcknowledged&&/^1:944001311456:web:[a-z0-9]+$/.test(config.appId)&&!!config.key().trim();
  return{
    async status(){
      // Public GET is a configuration hint only. Durable quota admission happens on
      // authenticated POST, so polling status cannot amplify unauthenticated DB reads.
      try{const available=configured();return{available,transport:'firebase-attested',readiness:'configured-only',modelId:DISCOVERY_MODEL,...(available?{}:{reason:'Public discovery is unavailable. Continue with FCC.'})};}
      catch{return{available:false,transport:'firebase-attested',modelId:DISCOVERY_MODEL,reason:'Public discovery is unavailable. Continue with FCC.'};}
    },
    async discover(input:unknown,session:VerifiedSession,options:{signal?:AbortSignal}={}):Promise<DiscoveryResponse|ReturnType<typeof safeFailure>>{
      let reservation:Reservation|undefined,usage:Usage|undefined,providerCalled=false,success=false,timedOut=false;
      // Once dispatch may have incurred usage, finish within the existing deadline
      // and account it even if the caller disconnects. No detached background work.
      const controller=new AbortController(),cancel=()=>{if(!providerCalled)controller.abort();};
      options.signal?.addEventListener('abort',cancel,{once:true});
      const timer=setTimeout(()=>{timedOut=true;controller.abort();},PUBLIC_LIMITS.timeoutMs);
      let interrupt!:()=>void;
      const interrupted=new Promise<never>((_,reject)=>{interrupt=()=>reject(new DiscoveryFailure(timedOut?'timeout':'cancelled'));controller.signal.addEventListener('abort',interrupt,{once:true});});
      void interrupted.catch(()=>{});
      try{
        if(!configured())throw new DiscoveryFailure('unavailable');
        if(!session.uid||session.uid.length>128||session.appId!==config.appId||!/^[a-f0-9]{64}$/.test(session.attestationHash??''))throw new DiscoveryFailure('unauthenticated');
        const parsed=publicRequestSchema.safeParse(input);
        if(!parsed.success||Buffer.byteLength(JSON.stringify(parsed.data),'utf8')>PUBLIC_LIMITS.requestBytes)throw new DiscoveryFailure('invalid_request');
        if(options.signal?.aborted)throw new DiscoveryFailure('cancelled');
        // A reservation may commit while the client disconnects. Await it before taking any
        // external action so the resulting durable attempt is never lost or refunded.
        const admission=deps.ledger.reserve(session.uid,parsed.data.requestId,session.attestationHash);
        void admission.then(late=>{if(controller.signal.aborted&&!reservation)void deps.ledger.complete(late,false,{inputTokens:0,outputTokens:0,totalTokens:0}).catch(()=>{});},()=>{});
        reservation=await Promise.race([admission,interrupted]);
        controller.signal.throwIfAborted();
        const result=await Promise.race([interrupted,(async()=>{
          const city=await loadCity(parsed.data.cityId,controller.signal);controller.signal.throwIfAborted();
          const body=providerBody(parsed.data,city),key=config.key().trim();
          if(!key)throw new DiscoveryFailure('unavailable');
          controller.signal.throwIfAborted();providerCalled=true;
          return callPublicProvider(body,key,city,parsed.data,controller.signal,fetcher,value=>{usage=value;});
        })()]);
        if(controller.signal.aborted)throw new DiscoveryFailure(timedOut?'timeout':'cancelled');
        if(options.signal?.aborted)throw new DiscoveryFailure('cancelled');
        success=true;return result;
      }catch(error){
        return safeFailure(controller.signal.aborted?timedOut?'timeout':'cancelled':error instanceof DiscoveryFailure?error.code:'unavailable');
      }finally{
        clearTimeout(timer);options.signal?.removeEventListener('abort',cancel);controller.signal.removeEventListener('abort',interrupt);
        if(reservation){
          try{await deps.ledger.complete(reservation,success,providerCalled?usage:{inputTokens:0,outputTokens:0,totalTokens:0});}
          catch{/* The durable lease remains. Future admission halts when it expires; no refund or retry. */}
        }
      }
    },
  };
}

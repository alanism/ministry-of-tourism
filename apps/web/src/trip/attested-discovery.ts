import {firebaseIdentity,readAttestedConfig,type Identity,type ClientConfig} from './attested-identity';
export type {Identity,ClientConfig} from './attested-identity';
export interface DiscoveryInput {cityId:string;seedIds:string[];category:'any'|'food'|'coffee'|'culture'|'shops';}
export interface ClientDependencies {fetcher?:typeof fetch;identity?:(config:ClientConfig)=>Promise<Identity>;}
function abortable<T>(pending:Promise<T>,signal:AbortSignal):Promise<T>{
  if(signal.aborted)return Promise.reject(Error('Discovery stopped. Nothing was added.'));
  return new Promise((resolve,reject)=>{
    const abort=()=>reject(Error('Discovery stopped. Nothing was added.'));signal.addEventListener('abort',abort,{once:true});
    void pending.then(value=>{signal.removeEventListener('abort',abort);signal.aborted?abort():resolve(value);},error=>{signal.removeEventListener('abort',abort);reject(error);});
  });
}


export function createAttestedDiscoveryClient(deps:ClientDependencies={}){
  const fetcher=deps.fetcher??fetch;
  let identity:Promise<Identity>|undefined;

  return{
    async post(input:DiscoveryInput,options:{contributorConsent:boolean;signal:AbortSignal}):Promise<Response>{
      if(options.contributorConsent!==true)throw Error('Review and agree to the Contributor notice before discovery.');
      options.signal.throwIfAborted();
      if(!/^[a-z0-9][a-z0-9-]{0,119}$/.test(input.cityId)||!Array.isArray(input.seedIds)||input.seedIds.length<1||input.seedIds.length>3||new Set(input.seedIds).size!==input.seedIds.length||input.seedIds.some(id=>typeof id!=='string'||!id||id.length>200)||!['any','food','coffee','culture','shops'].includes(input.category))throw Error('Choose one to three public FCC places.');
      const body=JSON.stringify({cityId:input.cityId,seedIds:[...input.seedIds],category:input.category,requestId:crypto.randomUUID(),contributorConsent:true});
      if(new TextEncoder().encode(body).length>2048)throw Error('This discovery request is too large.');
      const config=await readAttestedConfig(fetcher,options.signal);options.signal.throwIfAborted();
      if(!identity)identity=(deps.identity??(value=>firebaseIdentity(value,fetcher)))(config).catch(error=>{identity=undefined;throw error;});
      const session=await abortable(identity,options.signal);
      const [idToken,appCheckToken]=await abortable(Promise.all([session.idToken(),session.appCheckToken()]),options.signal);
      options.signal.throwIfAborted();
      return fetcher('/api/muse/discover',{method:'POST',signal:options.signal,credentials:'omit',cache:'no-store',redirect:'error',headers:{'content-type':'application/json','x-mot-request':'1',authorization:`Bearer ${idToken}`,'x-firebase-appcheck':appCheckToken},body});
    },
  };
}

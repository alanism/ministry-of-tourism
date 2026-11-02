import type {SharedRoomAuth} from './shared-room-client';
import {SharedRoomRequestError,sharedRoomAwait,sharedRoomLocalUrl,sharedRoomResponseJson} from './shared-room-client';
export interface SharedRoomEmulatorSession extends SharedRoomAuth {email:string;expiresAt:number;signOut:()=>void;}
/** Development fixture sign-in only. The trusted room service still verifies the actual issued token on every request. */
export async function signInSharedRoomEmulator(config:{authBaseUrl:string;projectId:string},email:string,password:string,caller?:AbortSignal,fetcher:typeof fetch=fetch):Promise<SharedRoomEmulatorSession>{
 if(!import.meta.env.DEV)throw new SharedRoomRequestError('unavailable');
 const base=sharedRoomLocalUrl(config.authBaseUrl,config.projectId);if(!email||email.length>320||!password||password.length>1024)throw new SharedRoomRequestError('unavailable');
 const timeout=new AbortController(),signal=caller?AbortSignal.any([caller,timeout.signal]):timeout.signal,timer=setTimeout(()=>timeout.abort(),10000);
 try{
  const response=await sharedRoomAwait(()=>fetcher(base.origin+'/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=synthetic-emulator-key',{method:'POST',signal,credentials:'omit',redirect:'error',referrerPolicy:'no-referrer',cache:'no-store',headers:{'content-type':'application/json'},body:JSON.stringify({email,password,returnSecureToken:true})}),signal);
  if(!response.ok){void response.body?.cancel().catch(()=>{});throw new SharedRoomRequestError('unavailable');}
  const raw=await sharedRoomResponseJson(response,signal,65536) as Record<string,unknown>;signal.throwIfAborted();
  if(!raw||typeof raw.localId!=='string'||!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(raw.localId)||typeof raw.idToken!=='string'||!raw.idToken||raw.idToken.length>16384||typeof raw.email!=='string'||!Number.isFinite(Number(raw.expiresIn))||Number(raw.expiresIn)<=0)throw new SharedRoomRequestError('invalid-response');
  let token=raw.idToken,active=true;const expiresAt=Date.now()+Number(raw.expiresIn)*1000;
  return{uid:raw.localId,email:raw.email,expiresAt,async getIdToken(){if(!active||Date.now()>=expiresAt)throw new SharedRoomRequestError('unavailable');return token;},signOut(){active=false;token='';}};
 }catch(error){if(error instanceof SharedRoomRequestError)throw error;throw new SharedRoomRequestError(signal.aborted?'cancelled':'unavailable');}
 finally{clearTimeout(timer);}
}

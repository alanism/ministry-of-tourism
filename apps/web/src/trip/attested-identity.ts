export interface Identity {idToken:()=>Promise<string>;appCheckToken:()=>Promise<string>;}
export interface ClientConfig {enabled:true;projectId:'nonhumanintelligence';appId:string;appCheckSiteKey:string;}
let appCheckRuntime:{app:import('firebase/app').FirebaseApp;siteKey:string;check:import('firebase/app-check').AppCheck}|undefined;
const unavailable=()=>Error('Public discovery is unavailable. Continue with FCC.');
export async function readAttestedConfig(fetcher:typeof fetch,signal:AbortSignal):Promise<ClientConfig>{
  const response=await fetcher('/discovery-public.json',{signal,credentials:'omit',cache:'no-store',redirect:'error'});
  if(!response.ok)throw unavailable();
  const text=await response.text();if(text.length>4096)throw unavailable();
  const value=JSON.parse(text);
  if(value.enabled!==true||value.projectId!=='nonhumanintelligence'||typeof value.appId!=='string'||!/^1:944001311456:web:[a-z0-9]+$/.test(value.appId)||typeof value.appCheckSiteKey!=='string'||value.appCheckSiteKey.length<20||value.appCheckSiteKey.length>200)throw unavailable();
  return{enabled:true,projectId:value.projectId,appId:value.appId,appCheckSiteKey:value.appCheckSiteKey};
}

export async function firebaseIdentity(config:ClientConfig,fetcher:typeof fetch=fetch):Promise<Identity>{
    // Imported only after explicit preview consent, never on board load or status GET.
    const [{getApps,initializeApp},{initializeAuth,getAuth,browserLocalPersistence,setPersistence,signInAnonymously},{initializeAppCheck,ReCaptchaEnterpriseProvider,getLimitedUseToken}]=await Promise.all([import('firebase/app'),import('firebase/auth'),import('firebase/app-check')]);
    const response=await fetcher('/__/firebase/init.json',{credentials:'omit',cache:'no-store',redirect:'error'});
    if(!response.ok)throw unavailable();
    const text=await response.text();if(text.length>8192)throw unavailable();const options=JSON.parse(text);
    if(options.projectId!=='nonhumanintelligence'||typeof options.apiKey!=='string'||!options.apiKey)throw unavailable();
    const existing=getApps().find(app=>app.name==='mot-discovery-guest');
    if(existing&&existing.options.appId!==config.appId)throw unavailable();
    const app=existing??initializeApp({...options,appId:config.appId},'mot-discovery-guest');
    const auth=existing?getAuth(app):initializeAuth(app,{persistence:browserLocalPersistence});
    // Reuse the consented anonymous browser identity after reload. Refuse discovery
    // when persistent Auth storage is unavailable; the manual board still works.
    await setPersistence(auth,browserLocalPersistence);await auth.authStateReady();
    if(appCheckRuntime&&(appCheckRuntime.app!==app||appCheckRuntime.siteKey!==config.appCheckSiteKey))throw unavailable();
    const appCheck=appCheckRuntime?.check??initializeAppCheck(app,{provider:new ReCaptchaEnterpriseProvider(config.appCheckSiteKey),isTokenAutoRefreshEnabled:false});
    appCheckRuntime={app,siteKey:config.appCheckSiteKey,check:appCheck};
    const user=auth.currentUser??(await signInAnonymously(auth)).user;
    if(!user.isAnonymous)throw unavailable();
    return{idToken:()=>user.getIdToken(),appCheckToken:async()=>(await getLimitedUseToken(appCheck)).token};
  }

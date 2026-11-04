import {onRequest} from 'firebase-functions/v2/https';
import {defineBoolean,defineSecret,defineString} from 'firebase-functions/params';
import {getApps,initializeApp} from 'firebase-admin/app';
import {getAuth} from 'firebase-admin/auth';
import {getAppCheck} from 'firebase-admin/app-check';
import {getFirestore} from 'firebase-admin/firestore';
import {PROJECT_ID,DATABASE_ID,SECRET_ID,REGION,safeFailure} from './contract.ts';
import {createFirestoreLedger} from './ledger.ts';
import {createPublicDiscovery} from './service.ts';
import {createPublicHttp} from './http.ts';
import {createPublicIdentityVerifier} from './identity.ts';

const enabled=defineBoolean('MOT_PUBLIC_DISCOVERY_ENABLED',{default:false});
const contributor=defineBoolean('MOT_PUBLIC_DISCOVERY_CONTRIBUTOR_ACK',{default:false});
const webAppId=defineString('MOT_DISCOVERY_WEB_APP_ID',{default:''});
const metaKey=defineSecret(SECRET_ID);

export const motPublicDiscovery=onRequest({region:REGION,memory:'256MiB',timeoutSeconds:60,minInstances:0,maxInstances:2,concurrency:4,cors:false,
  invoker:'public',serviceAccount:`mot-discovery-runtime@${PROJECT_ID}.iam.gserviceaccount.com`,secrets:[metaKey]},async(request,response)=>{
  // No secret reads, Admin SDK calls or usage writes during deployment discovery or when disabled.
  if(!enabled.value()||!contributor.value()||!webAppId.value()||process.env.GCLOUD_PROJECT!==PROJECT_ID){response.setHeader('cache-control','no-store');response.status(503).json(request.path==='/api/muse/discovery-status'?{available:false,transport:'firebase-attested',reason:'Public discovery is unavailable. Continue with FCC.'}:safeFailure('unavailable'));return;}
  const app=getApps().find(app=>app.name==='mot-discovery')??initializeApp({projectId:PROJECT_ID},'mot-discovery');
  const service=createPublicDiscovery({enabled:true,contributorAcknowledged:true,appId:webAppId.value(),key:()=>metaKey.value()},
    {ledger:createFirestoreLedger(getFirestore(app,DATABASE_ID))});
  await createPublicHttp(service,createPublicIdentityVerifier({appId:webAppId.value(),
    verifyAppCheck:(token,options)=>getAppCheck(app).verifyToken(token,options),
    verifyIdToken:(token,checkRevoked)=>getAuth(app).verifyIdToken(token,checkRevoked),
  }))(request,response);
});

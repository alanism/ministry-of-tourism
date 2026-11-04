import {onRequest} from 'firebase-functions/v2/https';
import {defineBoolean,defineSecret,defineString} from 'firebase-functions/params';
import {getApps,initializeApp} from 'firebase-admin/app';
import {getAuth} from 'firebase-admin/auth';
import {getAppCheck} from 'firebase-admin/app-check';
import {getFirestore} from 'firebase-admin/firestore';
import {createImageIdentity} from './identity.ts';
import {PROJECT_ID,DATABASE_ID,SECRET_ID,REGION,imageFailure} from './contract.ts';
import {createImageLedger} from './ledger.ts';
import {createImageService} from './service.ts';
import {createImageHttp,imageCors} from './http.ts';
const enabled=defineBoolean('MOT_IMAGE_PREVIEW_ENABLED',{default:false});
const privacy=defineBoolean('MOT_IMAGE_PRIVACY_ACKNOWLEDGED',{default:false});
const appId=defineString('MOT_IMAGE_WEB_APP_ID',{default:''});
const expiresAt=defineString('MOT_IMAGE_PREVIEW_ENDS_AT',{default:''});
const metaKey=defineSecret(SECRET_ID);
export const motFundedImages=onRequest({region:REGION,memory:'512MiB',timeoutSeconds:300,minInstances:0,maxInstances:2,concurrency:2,cors:false,invoker:'public',serviceAccount:`mot-image-runtime@${PROJECT_ID}.iam.gserviceaccount.com`,secrets:[metaKey]},async(req,res)=>{
  if(imageCors(req,res))return;
  if(!enabled.value()||!privacy.value()||!appId.value()||!expiresAt.value()||process.env.GCLOUD_PROJECT!==PROJECT_ID){
    res.setHeader('cache-control','no-store');res.status(req.method==='GET'&&req.path==='/api/muse/images/status'?200:503).json(req.path==='/api/muse/images/status'?{available:false,transport:'firebase-attested-image',readiness:'configured-only',reason:'The hackathon image allowance is not configured. You can choose BYOK.',limits:{guestLifetime:2,globalDaily:20,globalLifetime:100,concurrency:1}}:imageFailure('unavailable'));return;
  }
  const app=getApps().find(value=>value.name==='mot-images')??initializeApp({projectId:PROJECT_ID},'mot-images');
  const db=getFirestore(app,DATABASE_ID);
  const service=createImageService({enabled:true,privacyAcknowledged:true,appId:appId.value(),expiresAt:expiresAt.value(),key:()=>metaKey.value()},{ledger:createImageLedger(db)});
  await createImageHttp(service,createImageIdentity({appId:appId.value(),verifyAppCheck:(token,options)=>getAppCheck(app).verifyToken(token,options),verifyIdToken:(token,revoked)=>getAuth(app).verifyIdToken(token,revoked)},async hash=>(await db.doc('motDiscoveryAttestations/'+hash).get()).exists))(req,res);
});

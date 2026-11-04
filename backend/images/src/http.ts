import type {Request,Response} from 'express';
import {ORIGINS,IMAGE_LIMITS,imageFailure,imageRequestSchema,type ImageSession} from './contract.ts';
import type {createImageService} from './service.ts';
export interface ImageIdentity {verify(token:string,attestation:string,signal?:AbortSignal):Promise<ImageSession>}
/** The direct function URL avoids Hosting's 60-second proxy timeout. No cookies. */
export function imageCors(req:Request,res:Response):boolean{
  const origin=req.get('origin');
  const allowed=ORIGINS.includes(origin as typeof ORIGINS[number]);
  if(allowed){res.setHeader('access-control-allow-origin',origin!);res.setHeader('vary','Origin');res.setHeader('access-control-allow-methods','POST, GET, OPTIONS');res.setHeader('access-control-allow-headers','Content-Type, X-MoT-Request, Authorization, X-Firebase-AppCheck');}
  if(req.method!=='OPTIONS')return false;
  res.setHeader('cache-control','no-store');
  if(allowed&&req.path==='/api/muse/images/edit'&&req.get('access-control-request-method')==='POST')res.status(204).end();
  else res.status(403).end();return true;
}
export function createImageHttp(service:ReturnType<typeof createImageService>,identity:ImageIdentity){
  return async(req:Request,res:Response)=>{
    if(imageCors(req,res))return;
    res.setHeader('content-type','application/json; charset=utf-8');res.setHeader('cache-control','no-store');res.setHeader('x-content-type-options','nosniff');
    const send=(status:number,body:unknown)=>{if(!res.destroyed&&!res.writableEnded)res.status(status).json(body);};
    if(req.path==='/api/muse/images/status'&&req.method==='GET'){send(200,service.status());return;}
    if(req.path!=='/api/muse/images/edit'||req.method!=='POST'){send(404,imageFailure('invalid_request'));return;}
    if(!ORIGINS.includes(req.get('origin') as typeof ORIGINS[number])||req.get('x-mot-request')!=='1'||!/^application\/json(?:;|$)/i.test(req.get('content-type')??'')){send(403,imageFailure('unauthenticated'));return;}
    const raw=(req as Request&{rawBody?:Buffer}).rawBody;
    if(Number(req.get('content-length'))>IMAGE_LIMITS.bodyBytes||(raw&&raw.length>IMAGE_LIMITS.bodyBytes)){send(413,imageFailure('invalid_request'));return;}
    const parsed=imageRequestSchema.safeParse(req.body);if(!parsed.success){send(400,imageFailure('invalid_request'));return;}
    if(Buffer.byteLength(JSON.stringify(parsed.data),'utf8')>IMAGE_LIMITS.bodyBytes){send(413,imageFailure('invalid_request'));return;}
    const token=/^Bearer ([^\s]{1,8192})$/.exec(req.get('authorization')??''),attestation=req.get('x-firebase-appcheck');
    if(!token||!attestation||attestation.length>8192){send(401,imageFailure('unauthenticated'));return;}
    const controller=new AbortController(),abort=()=>{if(!res.writableEnded)controller.abort();};req.once('aborted',abort);res.once('close',abort);
    try{
      if(req.aborted||res.destroyed){controller.abort();return;}
      let session:ImageSession,timer:ReturnType<typeof setTimeout>|undefined;
      try{session=await Promise.race([identity.verify(token[1]!,attestation,controller.signal),new Promise<never>((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('verification_timeout'));},8000);})]);}
      catch{send(401,imageFailure('unauthenticated'));return;}
      finally{if(timer)clearTimeout(timer);}
      if(controller.signal.aborted||req.aborted||res.destroyed)return;
      const result=await service.generate(parsed.data,session,controller.signal);
      const code=result.status==='ok'?undefined:result.code;
      send(result.status==='ok'?200:code==='invalid_request'?400:code==='unauthenticated'?401:code==='rate_limited'?429:code==='busy'||code==='replayed'?409:503,result);
    }finally{req.removeListener('aborted',abort);res.removeListener('close',abort);}
  };
}

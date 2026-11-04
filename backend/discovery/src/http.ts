import type {Request,Response} from 'express';
import {ORIGINS,PUBLIC_LIMITS,publicRequestSchema,safeFailure} from './contract.ts';
import type {createPublicDiscovery,VerifiedSession} from './service.ts';

export interface PublicIdentityVerifier {verify(idToken:string,appCheckToken:string,signal?:AbortSignal):Promise<VerifiedSession>;}
export function createPublicHttp(service:ReturnType<typeof createPublicDiscovery>,identity:PublicIdentityVerifier){
  return async(request:Request,response:Response)=>{
    response.setHeader('content-type','application/json; charset=utf-8');response.setHeader('cache-control','no-store');response.setHeader('x-content-type-options','nosniff');
    const send=(status:number,value:unknown)=>{if(!response.destroyed&&!response.writableEnded)response.status(status).json(value);};
    const path=request.path;
    if(path==='/api/muse/discovery-status'&&request.method==='GET'){send(200,await service.status());return;}
    if(path!=='/api/muse/discover'||request.method!=='POST'){send(404,safeFailure('invalid_request'));return;}
    if(!ORIGINS.includes(request.get('origin') as typeof ORIGINS[number])||request.get('x-mot-request')!=='1'||!/^application\/json(?:;|$)/i.test(request.get('content-type')??'')){send(403,safeFailure('unauthenticated'));return;}
    const bytes=(request as Request&{rawBody?:Buffer}).rawBody;
    if(Number(request.get('content-length'))>PUBLIC_LIMITS.requestBytes||(bytes&&bytes.length>PUBLIC_LIMITS.requestBytes)){send(413,safeFailure('invalid_request'));return;}
    const body=publicRequestSchema.safeParse(request.body);
    if(!body.success){send(400,safeFailure('invalid_request'));return;}
    if(Buffer.byteLength(JSON.stringify(body.data),'utf8')>PUBLIC_LIMITS.requestBytes){send(413,safeFailure('invalid_request'));return;}
    const bearer=/^Bearer ([^\s]{1,8192})$/.exec(request.get('authorization')??''),appCheck=request.get('x-firebase-appcheck');
    if(!bearer||!appCheck||appCheck.length>8192){send(401,safeFailure('unauthenticated'));return;}
    const controller=new AbortController(),abort=()=>{if(!response.writableEnded)controller.abort();};
    request.once('aborted',abort);response.once('close',abort);
    try{
      if(request.aborted||response.destroyed){controller.abort();return;}
      let session:VerifiedSession;
      let timer:ReturnType<typeof setTimeout>|undefined;
      try{session=await Promise.race([identity.verify(bearer[1]!,appCheck,controller.signal),new Promise<never>((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('verification_timeout'));},8000);})]);}
      catch{send(401,safeFailure('unauthenticated'));return;}
      finally{if(timer)clearTimeout(timer);}
      if(controller.signal.aborted||request.aborted||response.destroyed)return;
      const result=await service.discover(body.data,session,{signal:controller.signal});
      const code=result.status==='ok'?undefined:result.code;
      send(result.status==='ok'?200:code==='invalid_request'?400:code==='unauthenticated'?401:code==='rate_limited'?429:code==='busy'||code==='replayed'?409:503,result);
    }finally{request.removeListener('aborted',abort);response.removeListener('close',abort);}
  };
}

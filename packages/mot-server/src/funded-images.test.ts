import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {EventEmitter} from 'node:events';
import {Firestore} from 'firebase-admin/firestore';
import {createImageService} from '../../../backend/images/src/service.ts';
import {createImageHttp} from '../../../backend/images/src/http.ts';
import {createImageLedger,type ImageLedger} from '../../../backend/images/src/ledger.ts';
import {prepareServerPhoto,strictBase64,approvedReference} from '../../../backend/images/src/provider.ts';
import {IMAGE_LIMITS,DATABASE_ID} from '../../../backend/images/src/contract.ts';
import {createPublicIdentityVerifier} from '../../../backend/discovery/src/identity.ts';
import {createImageIdentity} from '../../../backend/images/src/identity.ts';

const jpeg=readFileSync(new URL('./fixtures/funded-images/source.jpg',import.meta.url));
const png=readFileSync(new URL('./fixtures/funded-images/output.png',import.meta.url));
const appId='1:944001311456:web:fixture',uid='synthetic-guest';
const hash=()=>createHash('sha256').update(crypto.randomUUID()).digest('hex');
const input=(style:'fashion'|'city'='fashion')=>({requestId:crypto.randomUUID(),style,photoBase64:jpeg.toString('base64'),consent:true as const});
const session=()=>({uid,appId,attestationHash:hash()});
const config={enabled:true,privacyAcknowledged:true,appId,expiresAt:'2099-01-01T00:00:00.000Z',key:()=> 'FICTIONAL-IMAGE-KEY'};
const provider=()=>new Response(JSON.stringify({data:[{b64_json:png.toString('base64')}]}));
const ledger=():ImageLedger=>({reserve:vi.fn(async(_u,id)=>({requestId:id,nonce:'a'.repeat(64)})),complete:vi.fn(async()=>{})});
function response(){return Object.assign(new EventEmitter(),{destroyed:false,writableEnded:false,statusCode:200,body:undefined as unknown,setHeader:vi.fn(),status(code:number){this.statusCode=code;return this;},json(body:unknown){this.body=body;this.writableEnded=true;return this;},end(){this.writableEnded=true;return this;}});}
function request(body:unknown=input()){
 const headers:Record<string,string>={origin:'https://ministryoftourism.web.app','content-type':'application/json','x-mot-request':'1',authorization:'Bearer fictional-id','x-firebase-appcheck':'fictional-attestation','access-control-request-method':'POST'};
 return Object.assign(new EventEmitter(),{path:'/api/muse/images/edit',method:'POST',body,aborted:false,rawBody:Buffer.from('{}'),get:(name:string)=>headers[name],headers});
}

it('fails closed without reading keys or ledger state when disabled, unacknowledged or expired; status never reads quotas',()=>{
 const key=vi.fn(config.key),usage=ledger();
 for(const override of [{enabled:false},{privacyAcknowledged:false},{expiresAt:'2000-01-01T00:00:00.000Z'}])expect(createImageService({...config,key,...override},{ledger:usage}).status()).toMatchObject({available:false});
 expect(key).not.toHaveBeenCalled();expect(usage.reserve).not.toHaveBeenCalled();
 expect(createImageService({...config,key},{ledger:usage}).status()).toMatchObject({available:true,readiness:'configured-only',limits:{guestLifetime:2,globalLifetime:100}});
 expect(usage.reserve).not.toHaveBeenCalled();
});
it('strictly decodes source data and strips metadata without storing the original',async()=>{
 expect(jpeg.includes(Buffer.from('SYNTHETIC-METADATA-REMOVE-ME'))).toBe(true);
 const prepared=await prepareServerPhoto(jpeg.toString('base64'));expect(prepared).toMatchObject({width:2,height:3});expect(prepared.bytes.includes(Buffer.from('SYNTHETIC-METADATA-REMOVE-ME'))).toBe(false);
 for(const value of ['data:image/jpeg;base64,'+jpeg.toString('base64'),'!!!!','YQ=','YQ==\n'])expect(()=>strictBase64(value,10000)).toThrow();
 await expect(prepareServerPhoto(png.toString('base64'))).rejects.toMatchObject({code:'invalid_request'});
});
it.each(['fashion','city'] as const)('uses only server-approved %s prompt/reference, n=1 and no tools; returns clean opaque PNG',async style=>{
 const usage=ledger(),order:string[]=[];vi.mocked(usage.reserve).mockImplementation(async(_u,id)=>{order.push('reserve');return{requestId:id,nonce:'a'.repeat(64)};});
 const fetcher=vi.fn(async(url:RequestInfo|URL,options?:RequestInit)=>{
  order.push('provider');expect(url).toBe('https://api.meta.ai/v1/images/edits');const body=JSON.parse(String(options?.body));
  expect(body).toMatchObject({model:'muse-image-1.0',n:1,output_format:'png',tool_enablement:{enable_image_search:false,enable_web_search:false,enable_shell:false}});
  expect(body.images).toHaveLength(2);expect(Buffer.from(body.images[1].image_url.split(',')[1],'base64')).toEqual(approvedReference(style));
  expect(Buffer.from(body.images[0].image_url.split(',')[1],'base64').includes(Buffer.from('SYNTHETIC-METADATA-REMOVE-ME'))).toBe(false);
  expect(body.prompt).toContain(style==='fashion'?'person':'architecture');expect(String(options?.body)).not.toContain(uid);expect(String(options?.body)).not.toContain(config.key());return provider();
 });
 const result=await createImageService(config,{ledger:usage,fetcher}).generate(input(style),session());expect(result.status).toBe('ok');
 if(result.status==='ok'){expect(result).toMatchObject({width:2,height:3,output_format:'png',model:'muse-image-1.0'});const bytes=Buffer.from(result.data[0]!.b64_json,'base64');expect(bytes[25]).toBe(2);}
 expect(order).toEqual(['reserve','provider']);expect(usage.complete).toHaveBeenCalledWith(expect.anything(),true,true);
});
it('rejects arbitrary prompt/key/URL/private context before any attestation or provider call',async()=>{
 const usage=ledger(),identity={verify:vi.fn(async()=>session())},fetcher=vi.fn(async()=>provider()),handler=createImageHttp(createImageService(config,{ledger:usage,fetcher}),identity);
 for(const extra of [{prompt:'private instructions'},{key:'must-not-be-accepted'},{reference:'https://example.org'},{boardId:'private'},{model:'other'},{consent:false}]){
  const res=response();await handler(request({...input(),...extra}) as never,res as never);expect(res.statusCode).toBe(400);
 }
 expect(identity.verify).not.toHaveBeenCalled();expect(usage.reserve).not.toHaveBeenCalled();expect(fetcher).not.toHaveBeenCalled();
});
it('allows direct-function preflight only for production origins, with no credential/SDK/provider work',async()=>{
 const usage=ledger(),identity={verify:vi.fn(async()=>session())},handler=createImageHttp(createImageService(config,{ledger:usage}),identity),req=request(),res=response();req.method='OPTIONS';await handler(req as never,res as never);expect(res.statusCode).toBe(204);expect(res.setHeader).toHaveBeenCalledWith('access-control-allow-origin','https://ministryoftourism.web.app');
 req.headers.origin='https://attacker.example';const denied=response();await handler(req as never,denied as never);expect(denied.statusCode).toBe(403);expect(identity.verify).not.toHaveBeenCalled();expect(usage.reserve).not.toHaveBeenCalled();
});
it('invalid/wrong-app/replayed attestations cannot trigger Auth lookup or image admission',async()=>{
 const usage=ledger(),verifyIdToken=vi.fn(async()=>({uid,firebase:{sign_in_provider:'anonymous'}}));
 for(const value of ['invalid',{appId:'wrong',alreadyConsumed:false,token:{jti:'x'.repeat(32)}},{appId,alreadyConsumed:true,token:{jti:'x'.repeat(32)}},{appId,alreadyConsumed:false,token:{}}]){
  const identity=createPublicIdentityVerifier({appId,verifyIdToken,verifyAppCheck:async()=>{if(typeof value==='string')throw Error();return value;}}),res=response();
  await createImageHttp(createImageService(config,{ledger:usage}),identity)(request() as never,res as never);expect(res.statusCode).toBe(401);
 }
 expect(verifyIdToken).not.toHaveBeenCalled();expect(usage.reserve).not.toHaveBeenCalled();
});
it('never calls the provider on admission/storage failure or malformed prepared image',async()=>{
 const usage=ledger(),fetcher=vi.fn(async()=>provider()),service=createImageService(config,{ledger:usage,fetcher});
 vi.mocked(usage.reserve).mockRejectedValueOnce(Error('database unavailable'));expect(await service.generate(input(),session())).toMatchObject({status:'unavailable'});
 expect(await service.generate({...input(),photoBase64:png.toString('base64')},session())).toMatchObject({code:'invalid_request'});
 expect(fetcher).not.toHaveBeenCalled();expect(usage.complete).toHaveBeenCalledWith(expect.anything(),true,false);
});
it('the durable signed-jti replay guard gates Auth lookup even when SDK consumption reports false twice',async()=>{
 const verifyIdToken=vi.fn(async()=>({uid,firebase:{sign_in_provider:'anonymous'}})),jti='fixture-jti-'.repeat(4),isUsed=vi.fn(async()=>true);
 const checks={appId,verifyIdToken,verifyAppCheck:async()=>({appId,alreadyConsumed:false,token:{jti}})};
 await expect(createImageIdentity(checks,isUsed).verify('fictional-id','fictional-attestation')).rejects.toThrow();expect(verifyIdToken).not.toHaveBeenCalled();
 expect(isUsed).toHaveBeenCalledWith(createHash('sha256').update(appId+'\0'+jti).digest('hex'));
 const unavailable=vi.fn(async()=>{throw Error('DB unavailable');});await expect(createImageIdentity(checks,unavailable).verify('id','attestation')).rejects.toThrow();expect(verifyIdToken).not.toHaveBeenCalled();
 expect(await createImageIdentity(checks,async()=>false).verify('id','attestation')).toMatchObject({uid,appId});expect(verifyIdToken).toHaveBeenCalledWith('id',true);
});
it('accounts an admitted late reservation with no provider call after cancellation',async()=>{
 let release!:(r:{requestId:string;nonce:string})=>void;const usage=ledger(),fetcher=vi.fn(async()=>provider()),abort=new AbortController();
 vi.mocked(usage.reserve).mockImplementation(()=>new Promise(resolve=>{release=resolve;}));const pending=createImageService(config,{ledger:usage,fetcher}).generate(input(),session(),abort.signal);
 await vi.waitFor(()=>expect(usage.reserve).toHaveBeenCalledOnce());abort.abort();expect(await pending).toMatchObject({code:'cancelled'});release({requestId:crypto.randomUUID(),nonce:'a'.repeat(64)});
 await vi.waitFor(()=>expect(usage.complete).toHaveBeenCalledOnce());expect(usage.complete).toHaveBeenCalledWith(expect.anything(),true,false);expect(fetcher).not.toHaveBeenCalled();
});
it('awaits accounting after provider dispatch despite caller Stop, with no late candidates or retry',async()=>{
 let release!:(value:Response)=>void;const usage=ledger(),abort=new AbortController(),fetcher=vi.fn(async()=>new Promise<Response>(resolve=>{release=resolve;}));
 const pending=createImageService(config,{ledger:usage,fetcher}).generate(input(),session(),abort.signal);await vi.waitFor(()=>expect(fetcher).toHaveBeenCalledOnce());abort.abort();expect(usage.complete).not.toHaveBeenCalled();release(provider());
 expect(await pending).toMatchObject({code:'cancelled'});expect(usage.complete).toHaveBeenCalledWith(expect.anything(),true,false);expect(fetcher).toHaveBeenCalledOnce();
});
it('rejects malformed/oversized provider responses conservatively without exposing provider errors',async()=>{
 for(const reply of [new Response('private provider error',{status:500}),new Response('{}'),new Response('{}',{headers:{'content-length':String(IMAGE_LIMITS.responseBytes+1)}})]){
  const usage=ledger(),result=await createImageService(config,{ledger:usage,fetcher:async()=>reply}).generate(input(),session());expect(result.status).not.toBe('ok');expect(JSON.stringify(result)).not.toContain('private provider error');expect(usage.complete).toHaveBeenCalledWith(expect.anything(),false,false);
 }
});
it('retains the four-minute provider deadline after disconnect and never retries an unknown outcome',async()=>{
 vi.useFakeTimers();
 try{
  let started!:()=>void;const dispatched=new Promise<void>(resolve=>{started=resolve;}),usage=ledger(),abort=new AbortController();
  const fetcher=vi.fn(async()=>{started();return new Promise<Response>(()=>{});});
  const pending=createImageService(config,{ledger:usage,fetcher}).generate(input(),session(),abort.signal);
  await dispatched;abort.abort();await vi.advanceTimersByTimeAsync(IMAGE_LIMITS.timeoutMs+1);
  expect(await pending).toMatchObject({code:'timeout'});expect(fetcher).toHaveBeenCalledOnce();expect(usage.complete).toHaveBeenCalledWith(expect.anything(),false,false);
 }finally{vi.useRealTimers();}
});

const emulator=process.env.MOT_IMAGE_QUOTA_EMULATOR_HOST;
describe.skipIf(!emulator)('funded image durable ledger (explicit loopback demo emulator)',()=>{
 const clients:Firestore[]=[];let time:number;
 const db=()=>{const c=new Firestore({projectId:'demo-mot-images',databaseId:DATABASE_ID,host:emulator!,ssl:false});clients.push(c);return c;};
 beforeEach(async()=>{if(!/^127\.0\.0\.1:\d+$/.test(emulator!))throw Error('Loopback emulator required');vi.stubEnv('FIRESTORE_EMULATOR_HOST',emulator!);time=Date.parse('2026-11-05T00:00:00Z');expect((await fetch(`http://${emulator}/emulator/v1/projects/demo-mot-images/databases/${DATABASE_ID}/documents`,{method:'DELETE'})).ok).toBe(true);});
 afterEach(async()=>{await Promise.all(clients.splice(0).map(c=>c.terminate()));vi.unstubAllEnvs();});
 it('shares one concurrent slot across eight callers and separately constructed clients',async()=>{
  const a=db(),b=db(),ledgers=[createImageLedger(a,()=>time),createImageLedger(b,()=>time)];
  const all=await Promise.allSettled(Array.from({length:8},(_,i)=>ledgers[i%2]!.reserve('guest-'+i,crypto.randomUUID(),hash())));
  const ok=all.filter((r):r is PromiseFulfilledResult<Awaited<ReturnType<ImageLedger['reserve']>>>=>r.status==='fulfilled');expect(ok).toHaveLength(1);
  await ledgers[0]!.complete(ok[0]!.value,true,true);expect((await a.doc('motImageControl/v1').get()).data()).toMatchObject({attempts:1,completed:1,halted:false,leases:{}});
 },30000);
 it('persists request/jti replay prevention and once-only nonce-bound completion across instances',async()=>{
  const a=db(),first=createImageLedger(a,()=>time),id=crypto.randomUUID(),fingerprint=hash(),r=await first.reserve('guest',id,fingerprint),restarted=createImageLedger(db(),()=>time);
  await expect(restarted.reserve('guest',id,hash())).rejects.toMatchObject({code:'replayed'});await expect(restarted.reserve('guest',crypto.randomUUID(),fingerprint)).rejects.toMatchObject({code:'replayed'});
  await expect(restarted.complete({...r,nonce:'b'.repeat(64)},true,true)).rejects.toMatchObject({code:'unavailable'});await restarted.complete(r,true,true);await first.complete(r,true,true);expect((await a.doc('motImageControl/v1').get()).data()).toMatchObject({attempts:1,completed:1});
  const record=(await a.doc('motImageRequests/'+id).get()).data();expect(JSON.stringify(record)).not.toContain('guest');expect(Object.keys(record!)).not.toContain('photoBase64');
 });
 it('rejects a jti already consumed by discovery, using the same durable marker collection',async()=>{
  const a=db(),fingerprint=hash();await a.doc('motDiscoveryAttestations/'+fingerprint).set({createdAt:time,requestId:crypto.randomUUID()});
  await expect(createImageLedger(a,()=>time).reserve('guest',crypto.randomUUID(),fingerprint)).rejects.toMatchObject({code:'replayed'});expect((await a.doc('motImageControl/v1').get()).exists).toBe(false);
 });
 it('allows two lifetime guest attempts; midnight and a new service do not reset them',async()=>{
  const a=db(),l=createImageLedger(a,()=>time);for(let i=0;i<2;i++){const r=await l.reserve('same',crypto.randomUUID(),hash());await l.complete(r,true,true);}time+=86400000;
  await expect(createImageLedger(db(),()=>time).reserve('same',crypto.randomUUID(),hash())).rejects.toMatchObject({code:'rate_limited'});
 });
 it('enforces 20/day and 100 lifetime across rollover and restarts; no refunds on known failure',async()=>{
  const a=db();for(let day=0;day<5;day++){const l=createImageLedger(a,()=>time);for(let i=0;i<20;i++){const r=await l.reserve(`${day}-${i}`,crypto.randomUUID(),hash());await l.complete(r,true,false);}await expect(l.reserve('extra-'+day,crypto.randomUUID(),hash())).rejects.toMatchObject({code:'rate_limited'});time+=86400000;}
  await expect(createImageLedger(db(),()=>time).reserve('after-restart',crypto.randomUUID(),hash())).rejects.toMatchObject({code:'rate_limited'});expect((await a.doc('motImageControl/v1').get()).data()).toMatchObject({attempts:100,completed:0});
 },60000);
 it('halts on unknown outcome or an expired crash lease without refunding the attempt',async()=>{
  const a=db(),l=createImageLedger(a,()=>time),r=await l.reserve('guest',crypto.randomUUID(),hash());await l.complete(r,false,false);
  await expect(createImageLedger(db(),()=>time).reserve('new',crypto.randomUUID(),hash())).rejects.toMatchObject({code:'unavailable'});expect((await a.doc('motImageControl/v1').get()).data()).toMatchObject({attempts:1,halted:true});
 });
 it('halts future admissions when an uncompleted lease expires',async()=>{
  const a=db(),l=createImageLedger(a,()=>time);await l.reserve('crashed',crypto.randomUUID(),hash());time+=IMAGE_LIMITS.leaseMs+1;
  await expect(createImageLedger(db(),()=>time).reserve('new',crypto.randomUUID(),hash())).rejects.toMatchObject({code:'unavailable'});expect((await a.doc('motImageControl/v1').get()).data()).toMatchObject({attempts:1,halted:true});
 });
 it('denies browser reads/writes to image accounting in the existing named database',async()=>{
  const url=`http://${emulator}/v1/projects/demo-mot-images/databases/${DATABASE_ID}/documents/motImageControl/v1`;expect((await fetch(url)).status).toBe(403);expect((await fetch(url,{method:'PATCH',headers:{'content-type':'application/json'},body:'{"fields":{}}'})).status).toBe(403);
 });
});

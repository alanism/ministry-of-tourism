// New public-backend coverage. Existing tests and runner settings are unchanged.
// The integration group runs only against an explicitly selected loopback emulator.
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {Firestore} from 'firebase-admin/firestore';
import {EventEmitter} from 'node:events';
import {createFirestoreLedger,type SharedLedger} from '../../../backend/discovery/src/ledger.ts';
import {createPublicDiscovery} from '../../../backend/discovery/src/service.ts';
import {createPublicHttp} from '../../../backend/discovery/src/http.ts';
import {createPublicIdentityVerifier} from '../../../backend/discovery/src/identity.ts';
import {DATABASE_ID,PUBLIC_LIMITS} from '../../../backend/discovery/src/contract.ts';

const appId='1:944001311456:web:fixture',uid='fixture-guest';
const source={id:'fcc:copenhagen:la',url:'https://foreignclubberscorespondence.web.app/copenhagen.html',canonicalUrl:'https://foreignclubberscorespondence.web.app/copenhagen.html',provider:'fcc' as const,sourceId:'la',cityId:'copenhagen',kind:'venue' as const,retrievedAt:'2026-11-04',version:'fixture',origin:'catalogue' as const};
const city={city:{id:'copenhagen',name:'Copenhagen',countryCode:'DK',timeZone:'Europe/Copenhagen'},articles:[],almanac:[],places:[{id:source.id,name:'La Banchina',city:'copenhagen',provenance:'fcc' as const,fixture:false as const,retrievedAt:source.retrievedAt,source}]};
const attestationHash=()=>crypto.randomUUID().replaceAll('-','').repeat(2);
const input=()=>({cityId:'copenhagen',seedIds:[source.id],category:'food' as const,requestId:crypto.randomUUID(),contributorConsent:true as const});
const envelope=()=>new Response(JSON.stringify({model:'muse-spark-1.3-contributor',status:'completed',usage:{input_tokens:100,output_tokens:30,total_tokens:130},output:[{type:'web_search_call',status:'completed',results:[{url:'https://guide.example/copenhagen',title:'Synthetic test evidence',snippet:'Fixture only: Lille Bakery and La Banchina.'}]},{type:'message',content:[{type:'output_text',text:JSON.stringify({candidates:[{name:'Lille Bakery',relatedSeedId:source.id,reason:'Fixture co-mention',sourceUrls:['https://guide.example/copenhagen']}]})}]}]}));
const config={enabled:true,contributorAcknowledged:true,appId,key:()=> 'FICTIONAL-SERVER-FIXTURE-NOT-A-REAL-KEY'};
function fakeLedger():SharedLedger{return{available:vi.fn(async()=>true),reserve:vi.fn(async(_uid,id)=>({requestId:id,nonce:'f'.repeat(64)})),complete:vi.fn(async()=>{})};}
function fakeResponse(){
  const response=Object.assign(new EventEmitter(),{destroyed:false,writableEnded:false,statusCode:200,body:undefined as unknown,setHeader:vi.fn(),status(code:number){this.statusCode=code;return this;},json(body:unknown){this.body=body;this.writableEnded=true;return this;}});
  return response;
}

it('public status performs no ledger reads, and disabled configuration does not access a key or provider',async()=>{
  const ledger=fakeLedger(),fetcher=vi.fn(async()=>envelope()),key=vi.fn(config.key);
  const enabled=createPublicDiscovery({...config,key},{ledger,fetcher,loadCity:async()=>city});
  expect(await enabled.status()).toMatchObject({available:true,readiness:'configured-only'});expect(ledger.available).not.toHaveBeenCalled();
  key.mockClear();const disabled=createPublicDiscovery({...config,enabled:false,key},{ledger,fetcher});
  expect(await disabled.status()).toMatchObject({available:false});expect(await disabled.discover(input(),{uid,appId,attestationHash:attestationHash()})).toMatchObject({status:'unavailable'});
  expect(key).not.toHaveBeenCalled();expect(fetcher).not.toHaveBeenCalled();expect(ledger.reserve).not.toHaveBeenCalled();
});
it('rejects arbitrary private fields, absent consent, wrong app and persistence failures before the provider',async()=>{
  const ledger=fakeLedger(),fetcher=vi.fn(async()=>envelope()),subject=createPublicDiscovery(config,{ledger,fetcher,loadCity:async()=>city});
  for(const request of [{...input(),cards:[{body:'private-booking'}]},{...input(),prompt:'private'},{...input(),contributorConsent:false}])expect(await subject.discover(request,{uid,appId,attestationHash:attestationHash()})).toMatchObject({code:'invalid_request'});
  expect(await subject.discover(input(),{uid,appId:'other',attestationHash:attestationHash()})).toMatchObject({code:'unauthenticated'});
  vi.mocked(ledger.reserve).mockRejectedValueOnce(Error('database unavailable'));
  expect(await subject.discover(input(),{uid,appId,attestationHash:attestationHash()})).toMatchObject({status:'unavailable'});expect(fetcher).not.toHaveBeenCalled();
});
it('reserves before any provider call, accounts actual usage, and never forwards session IDs or the server key in the prompt',async()=>{
  const order:string[]=[],ledger=fakeLedger(),fetcher=vi.fn(async(_url:RequestInfo|URL,options?:RequestInit)=>{order.push('provider');const body=String(options?.body);expect(body).not.toContain(uid);expect(body).not.toContain(config.key());expect(JSON.parse(JSON.parse(body).input)).toMatchObject({city:'Copenhagen',seeds:[{name:'La Banchina'}]});return envelope();});
  vi.mocked(ledger.reserve).mockImplementation(async(_uid,id)=>{order.push('reserve');return{requestId:id,nonce:'f'.repeat(64)};});
  const result=await createPublicDiscovery(config,{ledger,fetcher,loadCity:async()=>city}).discover(input(),{uid,appId,attestationHash:attestationHash()});
  expect(result).toMatchObject({status:'ok',candidates:[{name:'Lille Bakery'}]});expect(order).toEqual(['reserve','provider']);
  expect(ledger.complete).toHaveBeenCalledWith(expect.anything(),true,{inputTokens:100,outputTokens:30,totalTokens:130});
});
it('rejects untrusted HTTP origins, oversized bodies and missing/replayed identity before admission',async()=>{
  const ledger=fakeLedger(),fetcher=vi.fn(async()=>envelope()),identity={verify:vi.fn(async()=>({uid,appId,attestationHash:attestationHash()}))};
  const handler=createPublicHttp(createPublicDiscovery(config,{ledger,fetcher,loadCity:async()=>city}),identity);
  const headers={origin:'https://ministryoftourism.web.app','content-type':'application/json','x-mot-request':'1',authorization:'Bearer fixture-user-token','x-firebase-appcheck':'fixture-limited-use-token'};
  for(const [overrides,rawBody,status] of [[{origin:'https://other.example'},Buffer.from('{}'),403],[{authorization:''},Buffer.from('{}'),401],[{},Buffer.alloc(3000),413]] as const){
    const request=Object.assign(new EventEmitter(),{path:'/api/muse/discover',method:'POST',body:input(),rawBody,get:(name:string)=>(overrides as Record<string,string>)[name]??(headers as Record<string,string>)[name]});
    const response=fakeResponse();await handler(request as never,response as never);expect(response.statusCode).toBe(status);
  }
  identity.verify.mockRejectedValueOnce(Error('replayed App Check token'));
  const request=Object.assign(new EventEmitter(),{path:'/api/muse/discover',method:'POST',body:input(),rawBody:Buffer.from('{}'),get:(name:string)=>(headers as Record<string,string>)[name]});
  const response=fakeResponse();await handler(request as never,response as never);expect(response.statusCode).toBe(401);expect(ledger.reserve).not.toHaveBeenCalled();expect(fetcher).not.toHaveBeenCalled();
});
it('ignores a late reservation after cancellation, burns it conservatively, and never calls Meta',async()=>{
  let release!:(value:{requestId:string;nonce:string})=>void;
  const ledger=fakeLedger(),fetcher=vi.fn(async()=>envelope()),request=input(),abort=new AbortController();
  vi.mocked(ledger.reserve).mockImplementation(()=>new Promise(resolve=>{release=resolve;}));
  const pending=createPublicDiscovery(config,{ledger,fetcher,loadCity:async()=>city}).discover(request,{uid,appId,attestationHash:attestationHash()},{signal:abort.signal});
  await vi.waitFor(()=>expect(ledger.reserve).toHaveBeenCalledOnce());abort.abort();expect(await pending).toMatchObject({code:'cancelled'});
  release({requestId:request.requestId,nonce:'f'.repeat(64)});await vi.waitFor(()=>expect(ledger.complete).toHaveBeenCalledOnce());
  expect(ledger.complete).toHaveBeenCalledWith(expect.anything(),false,{inputTokens:0,outputTokens:0,totalTokens:0});expect(fetcher).not.toHaveBeenCalled();
});

function identityRequest(body:unknown=input()){
  const headers:Record<string,string>={origin:'https://ministryoftourism.web.app','content-type':'application/json','x-mot-request':'1',authorization:'Bearer fixture-user-token','x-firebase-appcheck':'fixture-attestation'};
  return Object.assign(new EventEmitter(),{path:'/api/muse/discover',method:'POST',aborted:false,body,rawBody:Buffer.from('{}'),get:(name:string)=>headers[name]});
}
it('validates parsed bodies before attestation or remote Auth lookup, including serialized size without raw-body metadata',async()=>{
  const ledger=fakeLedger(),verifyAppCheck=vi.fn(async()=>({appId,alreadyConsumed:false,token:{jti:'limited-use-fixture-unique-id'}})),verifyIdToken=vi.fn(async()=>({uid,firebase:{sign_in_provider:'anonymous'}}));
  const handler=createPublicHttp(createPublicDiscovery(config,{ledger}),createPublicIdentityVerifier({appId,verifyAppCheck,verifyIdToken}));
  for(const body of [undefined,{}, {...input(),cards:['private']},{...input(),contributorConsent:false},{...input(),seedIds:[]}]){
    const request=identityRequest();request.body=body;const response=fakeResponse();await handler(request as never,response as never);expect(response.statusCode).toBe(400);
  }
  const oversized=identityRequest({...input(),cityId:'a'.repeat(120),seedIds:['界'.repeat(200),'語'.repeat(200),'文'.repeat(200)]});
  const response=fakeResponse();await handler(oversized as never,response as never);expect(response.statusCode).toBe(413);
  expect(verifyAppCheck).not.toHaveBeenCalled();expect(verifyIdToken).not.toHaveBeenCalled();expect(ledger.reserve).not.toHaveBeenCalled();
});
it('malformed, wrong-app, replayed and unconfirmed attestations cannot trigger Auth lookup or admission',async()=>{
  const ledger=fakeLedger(),verifyIdToken=vi.fn(async()=>({uid,firebase:{sign_in_provider:'anonymous'}}));
  for(const outcome of ['malformed',{appId:'other-app',alreadyConsumed:false},{appId,alreadyConsumed:true},{appId}]){
    const verifyAppCheck=vi.fn(async()=>{if(typeof outcome==='string')throw Error('malformed attestation');return outcome;});
    const handler=createPublicHttp(createPublicDiscovery(config,{ledger}),createPublicIdentityVerifier({appId,verifyAppCheck,verifyIdToken}));
    const response=fakeResponse();await handler(identityRequest() as never,response as never);expect(response.statusCode).toBe(401);
    expect(verifyAppCheck).toHaveBeenCalledWith('fixture-attestation',{consume:true});
  }
  expect(verifyIdToken).not.toHaveBeenCalled();expect(ledger.reserve).not.toHaveBeenCalled();
});
it('a fresh expected-app attestation gates revocation-checked Auth and preserves anonymous-only successful discovery',async()=>{
  const order:string[]=[],ledger=fakeLedger(),fetcher=vi.fn(async()=>envelope());
  const verifyAppCheck=vi.fn(async()=>{order.push('attestation');return{appId,alreadyConsumed:false,token:{jti:'limited-use-fixture-unique-id'}};});
  const verifyIdToken=vi.fn(async()=>{order.push('auth');return{uid,firebase:{sign_in_provider:'anonymous'}};});
  const handler=createPublicHttp(createPublicDiscovery(config,{ledger,fetcher,loadCity:async()=>city}),createPublicIdentityVerifier({appId,verifyAppCheck,verifyIdToken}));
  const response=fakeResponse();await handler(identityRequest() as never,response as never);expect(response.statusCode).toBe(200);expect(order).toEqual(['attestation','auth']);
  expect(verifyIdToken).toHaveBeenCalledWith('fixture-user-token',true);expect(fetcher).toHaveBeenCalledOnce();expect(vi.mocked(ledger.reserve).mock.calls[0]?.[2]).toMatch(/^[a-f0-9]{64}$/);
  const blockedLedger=fakeLedger(),revoked=vi.fn(async()=>{throw Error('revoked');}),nonanonymous=vi.fn(async()=>({uid,firebase:{sign_in_provider:'google.com'}}));
  for(const verify of [revoked,nonanonymous]){
    const denied=createPublicHttp(createPublicDiscovery(config,{ledger:blockedLedger}),createPublicIdentityVerifier({appId,verifyAppCheck,verifyIdToken:verify}));
    const deniedResponse=fakeResponse();await denied(identityRequest() as never,deniedResponse as never);expect(deniedResponse.statusCode).toBe(401);expect(verify).toHaveBeenCalledWith('fixture-user-token',true);
  }
  expect(blockedLedger.reserve).not.toHaveBeenCalled();
});
it('an auth-phase disconnect or verification deadline prevents late Auth lookup and paid admission',async()=>{
  for(const reason of ['disconnect','timeout'] as const){
    let release!:(value:{appId:string;alreadyConsumed:false;token:{jti:string}})=>void;
    const ledger=fakeLedger(),verifyAppCheck=vi.fn(()=>new Promise<{appId:string;alreadyConsumed:false;token:{jti:string}}>(resolve=>{release=resolve;})),verifyIdToken=vi.fn(async()=>({uid,firebase:{sign_in_provider:'anonymous'}}));
    const handler=createPublicHttp(createPublicDiscovery(config,{ledger}),createPublicIdentityVerifier({appId,verifyAppCheck,verifyIdToken}));
    const request=identityRequest(),response=fakeResponse();
    if(reason==='timeout')vi.useFakeTimers();
    try{
      const pending=handler(request as never,response as never);
      expect(verifyAppCheck).toHaveBeenCalledOnce();
      if(reason==='disconnect'){response.destroyed=true;response.emit('close');release({appId,alreadyConsumed:false,token:{jti:'limited-use-fixture-unique-id'}});}
      else{await vi.advanceTimersByTimeAsync(8001);await pending;release({appId,alreadyConsumed:false,token:{jti:'limited-use-fixture-unique-id'}});}
      await pending;await Promise.resolve();await Promise.resolve();
      expect(verifyIdToken).not.toHaveBeenCalled();expect(ledger.reserve).not.toHaveBeenCalled();
    }finally{if(reason==='timeout')vi.useRealTimers();}
  }
  const ledger=fakeLedger(),identity={verify:vi.fn(async()=>({uid,appId,attestationHash:attestationHash()}))},request=identityRequest();request.aborted=true;
  await createPublicHttp(createPublicDiscovery(config,{ledger}),identity)(request as never,fakeResponse() as never);
  expect(identity.verify).not.toHaveBeenCalled();expect(ledger.reserve).not.toHaveBeenCalled();
  let releaseAuth!:(value:{uid:string;firebase:{sign_in_provider:string}})=>void;
  const verifyIdToken=vi.fn(()=>new Promise<{uid:string;firebase:{sign_in_provider:string}}>(resolve=>{releaseAuth=resolve;}));
  const verifying=createPublicHttp(createPublicDiscovery(config,{ledger}),createPublicIdentityVerifier({appId,verifyAppCheck:async()=>({appId,alreadyConsumed:false,token:{jti:'limited-use-fixture-unique-id'}}),verifyIdToken}));
  const response=fakeResponse(),pending=verifying(identityRequest() as never,response as never);
  await vi.waitFor(()=>expect(verifyIdToken).toHaveBeenCalledOnce());response.destroyed=true;response.emit('close');releaseAuth({uid,firebase:{sign_in_provider:'anonymous'}});await pending;
  expect(ledger.reserve).not.toHaveBeenCalled();expect(response.body).toBeUndefined();
});
it('after provider dispatch a disconnect waits for bounded accounting, returns no candidates and completes once with known usage',async()=>{
  let release!:(response:Response)=>void;
  const ledger=fakeLedger(),abort=new AbortController(),fetcher=vi.fn(async(_url:RequestInfo|URL,options?:RequestInit)=>new Promise<Response>(resolve=>{
    release=resolve;expect(options?.signal?.aborted).toBe(false);
  }));
  const pending=createPublicDiscovery(config,{ledger,fetcher,loadCity:async()=>city}).discover(input(),{uid,appId,attestationHash:attestationHash()},{signal:abort.signal});
  await vi.waitFor(()=>expect(fetcher).toHaveBeenCalledOnce());abort.abort();await Promise.resolve();
  expect(ledger.complete).not.toHaveBeenCalled();expect(fetcher.mock.calls[0]![1]?.signal?.aborted).toBe(false);
  release(envelope());expect(await pending).toEqual({status:'error',code:'cancelled',reason:'Discovery stopped. Nothing was added.'});
  expect(ledger.complete).toHaveBeenCalledOnce();expect(ledger.complete).toHaveBeenCalledWith(expect.anything(),false,{inputTokens:100,outputTokens:30,totalTokens:130});
  // A later disconnect while accounting is already committing cannot send a late response.
  let finishAccounting!:()=>void;
  const completing=fakeLedger();vi.mocked(completing.complete).mockImplementation(()=>new Promise<void>(resolve=>{finishAccounting=resolve;}));
  const response=fakeResponse(),handler=createPublicHttp(createPublicDiscovery(config,{ledger:completing,fetcher:async()=>envelope(),loadCity:async()=>city}),{verify:async()=>({uid,appId,attestationHash:attestationHash()})});
  const waiting=handler(identityRequest() as never,response as never);await vi.waitFor(()=>expect(completing.complete).toHaveBeenCalledOnce());
  response.destroyed=true;response.emit('close');finishAccounting();await waiting;expect(response.body).toBeUndefined();expect(completing.complete).toHaveBeenCalledOnce();
});
it('provider timeouts remain bounded after disconnect and conservatively complete with unknown usage',async()=>{
  vi.useFakeTimers();
  try{
    const ledger=fakeLedger(),abort=new AbortController();let started!:()=>void;const dispatched=new Promise<void>(resolve=>{started=resolve;});
    const fetcher=vi.fn(async()=>{started();return new Promise<Response>(()=>{});});
    const pending=createPublicDiscovery(config,{ledger,fetcher,loadCity:async()=>city}).discover(input(),{uid,appId,attestationHash:attestationHash()},{signal:abort.signal});
    await dispatched;abort.abort();await vi.advanceTimersByTimeAsync(PUBLIC_LIMITS.timeoutMs+1);
    expect(await pending).toMatchObject({code:'timeout'});expect(fetcher).toHaveBeenCalledOnce();
    expect(ledger.complete).toHaveBeenCalledWith(expect.anything(),false,undefined);
  }finally{vi.useRealTimers();}
});

it('binds a verified limited-use token to an irreversible fingerprint and rejects missing unique IDs before Auth',async()=>{
  const verifyIdToken=vi.fn(async()=>({uid,firebase:{sign_in_provider:'anonymous'}}));
  const identity=createPublicIdentityVerifier({appId,verifyAppCheck:async()=>({appId,alreadyConsumed:false,token:{jti:'unique-limited-token-fixture'}}),verifyIdToken});
  const verified=await identity.verify('fixture-user','fixture-attestation');
  expect(verified).toMatchObject({attestationHash:expect.stringMatching(/^[a-f0-9]{64}$/)});
  expect(JSON.stringify(verified)).not.toContain('unique-limited-token-fixture');
  verifyIdToken.mockClear();
  const ordinary=createPublicIdentityVerifier({appId,verifyAppCheck:async()=>({appId,alreadyConsumed:false,token:{}}),verifyIdToken});
  await expect(ordinary.verify('fixture-user','ordinary-token')).rejects.toThrow();expect(verifyIdToken).not.toHaveBeenCalled();
});

const emulator=process.env.MOT_DISCOVERY_QUOTA_EMULATOR_HOST;
describe.skipIf(!emulator)('public discovery real Firestore transactions (loopback emulator only)',()=>{
  const databases:Firestore[]=[];let clock:number;
  const client=()=>{
    const db=new Firestore({projectId:'demo-mot-discovery',databaseId:DATABASE_ID,host:emulator!,ssl:false});databases.push(db);return db;
  };
  beforeEach(async()=>{
    if(!/^127\.0\.0\.1:\d+$/.test(emulator!))throw Error('Only a loopback Firestore emulator is permitted.');
    vi.stubEnv('FIRESTORE_EMULATOR_HOST',emulator!);
    clock=Date.parse('2026-11-05T10:00:00.000Z');
    const cleared=await fetch(`http://${emulator}/emulator/v1/projects/demo-mot-discovery/databases/${DATABASE_ID}/documents`,{method:'DELETE'});
    if(!cleared.ok)throw Error('The local Firestore emulator could not be reset.');
  });
  afterEach(async()=>{await Promise.all(databases.splice(0).map(db=>db.terminate()));vi.unstubAllEnvs();});
  it('rejects an attestation fingerprint reused with a fresh request UUID across ledger instances',async()=>{
    const a=client(),b=client(),first=createFirestoreLedger(a,()=>clock),second=createFirestoreLedger(b,()=>clock),fingerprint='b'.repeat(64);
    const admission=await first.reserve('guest-one',crypto.randomUUID(),fingerprint);
    await first.complete(admission,false,{inputTokens:0,outputTokens:0,totalTokens:0});
    await expect(second.reserve('guest-two',crypto.randomUUID(),fingerprint)).rejects.toMatchObject({code:'replayed'});
    const state=(await a.doc('motDiscoveryControl/v1').get()).data();expect(state?.attempts).toBe(1);
    const stored=await a.collection('motDiscoveryAttestations').get();expect(stored.size).toBe(1);expect(stored.docs[0]!.id).toBe(fingerprint);
  });
  it('caps simultaneous callers across independently constructed clients and ledger/service instances',async()=>{
    const a=client(),b=client(),ledgers=[createFirestoreLedger(a,()=>clock),createFirestoreLedger(b,()=>clock)];
    const admitted=await Promise.allSettled(Array.from({length:8},(_,i)=>ledgers[i%2]!.reserve('guest-'+i,crypto.randomUUID())));
    const accepted=admitted.filter((value):value is PromiseFulfilledResult<Awaited<ReturnType<SharedLedger['reserve']>>>=>value.status==='fulfilled');
    expect(accepted).toHaveLength(2);expect((await a.doc('motDiscoveryControl/v1').get()).data()!.attempts).toBe(2);
    await Promise.all(accepted.map(value=>ledgers[0]!.complete(value.value,true,{inputTokens:10,outputTokens:5,totalTokens:15})));
    let releaseProvider!:()=>void,admissions=0;const providerGate=new Promise<void>(resolve=>{releaseProvider=resolve;});
    const fetcher=vi.fn(async()=>{await providerGate;return envelope();});
    const services=ledgers.map(ledger=>createPublicDiscovery(config,{ledger:{...ledger,async reserve(uid,id){try{return await ledger.reserve(uid,id);}finally{admissions++;}}},fetcher,loadCity:async()=>city}));
    const pending=Array.from({length:4},(_,i)=>services[i%2]!.discover(input(),{uid:'service-'+i,appId,attestationHash:attestationHash()}));
    let results:Awaited<ReturnType<typeof services[number]['discover']>>[]=[];
    try{await vi.waitFor(()=>{expect(admissions).toBe(4);expect(fetcher).toHaveBeenCalledTimes(2);},{timeout:20000});}
    finally{releaseProvider();results=await Promise.all(pending);}
    expect(results.filter(result=>result.status==='ok')).toHaveLength(2);expect(results.filter(result=>result.status!=='ok')).toHaveLength(2);
    expect((await a.doc('motDiscoveryControl/v1').get()).data()!.attempts).toBe(4);
  },30000);
  it('persists replay prevention and once-only completion across a simulated restart',async()=>{
    const a=client(),first=createFirestoreLedger(a,()=>clock),id=crypto.randomUUID(),reservation=await first.reserve('guest',id);
    const restarted=createFirestoreLedger(client(),()=>clock);
    await expect(restarted.reserve('guest',id)).rejects.toMatchObject({code:'replayed'});
    await restarted.complete(reservation,true,{inputTokens:100,outputTokens:20,totalTokens:120});await first.complete(reservation,true,{inputTokens:100,outputTokens:20,totalTokens:120});
    const state=(await a.doc('motDiscoveryControl/v1').get()).data()!;expect(state.attempts).toBe(1);expect(state.inputTokens).toBe(100);expect(state.outputTokens).toBe(20);
    expect(JSON.stringify((await a.doc(`motDiscoveryRequests/${id}`).get()).data())).not.toContain('guest');
  });
  it('client disconnect after dispatch records real usage and leaves future shared admission available',async()=>{
    const db=client(),ledger=createFirestoreLedger(db,()=>clock),abort=new AbortController();let release!:(response:Response)=>void;
    const fetcher=vi.fn(async()=>new Promise<Response>(resolve=>{release=resolve;}));
    const pending=createPublicDiscovery(config,{ledger,fetcher,loadCity:async()=>city}).discover(input(),{uid,appId,attestationHash:attestationHash()},{signal:abort.signal});
    await vi.waitFor(()=>expect(fetcher).toHaveBeenCalledOnce());abort.abort();release(envelope());
    expect(await pending).toMatchObject({code:'cancelled'});
    expect((await db.doc('motDiscoveryControl/v1').get()).data()).toMatchObject({halted:false,attempts:1,inputTokens:100,outputTokens:30,leases:{}});
    const next=await createFirestoreLedger(client(),()=>clock).reserve('different-guest',crypto.randomUUID());
    await ledger.complete(next,false,{inputTokens:0,outputTokens:0,totalTokens:0});expect(fetcher).toHaveBeenCalledOnce();
  });
  it('enforces per-identity and UTC-day limits across instances; a new day never resets lifetime attempts',async()=>{
    const db=client(),ledgers=[createFirestoreLedger(db,()=>clock),createFirestoreLedger(client(),()=>clock)];
    for(let i=0;i<3;i++){const r=await ledgers[i%2]!.reserve('same-guest',crypto.randomUUID());await ledgers[0]!.complete(r,false,{inputTokens:0,outputTokens:0,totalTokens:0});}
    await expect(ledgers[1]!.reserve('same-guest',crypto.randomUUID())).rejects.toMatchObject({code:'rate_limited'});
    for(let i=3;i<20;i++){const r=await ledgers[i%2]!.reserve('guest-'+i,crypto.randomUUID());await ledgers[0]!.complete(r,true,{inputTokens:0,outputTokens:0,totalTokens:0});}
    await expect(ledgers[1]!.reserve('new-guest',crypto.randomUUID())).rejects.toMatchObject({code:'rate_limited'});
    clock+=86400000;const r=await ledgers[1]!.reserve('same-guest',crypto.randomUUID());await ledgers[0]!.complete(r,true,{inputTokens:0,outputTokens:0,totalTokens:0});
    expect((await db.doc('motDiscoveryControl/v1').get()).data()!.attempts).toBe(21);
  },30000);
  it('holds the lifetime cap through daily rollover and fresh ledger objects',async()=>{
    const db=client();
    for(let day=0;day<5;day++){
      const ledger=createFirestoreLedger(db,()=>clock);
      for(let i=0;i<20;i++){const reservation=await ledger.reserve(`day-${day}-guest-${i}`,crypto.randomUUID());await ledger.complete(reservation,true,{inputTokens:1,outputTokens:1,totalTokens:2});}
      clock+=86400000;
    }
    await expect(createFirestoreLedger(client(),()=>clock).reserve('after-restart',crypto.randomUUID())).rejects.toMatchObject({code:'rate_limited'});
    expect((await db.doc('motDiscoveryControl/v1').get()).data()!.attempts).toBe(PUBLIC_LIMITS.lifetimeAttempts);
  },60000);
  it('halts after unknown usage or expired uncertain leases, and an observed-token threshold is checked after response',async()=>{
    const db=client(),ledger=createFirestoreLedger(db,()=>clock),r=await ledger.reserve('guest',crypto.randomUUID());
    await ledger.complete(r,false);await expect(createFirestoreLedger(client(),()=>clock).reserve('next',crypto.randomUUID())).rejects.toMatchObject({code:'unavailable'});
    expect((await db.doc('motDiscoveryControl/v1').get()).data()!.attempts).toBe(1);
  });
  it('halts on an expired lease without refunding a crashed worker',async()=>{
    const db=client(),ledger=createFirestoreLedger(db,()=>clock);await ledger.reserve('crashed-guest',crypto.randomUUID());clock+=PUBLIC_LIMITS.leaseMs+1;
    await expect(createFirestoreLedger(client(),()=>clock).reserve('other',crypto.randomUUID())).rejects.toMatchObject({code:'unavailable'});
    expect((await db.doc('motDiscoveryControl/v1').get()).data()).toMatchObject({halted:true,attempts:1});
  });
  it('records real usage before halting at the observed-token circuit and refuses a forged completion nonce',async()=>{
    const db=client(),ledger=createFirestoreLedger(db,()=>clock),r=await ledger.reserve('guest',crypto.randomUUID());
    await expect(ledger.complete({...r,nonce:'e'.repeat(64)},true,{inputTokens:1,outputTokens:1,totalTokens:2})).rejects.toMatchObject({code:'unavailable'});
    await ledger.complete(r,true,{inputTokens:200001,outputTokens:1,totalTokens:200002});
    expect((await db.doc('motDiscoveryControl/v1').get()).data()).toMatchObject({halted:true,inputTokens:200001,outputTokens:1});
    await expect(createFirestoreLedger(client(),()=>clock).reserve('next',crypto.randomUUID())).rejects.toMatchObject({code:'unavailable'});
  });
  it('denies untrusted client reads and writes to the dedicated usage database',async()=>{
    const url=`http://${emulator}/v1/projects/demo-mot-discovery/databases/${DATABASE_ID}/documents/motDiscoveryControl/v1`;
    expect((await fetch(url)).status).toBe(403);
    expect((await fetch(url,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({fields:{attempts:{integerValue:'0'}}})})).status).toBe(403);
  });
});

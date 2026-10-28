import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Server } from 'node:http';
import { createMuseAdapter } from './index.ts';

const env={META_API_KEY:'fictional-server-key',META_MODEL_ID:'muse-spark-1.3',META_PRIVACY_ACKNOWLEDGED:'true',MOT_ORIGIN:'http://127.0.0.1:5173'};
const request={boardId:'board-test',prompt:'Suggest a day',cards:[{id:'card-1',title:'Selected note',body:'Selected traveler preference',stage:'plan'}],assetIds:[],grounding:{cityId:'san-sebastian',level:'unavailable',articles:[]}};
const proposal={boardId:'board-test',ops:[{command:'trip_card_create',input:{kind:'note',title:'Suggested day'}}],reason:'A plan',sources:[]};
const response=()=>new Response(JSON.stringify({id:'provider-request-1',model:'muse-spark-1.3',choices:[{message:{content:JSON.stringify(proposal)},finish_reason:'stop'}],usage:{prompt_tokens:100,completion_tokens:40,total_tokens:140}}),{status:200,headers:{'content-type':'application/json'}});
const openServers:Server[]=[];
afterEach(async()=>{vi.useRealTimers();await Promise.all(openServers.splice(0).map(server=>new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()))));});

describe('MOT-95 bounded server-held Muse runtime',()=>{
  it('stays unavailable without explicit standard model and privacy configuration',async()=>{
    const fetcher=vi.fn(async()=>response());
    const adapter=createMuseAdapter({META_API_KEY:'fictional'}, {fetcher});
    expect(adapter.status().available).toBe(false);
    expect((await adapter.propose(request)).status).toBe('unavailable');expect(fetcher).not.toHaveBeenCalled();
    expect(createMuseAdapter({...env,META_MODEL_ID:'muse-spark-1.3-contributor'},{fetcher}).status().available).toBe(false);
  });
  it('calls the fixed documented endpoint once, with data separated from instructions and a real receipt',async()=>{
    const fetcher=vi.fn(async()=>response());const adapter=createMuseAdapter(env,{fetcher});
    expect(adapter.status().available).toBe(true);
    const result=await adapter.propose(request);
    expect(result).toMatchObject({status:'ok',proposal,receipt:{requestId:'provider-request-1',modelId:'muse-spark-1.3',usage:{inputTokens:100,outputTokens:40,totalTokens:140}}});
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url,options]=fetcher.mock.calls[0] as unknown as [string,RequestInit];expect(url).toBe('https://api.meta.ai/v1/chat/completions');
    expect(new Headers(options.headers).get('authorization')).toBe('Bearer fictional-server-key');
    const payload=JSON.parse(String(options.body));expect(payload.max_completion_tokens).toBeLessThanOrEqual(2048);expect(payload.tools).toBeUndefined();
    expect(payload.messages[0].role).toBe('developer');expect(payload.messages[0].content).not.toContain('Selected traveler preference');
    expect(JSON.parse(payload.messages[1].content)).toMatchObject(request);expect(JSON.stringify(result)).not.toContain(env.META_API_KEY);
  });
  it('rejects oversized, unknown and private-field-bearing payloads before any provider call',async()=>{
    const fetcher=vi.fn(async()=>response());const adapter=createMuseAdapter(env,{fetcher});
    for(const input of [{...request,prompt:'x'.repeat(8001)},{...request,endpoint:'https://attacker.example'},{...request,cards:[{...request.cards[0],scope:'private'}]}]) {
      expect(await adapter.propose(input)).toMatchObject({status:'error',error:{code:'invalid_request'}});
    }
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('returns typed provider failure and logs only allowlisted diagnostics',async()=>{
    const logs:unknown[]=[];const fetcher=vi.fn(async()=>new Response('PRIVATE PROVIDER ERROR: '+request.prompt,{status:429}));
    const result=await createMuseAdapter(env,{fetcher,log:entry=>logs.push(entry)}).propose(request);
    expect(result).toMatchObject({status:'error',error:{code:'rate_limited'}});
    expect(JSON.stringify(logs)).not.toContain(request.prompt);expect(JSON.stringify(logs)).not.toContain(request.cards[0]!.body);expect(JSON.stringify(logs)).not.toContain(env.META_API_KEY);
    expect(JSON.stringify(result)).not.toContain('PRIVATE PROVIDER ERROR');
  });
  it('rejects invalid or wrong-board output before it reaches the app',async()=>{
    const fetcher=vi.fn(async()=>new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({...proposal,boardId:'wrong-board'})},finish_reason:'stop'}]})));
    expect(await createMuseAdapter(env,{fetcher}).propose(request)).toMatchObject({status:'error',error:{code:'invalid_response'}});
  });
  it('cancels a pending provider request and makes no second call',async()=>{
    const fetcher=vi.fn(async(_url:RequestInfo|URL,options?:RequestInit)=>new Promise<Response>((_resolve,reject)=>options?.signal?.addEventListener('abort',()=>reject(new DOMException('aborted','AbortError')))));
    const controller=new AbortController();const result=createMuseAdapter(env,{fetcher}).propose(request,{signal:controller.signal});
    controller.abort();expect(await result).toMatchObject({status:'error',error:{code:'cancelled'}});expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('times out a provider request within the configured ceiling',async()=>{
    vi.useFakeTimers();
    const fetcher=vi.fn(async(_url:RequestInfo|URL,options?:RequestInit)=>new Promise<Response>((_resolve,reject)=>options?.signal?.addEventListener('abort',()=>reject(new DOMException('aborted','AbortError')))));
    const pending=createMuseAdapter(env,{fetcher}).propose(request);await vi.advanceTimersByTimeAsync(30001);
    expect(await pending).toMatchObject({status:'error',error:{code:'timeout'}});
  });
  it('HTTP boundary rejects cross-origin and unmarked requests and serves a bounded local round trip',async()=>{
    const {createMuseHttpServer}=await import('./server.ts');const fetcher=vi.fn(async()=>response());const server=createMuseHttpServer(env,{fetcher});openServers.push(server);
    await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const address=server.address();if(!address||typeof address==='string')throw new Error('Missing server address');const url=`http://127.0.0.1:${address.port}`;
    expect((await fetch(url+'/api/muse/status').then(r=>r.json())).available).toBe(true);
    const post=(origin:string,marker=true)=>fetch(url+'/api/muse/propose',{method:'POST',headers:{origin,'content-type':'application/json',...(marker?{'x-mot-request':'1'}:{})},body:JSON.stringify(request)});
    expect((await post('https://attacker.example')).status).toBe(403);expect((await post(env.MOT_ORIGIN,false)).status).toBe(403);expect(fetcher).not.toHaveBeenCalled();
    expect(await post(env.MOT_ORIGIN).then(r=>r.json())).toMatchObject({status:'ok',proposal});
    const huge=await fetch(url+'/api/muse/propose',{method:'POST',headers:{origin:env.MOT_ORIGIN,'content-type':'application/json','x-mot-request':'1'},body:'x'.repeat(200000)});expect(huge.status).toBe(413);expect(fetcher).toHaveBeenCalledTimes(1);
  });
});

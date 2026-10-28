// Loopback session boundary; production authenticated ingress is a separate deployment decision.
import { createServer, type Server } from 'node:http';
import { pathToFileURL } from 'node:url';
import { createMuseAdapter, JOB_LIMITS, type MuseDependencies } from './index.ts';

export function createMuseHttpServer(env:Record<string,string|undefined>,dependencies:MuseDependencies={}):Server{
  const origin=env.MOT_ORIGIN??'http://127.0.0.1:5173';
  const configured=new URL(origin);
  if(configured.origin!==origin || !['http:','https:'].includes(configured.protocol))throw new Error('MOT_ORIGIN must be one exact browser origin');
  const adapter=createMuseAdapter(env,{...dependencies,log:dependencies.log??(entry=>{process.stderr.write(JSON.stringify(entry)+'\n');})});
  const counters=new Map<string,{since:number;count:number}>();
  return createServer(async(request,response)=>{
    response.setHeader('content-type','application/json; charset=utf-8');response.setHeader('cache-control','no-store');response.setHeader('x-content-type-options','nosniff');
    const send=(status:number,value:unknown)=>{if(!response.destroyed){response.writeHead(status);response.end(JSON.stringify(value));}};
    if(request.url==='/api/muse/status'&&request.method==='GET'){send(200,adapter.status());return;}
    if(request.url!=='/api/muse/propose'||request.method!=='POST'){send(404,{status:'error',error:{code:'not_found'}});return;}
    if(request.headers.origin!==origin||request.headers['x-mot-request']!=='1'||!/^application\/json(?:;|$)/i.test(request.headers['content-type']??'')){request.resume();send(403,{status:'error',error:{code:'forbidden',message:'Request must come from the configured MoT browser session.'}});return;}
    const address=request.socket.remoteAddress??'unknown',now=Date.now();
    for(const [ip,entry] of counters)if(now-entry.since>60000)counters.delete(ip);
    const counter=counters.get(address)??{since:now,count:0};counter.count++;counters.set(address,counter);
    if(counter.count>6){request.resume();send(429,{status:'error',error:{code:'rate_limited',message:'Try again after one minute.'}});return;}
    if(Number(request.headers['content-length'])>JOB_LIMITS.maxRequestBytes){request.resume();send(413,{status:'error',error:{code:'invalid_request',message:'Request too large.'}});return;}
    const controller=new AbortController();request.on('aborted',()=>controller.abort());response.on('close',()=>{if(!response.writableEnded)controller.abort();});
    let total=0;const chunks:Buffer[]=[];
    try{
      for await(const chunk of request){const bytes=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk);total+=bytes.length;if(total>JOB_LIMITS.maxRequestBytes){send(413,{status:'error',error:{code:'invalid_request',message:'Request too large.'}});return;}chunks.push(bytes);}
      let input:unknown;try{input=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{send(400,{status:'error',error:{code:'invalid_request',message:'Invalid JSON request.'}});return;}
      const result=await adapter.propose(input,{signal:controller.signal});
      send(result.status==='ok'?200:result.status==='unavailable'?503:result.error.code==='invalid_request'?400:result.error.code==='rate_limited'?429:result.error.code==='busy'?409:502,result);
    }catch{send(400,{status:'error',error:{code:'invalid_request',message:'Request interrupted.'}});}
  });
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const port=Number(process.env.MOT_SERVER_PORT??8788);
  if(!Number.isInteger(port)||port<1024||port>65535)throw new Error('Invalid MoT server port');
  const server=createMuseHttpServer(process.env,{log:entry=>process.stderr.write(JSON.stringify(entry)+'\n')});
  server.requestTimeout=15000;server.headersTimeout=10000;
  server.listen(port,'127.0.0.1',()=>process.stderr.write(`MoT Muse adapter listening on loopback port ${port}\n`));
}

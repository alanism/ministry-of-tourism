import {Readable} from 'node:stream';
import {createServer} from 'node:http';
import {createRoomEmulatorService} from './room-emulator-service.ts';
/** Explicit loopback proof server. Never a production listener/deployment entrypoint. */
export async function startRoomEmulatorHttp(options:{port:number;appOrigin:string}){
 const origin=new URL(options.appOrigin);if(!['http:'].includes(origin.protocol)||!['127.0.0.1','localhost'].includes(origin.hostname)||origin.origin!==options.appOrigin)throw Error('Explicit loopback app origin required');
 if(!Number.isInteger(options.port)||options.port<0||options.port>65535)throw Error('Invalid local port');
 const service=createRoomEmulatorService();
 const server=createServer(async(incoming,outgoing)=>{
  outgoing.setHeader('cache-control','no-store');outgoing.setHeader('referrer-policy','no-referrer');
  const requestOrigin=incoming.headers.origin;if(requestOrigin&&requestOrigin!==options.appOrigin){outgoing.writeHead(403);outgoing.end();incoming.resume();return;}
  if(requestOrigin){outgoing.setHeader('access-control-allow-origin',options.appOrigin);outgoing.setHeader('vary','Origin');}
  if(incoming.method==='OPTIONS'){outgoing.setHeader('access-control-allow-methods','GET, POST');outgoing.setHeader('access-control-allow-headers','authorization, content-type, x-room-session, x-room-membership-epoch');outgoing.writeHead(204);outgoing.end();return;}
  try{
   const binary=/^\/rooms\/[A-Za-z0-9][A-Za-z0-9._:-]{0,199}\/media\/stages\/[A-Za-z0-9][A-Za-z0-9._:-]{0,199}\/bytes$/.test(incoming.url??'')&&incoming.headers['content-type']==='image/png';
   const declared=Number(incoming.headers['content-length']??0),limit=binary?10*1024*1024:65536;
   if(declared>limit){outgoing.writeHead(413,{'content-type':'application/json','connection':'close'});outgoing.end(JSON.stringify({error:{code:'limit',message:'Request exceeds its declared room boundary; retain draft',recoverableDraft:true}}),()=>incoming.destroy());return;}
   const headers=new Headers();for(const[key,value]of Object.entries(incoming.headers))if(value!==undefined)headers.set(key,Array.isArray(value)?value.join(','):value);
   const init={method:incoming.method,headers,...(!['GET','HEAD'].includes(incoming.method??'GET')?{body:Readable.toWeb(incoming) as ReadableStream<Uint8Array>,duplex:'half'}:{})};const response=await service.handle(new Request('http://127.0.0.1'+(incoming.url??'/'),init),{networkAddress:incoming.socket.remoteAddress??'unknown'});if(!incoming.complete)outgoing.setHeader('connection','close');outgoing.writeHead(response.status,Object.fromEntries(response.headers));outgoing.end(new Uint8Array(await response.arrayBuffer()),()=>{if(!incoming.complete)incoming.destroy();});
  }catch{if(!outgoing.headersSent)outgoing.writeHead(403,{'content-type':'application/json'});outgoing.end(JSON.stringify({error:{code:'unavailable',message:'Room operation unavailable',recoverableDraft:true}}));}
 });
 await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(options.port,'127.0.0.1',()=>resolve());});const address=server.address();if(!address||typeof address==='string')throw Error('Local listener failed');
 return{url:'http://127.0.0.1:'+address.port,async close(){await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));await service.close();}};
}

import {createServer} from 'node:http';
import {readFile,writeFile} from 'node:fs/promises';
import {startRoomEmulatorHttp} from '../packages/mot-server/src/room-emulator-http.ts';
const controlFile=process.argv[2];if(!controlFile)throw Error('Explicit local proof-control file required');
const inner=await startRoomEmulatorHttp({port:0,appOrigin:'http://127.0.0.1:5199'});
await writeFile(controlFile,JSON.stringify({offline:false,dropNextAcceptedCardAck:false})+'\n');
/** Ephemeral loopback fault proxy only; no new product route, identity or acceptance authority. */
const proxy=createServer(async(request,response)=>{
 try{
  const control=JSON.parse(await readFile(controlFile,'utf8'));
  if(control.offline){request.resume();response.destroy();return;}
  const chunks=[];let size=0;for await(const chunk of request){size+=chunk.length;if(size>10*1024*1024){response.writeHead(413);response.end();return;}chunks.push(chunk);}
  const headers=new Headers();for(const[key,value]of Object.entries(request.headers))if(value!==undefined&&!['host','connection','content-length'].includes(key))headers.set(key,Array.isArray(value)?value.join(','):value);
  const body=Buffer.concat(chunks),result=await fetch(inner.url+(request.url??'/'),{method:request.method,headers,redirect:'manual',...(!['GET','HEAD'].includes(request.method??'GET')?{body}:{} )}),bytes=new Uint8Array(await result.arrayBuffer());
  if(control.dropNextAcceptedCardAck&&request.method==='POST'&&/\/operations$/.test(request.url??'')&&result.status===200){
   await writeFile(controlFile,JSON.stringify({...control,dropNextAcceptedCardAck:false})+'\n');let operationId;try{operationId=JSON.parse(body.toString('utf8')).operationId;}catch{}
   console.log(JSON.stringify({proofFault:'accepted-card-ack-dropped',operationId,upstreamStatus:200}));response.destroy();return;
  }
  response.writeHead(result.status,Object.fromEntries([...result.headers].filter(([key])=>!['connection','transfer-encoding','content-encoding','content-length'].includes(key))));response.end(bytes);
 }catch{if(!response.headersSent)response.writeHead(503,{'content-type':'application/json'});response.end(JSON.stringify({error:{code:'unavailable',message:'Local proof transport unavailable',recoverableDraft:true}}));}
});
await new Promise((resolve,reject)=>{proxy.once('error',reject);proxy.listen(48125,'127.0.0.1',resolve);});
console.log(JSON.stringify({proofService:true,url:'http://127.0.0.1:48125',actualCentralService:inner.url,appOrigin:'http://127.0.0.1:5199',faultControl:controlFile,production:false}));
let closing=false;const close=async()=>{if(closing)return;closing=true;await new Promise(resolve=>proxy.close(resolve));await inner.close();process.exit(0);};process.on('SIGINT',close);process.on('SIGTERM',close);

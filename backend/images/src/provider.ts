import sharp from 'sharp';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {MUSE_FASHION_PROMPT,MUSE_CITY_INK_PROMPT} from '../../../packages/core/src/trip/muse-fashion-preset.ts';
import {ImageFailure,IMAGE_ENDPOINT,IMAGE_MODEL,IMAGE_LIMITS,type ImageRequest} from './contract.ts';
const references={fashion:{file:'fashion-reference.png',hash:'7f79f78e08ddc7f0472ab8d5ba5b6baa57a4be18d606e172ad5750ec3b41214e'},city:{file:'city-ink-reference.png',hash:'7913c2ebe656ce98ab7b5e35de568fbdf179bd15458a0c70840ecd5bfd1a3894'}} as const;
export function strictBase64(value:string,max:number):Buffer{
  if(value.length>Math.ceil(max*4/3)||value.length%4!==0||!/^[A-Za-z0-9+/]*={0,2}$/.test(value))throw new ImageFailure('invalid_request');
  const bytes=Buffer.from(value,'base64');if(!bytes.length||bytes.length>max||bytes.toString('base64')!==value)throw new ImageFailure('invalid_request');return bytes;
}
export async function prepareServerPhoto(base64:string){
  const bytes=strictBase64(base64,IMAGE_LIMITS.sourceBytes);
  if(bytes[0]!==255||bytes[1]!==216||bytes[2]!==255)throw new ImageFailure('invalid_request');
  try{
    const photo=sharp(bytes,{limitInputPixels:IMAGE_LIMITS.sourceSide**2,failOn:'warning',sequentialRead:true});
    const meta=await photo.metadata();
    if(meta.format!=='jpeg'||!meta.width||!meta.height||meta.width>IMAGE_LIMITS.sourceSide||meta.height>IMAGE_LIMITS.sourceSide||(meta.pages??1)!==1)throw Error();
    // Re-encode server-side; caller-controlled EXIF, names and other metadata never reach Meta.
    const result=await photo.rotate().flatten({background:'#ffffff'}).jpeg({quality:92}).toBuffer({resolveWithObject:true});
    if(result.data.length>IMAGE_LIMITS.sourceBytes)throw Error();
    return{bytes:result.data,width:result.info.width,height:result.info.height};
  }catch{throw new ImageFailure('invalid_request');}
}
export function approvedReference(style:ImageRequest['style']):Buffer{
  const ref=references[style],bytes=readFileSync(new URL('../references/'+ref.file,import.meta.url));
  if(bytes.length>1024*1024||createHash('sha256').update(bytes).digest('hex')!==ref.hash)throw new ImageFailure('unavailable');return bytes;
}
export function imageProviderBody(style:ImageRequest['style'],photo:{bytes:Buffer;width:number;height:number},reference:Buffer){
  return{model:IMAGE_MODEL,prompt:style==='fashion'?MUSE_FASHION_PROMPT:MUSE_CITY_INK_PROMPT,n:1,size:style==='fashion'?'1024x1536':`${photo.width}x${photo.height}`,response_format:'b64_json',output_format:'png',reasoning_strength:'high',stream:false,tool_enablement:{enable_image_search:false,enable_web_search:false,enable_shell:false},images:[{image_url:'data:image/jpeg;base64,'+photo.bytes.toString('base64')},{image_url:'data:image/png;base64,'+reference.toString('base64')}]};
}
async function boundedJson(response:Response,signal:AbortSignal){
  if(Number(response.headers.get('content-length'))>IMAGE_LIMITS.responseBytes)throw new ImageFailure('invalid_response');
  const reader=response.body?.getReader();if(!reader)throw new ImageFailure('invalid_response');
  const chunks:Uint8Array[]=[];let bytes=0;
  try{while(true){signal.throwIfAborted();const next=await reader.read();if(next.done)break;bytes+=next.value.length;if(bytes>IMAGE_LIMITS.responseBytes)throw new ImageFailure('invalid_response');chunks.push(next.value);}}finally{await reader.cancel().catch(()=>{});}
  try{return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;}catch{throw new ImageFailure('invalid_response');}
}
export async function callImageProvider(body:ReturnType<typeof imageProviderBody>,key:string,signal:AbortSignal,fetcher:typeof fetch){
  const response=await fetcher(IMAGE_ENDPOINT,{method:'POST',redirect:'error',headers:{authorization:'Bearer '+key,'content-type':'application/json'},body:JSON.stringify(body),signal});
  if(!response.ok){void response.body?.cancel().catch(()=>{});throw new ImageFailure('provider_unavailable');}
  const json=await boundedJson(response,signal) as {data?:{b64_json?:unknown}[]};signal.throwIfAborted();
  if(!Array.isArray(json?.data)||json.data.length!==1||typeof json.data[0]?.b64_json!=='string')throw new ImageFailure('invalid_response');
  let bytes:Buffer;
  try{bytes=strictBase64(json.data[0].b64_json,IMAGE_LIMITS.outputBytes);}catch{throw new ImageFailure('invalid_response');}
  try{
    const output=sharp(bytes,{limitInputPixels:IMAGE_LIMITS.outputPixels,failOn:'warning',sequentialRead:true}),meta=await output.metadata();
    if(meta.format!=='png'||!meta.width||!meta.height||meta.width>8192||meta.height>8192||(meta.pages??1)!==1)throw Error();
    const clean=await output.flatten({background:'#ffffff'}).png().toBuffer({resolveWithObject:true});
    if(clean.data.length>IMAGE_LIMITS.outputBytes)throw Error();signal.throwIfAborted();
    return{base64:clean.data.toString('base64'),width:clean.info.width,height:clean.info.height};
  }catch{throw new ImageFailure('invalid_response');}
}

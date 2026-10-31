// Experimental HTML bounds; native package limits and originals are unchanged.
export const HTML_LIMITS={sourceBytes:50*1024*1024,fileBytes:10*1024*1024,outputBytes:128*1024*1024,pixels:16_000_000,totalPixels:64_000_000,pages:128} as const;
export interface EmbeddedMedia {assetId:string;sourceSha256:string;embeddedSha256:string;width:number;height:number;}
export function rasterDimensions(bytes:Uint8Array,mime:string):{width:number;height:number}{
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  if(mime==='image/png'&&bytes.length>=33&&[137,80,78,71,13,10,26,10].every((n,i)=>bytes[i]===n)&&view.getUint32(8)===13&&String.fromCharCode(...bytes.subarray(12,16))==='IHDR'){
    let at=8,image=false,end=false;
    while(at+12<=bytes.length){const length=view.getUint32(at),kind=String.fromCharCode(...bytes.subarray(at+4,at+8));if(at+length+12>bytes.length)break;if(['acTL','fcTL','fdAT'].includes(kind))throw new Error('Animated PNG requires a different representation; HTML will not silently keep only one frame.');if(kind==='IDAT')image=true;at+=length+12;if(kind==='IEND'){end=length===0;break;}}
    if(image&&end&&at===bytes.length)return {width:view.getUint32(16),height:view.getUint32(20)};
    throw new Error('The PNG chunks are incomplete or have unexpected trailing bytes.');
  }
  if(mime==='image/jpeg'&&bytes[0]===255&&bytes[1]===216){
    let at=2;
    while(at+4<=bytes.length){
      if(bytes[at++]!==255)break;while(bytes[at]===255)at++;
      const marker=bytes[at++]!;if(marker===0xda||marker===0xd9)break;
      const length=view.getUint16(at);if(length<2||at+length>bytes.length)break;
      if([0xc0,0xc1,0xc2].includes(marker)&&length>=8)return {width:view.getUint16(at+5),height:view.getUint16(at+3)};
      at+=length;
    }
  }
  if(mime==='image/webp'&&bytes.length>=30&&String.fromCharCode(...bytes.subarray(0,4))==='RIFF'&&view.getUint32(4,true)+8===bytes.length&&String.fromCharCode(...bytes.subarray(8,12))==='WEBP'){
    const kind=String.fromCharCode(...bytes.subarray(12,16));
    if(kind==='VP8X'&&!(bytes[20]!&2))return {width:1+bytes[24]!+(bytes[25]!<<8)+(bytes[26]!<<16),height:1+bytes[27]!+(bytes[28]!<<8)+(bytes[29]!<<16)};
    if(kind==='VP8 '&&bytes[23]===157&&bytes[24]===1&&bytes[25]===42)return {width:view.getUint16(26,true)&16383,height:view.getUint16(28,true)&16383};
    if(kind==='VP8L'&&bytes[20]===47){const n=view.getUint32(21,true);return {width:1+(n&16383),height:1+((n>>>14)&16383)};}
  }
  throw new Error('Use a supported still PNG, JPEG or WebP original for HTML export.');
}
export function checkedPixels(size:{width:number;height:number}):number{
  const pixels=size.width*size.height;
  if(!Number.isSafeInteger(pixels)||size.width<1||size.height<1||size.width>16384||size.height>16384||pixels>HTML_LIMITS.pixels)throw new Error('This image exceeds the experimental HTML decode limit (16 megapixels).');
  return pixels;
}
let rasterQueue:Promise<unknown>=Promise.resolve();
/** Preview restarts and exports share a slot, held until unabortable browser work actually settles. */
export function sanitizedRaster(blob:Blob,size:{width:number;height:number},signal?:AbortSignal):Promise<Blob>{
  const operation=rasterQueue.then(()=>sanitize(blob,size,signal));
  rasterQueue=operation.catch(()=>{});return operation;
}
async function sanitize(blob:Blob,size:{width:number;height:number},signal?:AbortSignal):Promise<Blob>{
  signal?.throwIfAborted();
  // Browser decoding honors EXIF orientation; the PNG contains only that visible raster.
  const image=await createImageBitmap(blob);
  try{
    signal?.throwIfAborted();checkedPixels(image);
    if(!((image.width===size.width&&image.height===size.height)||(image.width===size.height&&image.height===size.width)))throw new Error('The decoded image dimensions differ from its header.');
    const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;
    try{
      const context=canvas.getContext('2d');if(!context)throw new Error('Image privacy sanitation is unavailable.');context.drawImage(image,0,0);
      const png=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(new Error('Image privacy sanitation failed.')),'image/png'));
      signal?.throwIfAborted();return png;
    }finally{canvas.width=canvas.height=0;}
  }finally{image.close();}
}

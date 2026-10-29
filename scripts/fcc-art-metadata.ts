import {createHash} from 'node:crypto';
import {artRefSchema,normalizeArtCategory,resolveArtRights,type ArtCollection} from '../packages/core/src/trip/art-ref.ts';

type Rights='approved'|'unknown'|'restricted';
interface SourceArt {
 cityId:string;countryCode:string;sourceId:string;label:string;category:string;collection:ArtCollection;
 thumbnailUrl:string;renditionUrl:string;originalUrl?:string;width:number;height:number;mimeType:'image/png'|'image/jpeg'|'image/webp'|'image/avif';
 hash?:string;snapshotDate:string;version?:string;variant?:string;role?:string;depictedPlace?:string;credit?:string;rightsStatus?:Rights;crop?:readonly number[];
}
export function createArtRef(input:SourceArt,pack:{credit?:string;rightsStatus?:Rights}){
 const classification=normalizeArtCategory(input.category,input.collection),policy=resolveArtRights(pack,input);
 const role=classification.kind==='apparel-mockup'?(input.variant==='brush'?'apparel-brush':input.variant==='mono'?'apparel-map-mono':input.variant==='color'?'apparel-map-color':undefined):input.role;
 const body={...classification,label:input.label,originCityId:input.cityId,countryCode:input.countryCode,thumbnailUrl:input.thumbnailUrl,renditionUrl:input.renditionUrl,...(input.originalUrl?{originalUrl:input.originalUrl}:{}),width:input.width,height:input.height,mimeType:input.mimeType,...(input.hash?{hash:input.hash}:{}),...policy,geographicScope:'city',...(role?{role}:{}),...(classification.kind==='apparel-mockup'&&input.variant?{variant:input.variant}:{}),...(input.depictedPlace?{depictedPlace:input.depictedPlace}:{}),source:{provider:'fcc',sourceId:input.sourceId,canonicalUrl:`https://foreignclubberscorespondence.web.app/${input.cityId}.html?section=journal`,cityId:input.cityId,countryCode:input.countryCode,kind:'artwork',retrievedAt:input.snapshotDate,...(input.version?{version:input.version}:{}),...(input.hash?{contentHash:input.hash}:{}),origin:'artwork'}};
 const digest=createHash('sha256').update(JSON.stringify({...body,...(input.crop?{crop:input.crop}:{})})).digest('hex').slice(0,24);
 return artRefSchema.parse({assetId:`fcc:${input.cityId}:ar1:${digest}`,...body});
}

/** Only short public-collection headers are read; gallery originals are never bulk-downloaded. */
export function readRasterHeader(bytes:Uint8Array){
 const b=Buffer.from(bytes.buffer,bytes.byteOffset,bytes.byteLength);let width=0,height=0,mimeType:'image/png'|'image/webp';
 if(b.length>=24&&b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))&&b.toString('ascii',12,16)==='IHDR'&&b.readUInt32BE(8)===13){width=b.readUInt32BE(16);height=b.readUInt32BE(20);mimeType='image/png';}
 else if(b.length>=30&&b.toString('ascii',0,4)==='RIFF'&&b.toString('ascii',8,12)==='WEBP'){
  const format=b.toString('ascii',12,16);mimeType='image/webp';
  if(format==='VP8X'){width=1+b.readUIntLE(24,3);height=1+b.readUIntLE(27,3);}
  else if(format==='VP8 '&&b[23]===0x9d&&b[24]===1&&b[25]===0x2a){width=b.readUInt16LE(26)&0x3fff;height=b.readUInt16LE(28)&0x3fff;}
  else if(format==='VP8L'&&b[20]===0x2f){width=1+(b[21]!|((b[22]!&63)<<8));height=1+((b[22]!>>6)|(b[23]!<<2)|((b[24]!&15)<<10));}
 }else throw Error('Unsupported source raster header');
 if(!width||!height||!Number.isSafeInteger(width*height))throw Error('Invalid source raster dimensions');
 return{width,height,mimeType};
}

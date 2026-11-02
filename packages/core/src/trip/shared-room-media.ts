import {z} from 'zod';
import {Unzlib,zlibSync} from 'fflate';
import {sha256Hex} from './sha256.ts';
import type {RoomMember} from './shared-room-domain.ts';

const MiB=1024*1024,id=z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/);
export const roomSharedMediaSchema=z.object({id,hash:z.string().regex(/^[a-f0-9]{64}$/),mime:z.literal('image/png'),width:z.number().int().min(1).max(8192),height:z.number().int().min(1).max(8192),bytes:z.number().int().positive().max(10*MiB),caption:z.string().max(1000).optional(),credit:z.string().max(1000).optional(),rightsStatus:z.enum(['approved','unknown','restricted']).optional()}).strict();
export type RoomSharedMedia=z.infer<typeof roomSharedMediaSchema>;
const publicationSchema=z.object({roomId:id,assetId:id,scope:z.enum(['shared','private']),personalOnly:z.boolean(),privateAncestor:z.boolean(),credit:z.string().max(1000).optional(),rightsStatus:z.enum(['approved','unknown','restricted']).optional()}).strict();
/** Service-derived authority and reserved staging record. Never deserialize this from upload input. */
export interface RoomMediaContext {
 roomId:string;uid:string;ownerUid:string;closed:boolean;member:RoomMember;membershipEpoch:number;now:number;
 stage:{id:string;roomId:string;uid:string;membershipEpoch:number;assetId:string;createdAt:number;expiresAt:number;sourceHash:string;sourceBytes:number};
 publication:{roomId:string;assetId:string;scope:'shared'|'private';personalOnly:boolean;privateAncestor:boolean;credit?:string;rightsStatus?:'approved'|'unknown'|'restricted'};
 usage:{referencedObjects:number;snapshotBytes:number;stagedObjects:number;stagedBytes:number;activeUploads:number};
}
const crc32=(bytes:Uint8Array)=>{let crc=0xffffffff;for(const b of bytes){crc^=b;for(let k=0;k<8;k++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return(crc^0xffffffff)>>>0;};
function chunk(type:string,data:Uint8Array){const out=new Uint8Array(data.length+12),v=new DataView(out.buffer);v.setUint32(0,data.length);out.set(new TextEncoder().encode(type),4);out.set(data,8);v.setUint32(out.length-4,crc32(out.subarray(4,out.length-4)));return out;}
function join(parts:Uint8Array[]){const out=new Uint8Array(parts.reduce((n,p)=>n+p.length,0));let at=0;for(const p of parts){out.set(p,at);at+=p.length;}return out;}
const signature=new Uint8Array([137,80,78,71,13,10,26,10]);
function sanitizePng(bytes:Uint8Array){
 if(bytes.length<45||!signature.every((b,i)=>bytes[i]===b))throw Error('Room uploads require a supported sanitized PNG representation');
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),compressed:Uint8Array[]=[];
 let at=8,header:Uint8Array|undefined,width=0,height=0,channels=0,ended=false,dataStarted=false,dataEnded=false;
 while(at+12<=bytes.length){
  const size=view.getUint32(at),end=at+size+12;if(end>bytes.length)throw Error('Incomplete PNG');
  const name=String.fromCharCode(...bytes.subarray(at+4,at+8)),data=bytes.subarray(at+8,end-4);
  if(!/^[A-Za-z]{4}$/.test(name)||view.getUint32(end-4)!==crc32(bytes.subarray(at+4,end-4)))throw Error('PNG integrity failure');
  if(!header&&name!=='IHDR')throw Error('PNG header must be first');
  if(name==='IHDR'){
   if(header||size!==13)throw Error('Invalid PNG header');header=data.slice();const h=new DataView(header.buffer);
   width=h.getUint32(0);height=h.getUint32(4);channels=header[9]===6?4:header[9]===2?3:0;
   if(width<1||height<1||width>8192||height>8192||width*height>16777216||header[8]!==8||!channels||header[10]!==0||header[11]!==0||header[12]!==0)throw Error('Unsupported PNG dimensions or representation');
  }else if(name==='IDAT'){
   if(dataEnded)throw Error('Noncontiguous PNG image data');dataStarted=true;compressed.push(data);
  }else if(name==='IEND'){
   if(size!==0||!dataStarted||end!==bytes.length)throw Error('PNG end or trailing bytes invalid');ended=true;at=end;break;
  }else{
   if(dataStarted)dataEnded=true;
   if(['acTL','fcTL','fdAT'].includes(name)||name==='tRNS'||name[0]===name[0]!.toUpperCase())throw Error('Unsupported PNG chunk');
   // All other ancillary chunks are deliberately discarded, including EXIF/text/profiles.
  }
  at=end;
 }
 if(!header||!ended||at!==bytes.length)throw Error('Incomplete PNG');
 const encoded=join(compressed),stride=width*channels+1,expected=stride*height,pixels=new Uint8Array(expected);let written=0;
 // Small compressed chunks bound each decoder emission; refuse excess before copying.
 const decoder=new Unzlib(data=>{if(written+data.length>expected)throw Error('PNG decoded size exceeds declared pixels');pixels.set(data,written);written+=data.length;});
 for(let p=0;p<encoded.length;p+=1024)decoder.push(encoded.subarray(p,p+1024),p+1024>=encoded.length);
 if(written!==expected)throw Error('PNG decoded size does not match dimensions');
 let adlerA=1,adlerB=0;for(const byte of pixels){adlerA=(adlerA+byte)%65521;adlerB=(adlerB+adlerA)%65521;}
 if(encoded.length<6||new DataView(encoded.buffer,encoded.byteOffset,encoded.byteLength).getUint32(encoded.length-4)!==((adlerB<<16)|adlerA)>>>0)throw Error('PNG zlib checksum mismatch');
 for(let row=0;row<height;row++)if(pixels[row*stride]!>4)throw Error('Invalid PNG scanline filter');
 // Recompress only validated scanlines: ancillary data and trailing compressed payload do not survive.
 return{width,height,bytes:join([signature,chunk('IHDR',header),chunk('IDAT',zlibSync(pixels)),chunk('IEND',new Uint8Array())])};
}
/** Validate actual staged bytes. Caller must recheck current authority/quotas inside final atomic commit. */
export async function sanitizeRoomMediaUpload(c:RoomMediaContext,input:Uint8Array,caption?:string):Promise<{asset:RoomSharedMedia;bytes:Uint8Array}>{
 const m=c.member,s=c.stage,p=publicationSchema.parse(c.publication),u=c.usage;
 id.parse(c.roomId);id.parse(c.uid);id.parse(s.id);id.parse(s.assetId);
 if(c.closed||!m?.active||!['owner','editor'].includes(m.role)||m.role==='owner'&&c.uid!==c.ownerUid||m.epoch!==c.membershipEpoch||s.membershipEpoch!==m.epoch||s.roomId!==c.roomId||s.uid!==c.uid||p.roomId!==c.roomId||p.assetId!==s.assetId||p.scope!=='shared'||p.personalOnly!==false||p.privateAncestor!==false)throw Error('Room media unavailable');
 for(const n of [c.now,m.epoch,s.createdAt,s.expiresAt,...Object.values(u)])if(!Number.isSafeInteger(n)||n<0)throw Error('Invalid room media authority or usage');
 if(s.createdAt>c.now||s.expiresAt<=c.now||s.expiresAt-s.createdAt>3600000)throw Error('Upload staging expired');
 if(input.length<1||input.length>10*MiB||s.sourceBytes!==input.length||u.referencedObjects>=200||u.snapshotBytes>=50*MiB||u.stagedObjects<1||u.stagedObjects>2||u.stagedBytes<input.length||u.stagedBytes>20*MiB||u.activeUploads!==1)throw Error('Room media capacity reached; retain local file');
 if(await sha256Hex(input)!==s.sourceHash)throw Error('Staged media hash mismatch');
 if((p.rightsStatus==='unknown'||p.rightsStatus==='restricted')&&!p.credit?.trim())throw Error('Shared artwork requires its credit');
 const clean=sanitizePng(input),asset=roomSharedMediaSchema.parse({id:s.assetId,hash:await sha256Hex(clean.bytes),mime:'image/png',width:clean.width,height:clean.height,bytes:clean.bytes.length,...(caption!==undefined?{caption}:{}),...(p.credit!==undefined?{credit:p.credit}:{}),...(p.rightsStatus!==undefined?{rightsStatus:p.rightsStatus}:{})});
 if(u.snapshotBytes+clean.bytes.length+new TextEncoder().encode(JSON.stringify(asset)).length>50*MiB)throw Error('Room snapshot capacity reached; retain local file');
 return{asset,bytes:clean.bytes};
}

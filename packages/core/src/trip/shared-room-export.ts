import {z} from 'zod';
import {sharedRoomCardSchema} from './shared-room-domain.ts';
import {roomSharedMediaSchema} from './shared-room-media.ts';
import {roomPublicCitationSchema} from './shared-room-source.ts';
import {tripMetaSchema,tripCardSchema} from './schema.ts';
import {createTrip,tripParts,writeCard,writeAsset} from './model.ts';
import {exportTripPackage,sha256Hex} from './package.ts';
import {measureRoomSnapshot} from './shared-room-limits.ts';
const id=z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/),integer=z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const member=z.object({role:z.enum(['owner','editor','viewer','respondent']),epoch:integer,active:z.boolean()}).strict();
const contextSchema=z.object({roomId:id,uid:id,ownerUid:id,member,schemaMajor:z.literal(1),closed:z.boolean()}).strict();
const metadataSchema=z.object({id,title:tripMetaSchema.shape.title,schemaMajor:z.literal(1),city:tripMetaSchema.shape.city.optional(),cityId:tripMetaSchema.shape.cityId,countryCode:tripMetaSchema.shape.countryCode,timeZone:tripMetaSchema.shape.timeZone.optional(),dates:tripMetaSchema.shape.dates,kind:tripMetaSchema.shape.kind.optional()}).strict();
const cardSchema=sharedRoomCardSchema.safeExtend({source:roomPublicCitationSchema.optional()});
const assetSchema=roomSharedMediaSchema.extend({source:roomPublicCitationSchema.optional()});
const snapshotSchema=z.object({metadata:metadataSchema,cards:z.array(z.object({version:integer,authorUid:id,updatedAt:integer,payload:cardSchema}).strict()).max(500),presentations:z.array(z.never()).max(0),assets:z.array(assetSchema).max(200)}).strict();
/** Fresh current-owner authorized snapshot only; adapter rechecks authority around byte IO. Downloads grant no room authority. */
export async function exportRoomPublicPackage(rawContext:unknown,rawSnapshot:unknown,assetBytes:ReadonlyMap<string,Uint8Array>):Promise<Uint8Array>{
 const context=contextSchema.parse(rawContext),snapshot=snapshotSchema.parse(rawSnapshot);
 if(context.closed||context.uid!==context.ownerUid||!context.member.active||context.member.role!=='owner'||snapshot.metadata.id!==context.roomId)throw Error('Room export unavailable');
 const ids=snapshot.cards.map(card=>card.payload.id);if(new Set(ids).size!==ids.length)throw Error('Duplicate shared card identity');
 const referenced=new Set(snapshot.cards.flatMap(card=>card.payload.assetIds)),assets=new Map(snapshot.assets.map(asset=>[asset.id,asset]));
 if(assets.size!==snapshot.assets.length||assets.size!==referenced.size||assetBytes.size!==referenced.size)throw Error('Room export media closure mismatch');
 const bytes=new Map<string,Uint8Array>();
 for(const assetId of referenced){
  const asset=assets.get(assetId),data=assetBytes.get(assetId);if(!asset||!data||data.length!==asset.bytes||await sha256Hex(data)!==asset.hash)throw Error('Room export media identity mismatch');
  // This is a consistency fence over previously sanitized service bytes, not a second upload decoder.
  if(data.length<45||![137,80,78,71,13,10,26,10].every((byte,index)=>data[index]===byte))throw Error('Room export requires sanitized PNG bytes');
  const view=new DataView(data.buffer,data.byteOffset,data.byteLength);if(view.getUint32(16)!==asset.width||view.getUint32(20)!==asset.height||asset.width*asset.height>16777216)throw Error('Room export media dimensions differ');
  let at=8;while(at+12<=data.length){const end=at+view.getUint32(at)+12,type=String.fromCharCode(...data.subarray(at+4,at+8));if(end>data.length||!['IHDR','IDAT','IEND'].includes(type))throw Error('Room export media is not the sanitized variant');at=end;}if(at!==data.length)throw Error('Incomplete room export media');
  bytes.set(assetId,data.slice());
 }
 measureRoomSnapshot(snapshot,snapshot.assets.map(asset=>({assetId:asset.id,hash:asset.hash,bytes:asset.bytes})));
 const meta=snapshot.metadata,doc=createTrip({title:meta.title,city:meta.city??'Unspecified destination',timeZone:meta.timeZone??null,cityId:meta.cityId,countryCode:meta.countryCode,dates:meta.dates,kind:meta.kind});
 try{
  const parts=tripParts(doc);
  doc.transact(()=>{
   for(const record of snapshot.cards)writeCard(parts,tripCardSchema.parse({...record.payload,scope:'guide',createdBy:record.authorUid,updatedAt:new Date(record.updatedAt).toISOString()}));
   for(const asset of snapshot.assets){const{bytes:omitted,...publicAsset}=asset;writeAsset(parts,{...publicAsset,role:'original'});}
  });
  return await exportTripPackage(doc,bytes,{variant:'guide'});
 }finally{doc.destroy();}
}

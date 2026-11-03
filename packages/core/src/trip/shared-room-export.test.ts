import {expect,it} from 'vitest';
import {zlibSync,unzipSync} from 'fflate';
import {exportRoomPublicPackage} from './shared-room-export';
import {sanitizeRoomMediaUpload,type RoomMediaContext} from './shared-room-media';
import {sha256Hex} from './sha256';
import {importTripPackage} from './import';
import {readAllCards,readAsset,readTripMeta,tripParts} from './model';
const crc=(b:Uint8Array)=>{let c=0xffffffff;for(const v of b){c^=v;for(let j=0;j<8;j++)c=(c>>>1)^((c&1)?0xedb88320:0);}return(c^0xffffffff)>>>0;};
function chunk(name:string,data:Uint8Array){const bytes=new Uint8Array(data.length+12),view=new DataView(bytes.buffer);view.setUint32(0,data.length);bytes.set(new TextEncoder().encode(name),4);bytes.set(data,8);view.setUint32(bytes.length-4,crc(bytes.subarray(4,bytes.length-4)));return bytes;}
async function fixture(){
 const header=new Uint8Array([0,0,0,1,0,0,0,1,8,6,0,0,0]),bytes=new Uint8Array([137,80,78,71,13,10,26,10,...chunk('IHDR',header),...chunk('IDAT',zlibSync(new Uint8Array([0,20,40,60,255]))),...chunk('IEND',new Uint8Array())]);
 const context={roomId:'room',uid:'owner',ownerUid:'owner',schemaMajor:1,closed:false,member:{role:'owner' as const,epoch:1,active:true}};
 const media:RoomMediaContext={...context,membershipEpoch:1,now:1000,stage:{id:'stage',roomId:'room',uid:'owner',membershipEpoch:1,assetId:'image',createdAt:0,expiresAt:3600000,sourceHash:await sha256Hex(bytes),sourceBytes:bytes.length},publication:{roomId:'room',assetId:'image',scope:'shared',personalOnly:false,privateAncestor:false,credit:'Synthetic photographer',rightsStatus:'approved'},usage:{referencedObjects:0,snapshotBytes:0,stagedObjects:1,stagedBytes:bytes.length,activeUploads:1}};
 const clean=await sanitizeRoomMediaUpload(media,bytes,'ROOM-CAPTION-TAIL');
 const snapshot={metadata:{id:'room',title:'Shared Aspen',schemaMajor:1,city:'Aspen',cityId:'aspen',countryCode:'US',timeZone:'America/Denver',kind:'traveler' as const},cards:[{version:2,authorUid:'owner',updatedAt:1900000000000,payload:{id:'shared-photo',kind:'photo' as const,title:'Shared photo',body:'Complete shared body tail',stage:'remember' as const,provenance:'traveler' as const,assetIds:['image'],x:123,y:456,boardWidth:1200,boardHeight:900,boardStack:4}}],presentations:[],assets:[clean.asset]};
 return{context,snapshot,assetBytes:new Map([['image',clean.bytes]])};
}
it('uses the normal native package/import path, preserving shared identity, geometry, caption, credit and exact sanitized bytes',async()=>{
 const f=await fixture(),before=structuredClone(f.snapshot),zip=await exportRoomPublicPackage(f.context,f.snapshot,f.assetBytes),restored=await importTripPackage(zip);try{
  const meta=readTripMeta(restored.doc),cards=readAllCards(tripParts(restored.doc));expect(meta.boardId).not.toBe('room');expect(meta).toMatchObject({title:'Shared Aspen',city:'Aspen',timeZone:'America/Denver'});expect(cards).toHaveLength(1);expect(cards[0]).toMatchObject({...f.snapshot.cards[0]!.payload,scope:'guide',createdBy:'owner'});expect(readAsset(tripParts(restored.doc),'image')).toMatchObject({hash:f.snapshot.assets[0]!.hash,caption:'ROOM-CAPTION-TAIL',credit:'Synthetic photographer'});expect(restored.assets.get('image')).toEqual(f.assetBytes.get('image'));expect(f.snapshot).toEqual(before);
  const files=unzipSync(zip),text=Object.values(files).map(b=>new TextDecoder().decode(b)).join('');expect(text).not.toContain('room-admission');expect(meta).not.toHaveProperty('lineage');expect(meta).not.toHaveProperty('groupWorkspace');
 }finally{restored.doc.destroy();}
});
it('refuses non-owner, closed, mismatched identity and unsupported schema before exporting',async()=>{const f=await fixture();for(const patch of [{uid:'editor'},{closed:true},{roomId:'other'},{schemaMajor:2},{member:{role:'owner' as const,epoch:1,active:false}},{member:{role:'editor' as const,epoch:1,active:true}}])await expect(exportRoomPublicPackage({...f.context,...patch},f.snapshot,f.assetBytes)).rejects.toThrow();});
it('rejects private/unknown fields, unsupported presentations and broken or extra media closure without mutating the input',async()=>{
 const f=await fixture();for(const snapshot of [{...f.snapshot,claims:['PRIVATE-CANARY']},{...f.snapshot,metadata:{...f.snapshot.metadata,travelerNote:'PRIVATE-CANARY'}},{...f.snapshot,cards:[{...f.snapshot.cards[0],payload:{...f.snapshot.cards[0]!.payload,sourceText:'PRIVATE-CANARY'}}]},{...f.snapshot,presentations:[{id:'unimplemented'}]},{...f.snapshot,assets:[]},{...f.snapshot,assets:[f.snapshot.assets[0],f.snapshot.assets[0]]}])await expect(exportRoomPublicPackage(f.context,snapshot,f.assetBytes)).rejects.toThrow();
 await expect(exportRoomPublicPackage(f.context,f.snapshot,new Map())).rejects.toThrow();await expect(exportRoomPublicPackage(f.context,f.snapshot,new Map([['image',new Uint8Array([1,2,3])]]))).rejects.toThrow();await expect(exportRoomPublicPackage(f.context,f.snapshot,new Map([...f.assetBytes,['PRIVATE-CANARY',new Uint8Array([0])]]))).rejects.toThrow();
});
it('preserves only approved public source citations and rejects private source attributes',async()=>{
 const f=await fixture(),source={provider:'fcc' as const,id:'public-art',canonicalUrl:'https://foreignclubberscorespondence.web.app/art',retrievedAt:'2026-11-03T00:00:00Z',version:'published-v1'},snapshot={...f.snapshot,cards:[{...f.snapshot.cards[0]!,payload:{...f.snapshot.cards[0]!.payload,source}}],assets:[{...f.snapshot.assets[0]!,source}]};
 const restored=await importTripPackage(await exportRoomPublicPackage(f.context,snapshot,f.assetBytes));try{expect(readAllCards(tripParts(restored.doc))[0]!.source).toEqual(source);expect(readAsset(tripParts(restored.doc),'image')!.source).toEqual(source);}finally{restored.doc.destroy();}
 await expect(exportRoomPublicPackage(f.context,{...snapshot,assets:[{...snapshot.assets[0],source:{...source,contentHash:'PRIVATE-HASH'}}]},f.assetBytes)).rejects.toThrow();
});
it('rejects inconsistent media dimensions and non-sanitized metadata despite an otherwise matching recorded hash',async()=>{
 const f=await fixture();await expect(exportRoomPublicPackage(f.context,{...f.snapshot,assets:[{...f.snapshot.assets[0],width:2}]},f.assetBytes)).rejects.toThrow();
 const bytes=f.assetBytes.get('image')!,withMetadata=new Uint8Array([...bytes.subarray(0,33),...chunk('tEXt',new TextEncoder().encode('PRIVATE-METADATA-CANARY')),...bytes.subarray(33)]),asset={...f.snapshot.assets[0]!,bytes:withMetadata.length,hash:await sha256Hex(withMetadata)};
 await expect(exportRoomPublicPackage(f.context,{...f.snapshot,assets:[asset]},new Map([['image',withMetadata]]))).rejects.toThrow();
});

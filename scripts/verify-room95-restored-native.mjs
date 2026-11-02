import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {importTripPackage} from '../packages/core/src/trip/import.ts';
import {tripParts,readAllCards,readAsset,readTripMeta} from '../packages/core/src/trip/model.ts';
import {sha256Hex} from '../packages/core/src/trip/sha256.ts';
const [input,output]=process.argv.slice(2);if(!input||!output)throw Error('Explicit synthetic backup and receipt paths required');
const bytes=new Uint8Array(await readFile(input)),restored=await importTripPackage(bytes);
try{
 const parts=tripParts(restored.doc),cards=readAllCards(parts),card=cards.find(c=>c.title==='Shared recovery note');
 assert.equal(cards.length,4);assert(card);assert.equal(card.body,'OWNER-LATER-EDIT · MUST-SURVIVE-STALE-UNDO');assert.equal(card.assetIds.length,1);
 assert(!JSON.stringify(restored.doc.toJSON()).includes('PRIVATE-ROOM95-CANARY'));
 const asset=readAsset(parts,card.assetIds[0]),image=restored.assets.get(card.assetIds[0]);assert(asset&&image);
 assert.equal(asset.caption,'BLUE-ORIGINAL-CAPTION · CAPTION-TAIL-95');assert.equal(asset.credit,'Synthetic fixture — local proof');
 assert.notEqual(asset.id,'ec0f8a29-c0fd-4ae5-a6c6-c8feada246db');assert.notEqual(asset.id,'295f2961-c921-4d14-8a51-8b3e988a4e86');
 assert.equal(new DataView(image.buffer,image.byteOffset,image.byteLength).getUint32(16),320);assert.equal(new DataView(image.buffer,image.byteOffset,image.byteLength).getUint32(20),240);
 const receipt={syntheticOnly:true,normalImporter:true,zipSha256:await sha256Hex(bytes),zipBytes:bytes.length,newBoardId:readTripMeta(restored.doc).boardId,cardCount:cards.length,privateCanaryAbsent:true,body:card.body,assetId:asset.id,caption:asset.caption,credit:asset.credit,imageSha256:await sha256Hex(image),imageBytes:image.length,width:320,height:240,freshImageIdentity:true};
 await writeFile(output,JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify(receipt));
}finally{restored.doc.destroy();}

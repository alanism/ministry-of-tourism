// A derived QA package, never an edit of the caller's original trip.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {buildMagazine,exportTripPackage,importTripPackage,readAllCards,readAsset,readPresentations,selectCityApparel,TripSession,TRIP_PACKAGE_LIMITS} from '../packages/core/src/index.ts';

const [input,output]=process.argv.slice(2);
assert(input&&output,'Pass the original Kyoto QA ZIP and a new output ZIP path.');
assert(input!==output,'Keep the original fixture intact.');
await assert.rejects(fs.access(output));
const original=new Uint8Array(await fs.readFile(input)),opened=await importTripPackage(original),session=new TripSession(opened.doc);
const sha=bytes=>createHash('sha256').update(bytes).digest('hex'),actor={kind:'human',id:'performance-qa',name:'Performance QA'};
try{
  const cards=readAllCards(session.parts),catalog=JSON.parse(await fs.readFile(new URL('../apps/web/public/artwork/fcc/kyoto/apparel.json',import.meta.url),'utf8'));
  const apparel=selectCityApparel('kyoto',catalog.items).filter(art=>art.role);
  assert.equal(apparel.length,3,'Use the actual brush, mono and colour ArtRefs.');
  const bytes=new Map(opened.assets),assets=[];
  for(const art of apparel){
    const response=await fetch(art.originalUrl??art.renditionUrl,{credentials:'omit',redirect:'error'});assert(response.ok);
    const data=new Uint8Array(await response.arrayBuffer());assert.equal(response.headers.get('content-type')?.split(';')[0],art.mimeType);
    assert(data.length>0&&data.length<=TRIP_PACKAGE_LIMITS.fileBytes);const hash=sha(data);assert.equal(hash,art.hash);
    bytes.set(art.assetId,data);assets.push({id:art.assetId,hash,mime:art.mimeType,role:'original',width:art.width,height:art.height,credit:art.credit,rightsStatus:art.rightsStatus,caption:art.label,apparel:{...art,hash}});
  }
  session.execute(actor,'trip_magazine_tee_select',{assetId:apparel.find(art=>art.role==='apparel-brush').assetId,assets});
  const urls=new Map([...bytes].map(([id,data])=>[id,`data:${readAsset(session.parts,id).mime};base64,${Buffer.from(data).toString('base64')}`]));
  const full=buildMagazine(session.doc,{assetUrls:urls,artwork:apparel,includePrivate:false});
  const portraits=readPresentations(session.parts).filter(layer=>layer.magazineRole==='portrait');assert.equal(portraits.length,2);
  session.executeAll(actor,portraits.map(layer=>({command:'trip_presentation_update',input:{id:layer.id,scope:'private'}})));
  const magazine=buildMagazine(session.doc,{assetUrls:urls,artwork:apparel,includePrivate:false});assert.equal(magazine.pages.length,12,'The canonical layout must generate exactly 12 pages. Do not truncate output.');
  const used=[...new Set(magazine.pages.flatMap(page=>page.assetIds))];assert(used.length>=10,'Keep this an art-rich issue.');assert.deepEqual(readAllCards(session.parts),cards);
  const zip=await exportTripPackage(session.doc,bytes,{includePrivate:false,variant:'stay'});await fs.writeFile(output,zip,{flag:'wx'});
  const manifest={inputSha256:sha(original),sha256:sha(zip),bytes:zip.length,fullIssuePages:full.pages.length,pages:magazine.pages.length,uniqueImages:used.length,fictionalQaTrip:true,derivation:'Two original portrait placements are private in this shared QA fixture, leaving a garment-only style page. All seven source cards and their attribution are unchanged; originals remain intact. No PDF page is removed.',sections:magazine.pages.map(page=>({folio:page.folio,section:page.section,assetIds:page.assetIds})),apparel:apparel.map(art=>({assetId:art.assetId,hash:art.hash,role:art.role})),privatePortraitsExcluded:portraits.map(layer=>layer.assetId)};
  await fs.writeFile(output+'.json',JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({pages:manifest.pages,uniqueImages:manifest.uniqueImages,fullIssuePages:manifest.fullIssuePages,bytes:manifest.bytes,sha256:manifest.sha256}));
}finally{session.destroy();opened.doc.destroy();}

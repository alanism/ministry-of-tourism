// MOT-91: fresh offline UI import, deduplicated durable blobs and atomic archive rejection.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {zipSync,unzipSync,strFromU8,strToU8}=require('fflate');
const {chromium}=require(process.env.MOT_PLAYWRIGHT_MODULE||'playwright');
const {createTripThroughDestination}=require('./mot-browser-contracts.cjs');
const fixture=process.env.MOT_PACKAGE_FIXTURE,out=process.env.MOT_EVIDENCE_DIR,origin=process.env.MOT_TEST_ORIGIN||'http://127.0.0.1:5199';assert(fixture&&out,'Set MOT_PACKAGE_FIXTURE and MOT_EVIDENCE_DIR.');fs.mkdirSync(out,{recursive:true});
const bytes=fs.readFileSync(fixture),files=unzipSync(bytes),manifest=JSON.parse(strFromU8(files['manifest.json'])),readable=JSON.parse(strFromU8(files['trip.json']));assert(manifest.assets.length>0,'Use an art-rich fixture.');
const coreUrl='/@fs/'+path.resolve(__dirname,'../packages/core/src/index.ts').replace(/\\/g,'/'),digest=bytes=>crypto.createHash('sha256').update(bytes).digest('hex'),byId=items=>[...items].sort((a,b)=>a.id.localeCompare(b.id));
const cases=[
 ['zip-slip',copy=>{copy['../canary.txt']=strToU8('must not be written');},/Unsafe path in package/],
 ['hash-mismatch',copy=>{const name=manifest.assets[0].file;copy[name]=copy[name].slice();copy[name][0]^=1;},/failed its checksum/],
 ['oversized-entry',copy=>{copy['assets/oversized']=new Uint8Array(10*1024*1024+1);},/File too large in package/],
 ['future-version',copy=>{copy['manifest.json']=strToU8(JSON.stringify({...manifest,version:999}));},/manifest is damaged or from a newer version/],
 ['unknown-manifest-field',copy=>{copy['manifest.json']=strToU8(JSON.stringify({...manifest,unexpected:true}));},/manifest is damaged or from a newer version/],
 ['unknown-readable-field',copy=>{copy['trip.json']=strToU8(JSON.stringify({...readable,unexpected:true}));},/Readable trip has unknown or unsupported schema fields/],
 ['missing-image',copy=>{delete copy[manifest.assets[0].file];},/Package is missing asset/],
 ['active-content',copy=>{copy['active.html']=strToU8('<script>throw Error("must never execute")</script>');},/Active content is not allowed/],
];
for(const [name,mutate] of cases){const copy={...files};mutate(copy);fs.writeFileSync(path.join(out,name+'.mot.zip'),zipSync(copy,{level:6}));}
async function snapshot(page){return page.evaluate(async coreUrl=>{
 await window.motTrip.persist();const core=await import(coreUrl),storage=await import('/src/trip/trip-store.ts'),media=await import('/src/trip/trip-assets.ts'),trip=await storage.openTrip(window.motTrip.probe().boardId);
 try{await trip.whenSaved();const parts=core.tripParts(trip.doc),assets=[...parts.assets.keys()].map(id=>core.readAsset(parts,id));return{meta:core.readTripMeta(trip.doc),cards:core.readAllCards(parts),presentations:core.readPresentations(parts),assets,media:await Promise.all(assets.map(async asset=>{const blob=await media.getTripBlob(asset.hash);if(!blob)throw Error('Imported original is missing');return{id:asset.id,size:blob.size,hash:await core.sha256Hex(new Uint8Array(await blob.arrayBuffer()))};})),document:[...core.encodeTrip(trip.doc)]};}finally{trip.destroy();}
 },coreUrl);}
const content=value=>({cards:byId(value.cards),presentations:byId(value.presentations.map(({boardId,...placement})=>placement)),assets:byId(value.assets),media:byId(value.media)});
async function blobInventory(page){return page.evaluate(()=>new Promise((resolve,reject)=>{const request=indexedDB.open('writers-board-blobs');request.onerror=()=>reject(request.error);request.onsuccess=()=>{const db=request.result;if(!db.objectStoreNames.contains('blobs')){db.close();resolve([]);return;}const tx=db.transaction('blobs','readonly'),keys=tx.objectStore('blobs').getAllKeys();tx.oncomplete=()=>{db.close();resolve(keys.result.sort());};tx.onerror=()=>reject(tx.error);};}));}
(async()=>{const started=Date.now(),browser=await chromium.launch({headless:true,chromiumSandbox:true});try{
 const context=await browser.newContext({viewport:{width:1440,height:1080}}),page=await context.newPage(),errors=[],posts=[];page.setDefaultTimeout(15000);page.on('pageerror',error=>errors.push(error.message));page.on('request',request=>{if(request.method()==='POST')posts.push(request.url());});
 await page.goto(origin+'/?view=trip');await createTripThroughDestination(page,{city:'San Sebastián',country:'Spain',registry:true});await page.evaluate(async coreUrl=>{await import(coreUrl);await import('/src/trip/trip-assets.ts');},coreUrl);await context.setOffline(true);
 const input=page.locator('input[type="file"][accept*=".zip"]'),copies=[];let baseline;
 for(let repeat=0;repeat<2;repeat++){
  const previousId=await page.evaluate(()=>window.motTrip.probe().boardId);await input.setInputFiles(fixture);await page.waitForFunction(previousId=>window.motTrip?.probe().boardId!==previousId,previousId);
  const imported=await snapshot(page);assert.equal(imported.meta.cityId,readable.meta.cityId);assert.deepEqual(byId(imported.cards),byId(readable.cards));assert.deepEqual(byId(imported.presentations.map(({boardId,...p})=>p)),byId(readable.presentations.map(({boardId,...p})=>p)));
  assert.deepEqual(byId(imported.media),byId(manifest.assets.map(asset=>({id:asset.id,size:asset.size,hash:asset.sha256}))));const inventory=await blobInventory(page);assert.deepEqual(inventory,[...new Set(manifest.assets.map(asset=>asset.sha256))].sort());
  if(baseline)assert.deepEqual(content(imported),content(baseline));else baseline=imported;copies.push({boardId:imported.meta.boardId,blobs:inventory.length});
 }
 assert.notEqual(copies[0].boardId,copies[1].boardId);const active=await snapshot(page),inventory=await blobInventory(page),rejected=[];
 for(const [name,_mutate,message] of cases){await input.setInputFiles(path.join(out,name+'.mot.zip'));await page.locator('.mot-toast').filter({hasText:message}).waitFor();assert.deepEqual(await snapshot(page),active,name+' changed the active document');assert.deepEqual(await blobInventory(page),inventory,name+' changed stored blobs');rejected.push({case:name,error:await page.locator('.mot-toast').innerText()});}
 for(const width of [1440,375]){await page.setViewportSize({width,height:1080});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth&&!document.querySelector('vite-error-overlay')));await page.screenshot({path:path.join(out,'rejected-unchanged-'+width+'.png')});}
 assert.deepEqual(errors,[]);assert.deepEqual(posts,[]);const result={fixtureSha256:digest(bytes),fixtureBytes:bytes.length,cleanContext:true,offline:true,preloadedShell:true,copies,fullContentAndLayoutEqual:true,selectedMediaByteIdentical:true,rejected,activeDocumentByteIdentical:true,blobInventoryUnchanged:true,limits:{perFile:10*1024*1024,total:50*1024*1024},errors,posts,elapsedMs:Date.now()-started};fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(result,null,2));process.stdout.write(JSON.stringify({imports:copies.length,blobs:inventory.length,rejected:rejected.length,errors,elapsedMs:result.elapsedMs}));
}finally{await browser.close();}})().catch(error=>{process.stderr.write(error.stack);process.exitCode=1;});

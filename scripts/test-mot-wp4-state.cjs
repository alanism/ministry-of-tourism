// WP4 native storage proof in a fresh profile. Faults affect only this synthetic context.
const {chromium}=require(process.env.MOT_PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {createTripThroughDestination}=require('./mot-browser-contracts.cjs');
const origin=process.env.MOT_TEST_ORIGIN||'http://127.0.0.1:5199',out=process.env.MOT_EVIDENCE_DIR,fixtureRoot=process.env.MOT_ART_FIXTURES;assert(out&&fixtureRoot);fs.mkdirSync(out,{recursive:true});
const art=JSON.parse(fs.readFileSync(path.join(fixtureRoot,'san-sebastian-fixture.json'),'utf8')).assets.find(a=>a.kind!=='apparel-mockup');
const coreUrl='/@fs/'+path.resolve(__dirname,'../packages/core/src/index.ts').replace(/\\/g,'/');
(async()=>{const browser=await chromium.launch({headless:true,chromiumSandbox:true});try{
 const context=await browser.newContext({viewport:{width:1440,height:1080}}),page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto(origin+'/?view=trip');await createTripThroughDestination(page,{city:'San Sebastián',country:'Spain',registry:true});await page.evaluate(()=>window.motTrip.persist());
    const migration=await page.evaluate(async()=>{
      const code=await (await fetch('/src/trip/trip-store.ts')).text();
      const coreUrl=code.match(/from\s+["']([^"']*packages\/core\/src\/index\.ts[^"']*)["']/)?.[1];
      if(!coreUrl)throw new Error('Could not find the Vite core module for migration fixture.');
      const core=await import(coreUrl),storage=await import('/src/trip/trip-store.ts');
      const raw=(name,bytes)=>new Promise((resolve,reject)=>{const req=indexedDB.open(name);req.onupgradeneeded=()=>{req.result.createObjectStore('updates',{autoIncrement:true});req.result.createObjectStore('custom');};req.onerror=()=>reject(req.error);req.onsuccess=()=>{const db=req.result,tx=db.transaction('updates',bytes?'readwrite':'readonly'),store=tx.objectStore('updates');if(bytes)store.add(bytes);const read=store.getAll();tx.oncomplete=()=>{db.close();resolve(read.result.map(value=>Array.from(value)));};tx.onerror=()=>reject(tx.error);};});
      const old=core.createTrip({title:'Legacy fictional journal',city:'bangkok',timeZone:'Asia/Bangkok',boardId:'legacy-proof'});
      new core.TripSession(old).execute({kind:'human',id:'fixture',name:'Fixture'},'trip_card_create',{kind:'note',title:'Preserved note',body:'Fictional private note',scope:'private'});
      old.getMap('tripMeta').set('schemaVersion',1);
      const original=await raw('mot-trip:legacy-proof',core.encodeTrip(old));old.destroy();
      const opened=await storage.openTrip('legacy-proof');await opened.whenSaved();
      const meta=core.readTripMeta(opened.doc);
      const untouched=JSON.stringify(original)===JSON.stringify(await raw('mot-trip:legacy-proof'));
      opened.destroy();
      const reopened=await storage.openTrip('legacy-proof');await reopened.whenSaved();const preserved=core.readAllCards(core.tripParts(reopened.doc))[0];reopened.destroy();
      const future=core.createTrip({title:'Future',city:'bangkok',timeZone:'Asia/Bangkok',boardId:'future-proof'});future.getMap('tripMeta').set('schemaVersion',999);
      const futureBytes=await raw('mot-trip:future-proof',core.encodeTrip(future));future.destroy();let rejected=false;
      try{await storage.openTrip('future-proof');}catch{rejected=true;}
      return {meta,untouched,preserved,rejected,futureUntouched:JSON.stringify(futureBytes)===JSON.stringify(await raw('mot-trip:future-proof')),databases:(await indexedDB.databases()).map(db=>db.name)};
    });
    assert.equal(migration.meta.schemaVersion,2);assert(migration.untouched);assert(migration.rejected);assert(migration.futureUntouched);assert.equal(migration.preserved.body,'Fictional private note');
    assert(migration.databases.includes('mot-trip:legacy-proof:v2'));

 await page.evaluate(async coreUrl=>{
  const core=await import(coreUrl),storage=await import('/src/trip/trip-store.ts'),sentinel=await storage.openTrip('wp4-other-board',{title:'Other board',city:'Test',timeZone:null}),session=new core.TripSession(sentinel.doc);
  session.execute({kind:'human',id:'owner',name:'Owner'},'trip_card_create',{kind:'note',title:'Other board sentinel',body:'Must remain unchanged',scope:'private'});await sentinel.whenSaved();window.__wp4Other=Array.from(core.encodeTrip(sentinel.doc));session.destroy();sentinel.destroy();
  const boardId=window.motTrip.probe().boardId,request=indexedDB.open('mot-trip:'+boardId),db=await new Promise((resolve,reject)=>{request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
  const tx=db.transaction(['updates','custom'],'readwrite');window.__wp4Hold={release:false,done:false};
  const keep=()=>{const request=tx.objectStore('updates').get(0);request.onsuccess=()=>{if(!window.__wp4Hold.release)keep();};};keep();tx.oncomplete=()=>{window.__wp4Hold.done=true;db.close();};
  const api=window.motTrip,p=api.probe();api.execute({boardId:p.boardId,revision:p.revision,ops:[{command:'trip_card_create',input:{kind:'note',title:'Pending durable write',body:'A synthetic storage proof'}}]});
  window.__wp4Saved=false;void api.persist().then(()=>{window.__wp4Saved=true;});
 },coreUrl);
 await page.getByText('Saving…',{exact:true}).first().waitFor();assert.equal(await page.evaluate(()=>window.__wp4Saved),false,'Saved settled before the real IndexedDB transaction completed');
 await page.screenshot({path:path.join(out,'saving-held.png')});await page.evaluate(()=>{window.__wp4Hold.release=true;});await page.waitForFunction(()=>window.__wp4Hold.done&&window.__wp4Saved);await page.getByText('Saved on this device',{exact:true}).first().waitFor();
 const quota=await page.evaluate(async({coreUrl,art})=>{
  const core=await import(coreUrl),media=await import('/src/trip/trip-assets.ts'),blob=await(await fetch(art.media.data)).blob(),bitmap=await createImageBitmap(blob),pixels={width:bitmap.width,height:bitmap.height};bitmap.close();
  const estimate=navigator.storage.estimate.bind(navigator.storage);navigator.storage.estimate=async()=>({quota:0,usage:0});let stored;
  try{stored=await media.storeTripBlob(blob);}finally{navigator.storage.estimate=estimate;}
  const api=window.motTrip,p=api.probe(),cardId=api.read().cards.find(c=>c.title==='Pending durable write').id;api.execute({boardId:p.boardId,revision:p.revision,ops:[{command:'trip_asset_register',input:{asset:{id:'quota-art',hash:stored.hash,mime:blob.type,role:'original',...pixels,caption:art.label,credit:'Foreign Clubbers Correspondence',rightsStatus:'unknown',source:{id:art.id,url:art.src,provider:'fcc',kind:'artwork',retrievedAt:'2026-10-30'}}}},{command:'trip_presentation_create',input:{cardId,assetId:'quota-art',x:.1,y:.1,width:.5,height:.5}}]});
  let persistRejected=false;try{await api.persist();}catch{persistRejected=true;}
  const receipt=await api.exportArtifact('zip'),bytes=new Uint8Array(await(await fetch(receipt.url)).arrayBuffer()),opened=await core.importTripPackage(bytes);
  try{return{persisted:stored.persisted,persistRejected,hash:stored.hash,recoveryHash:await core.sha256Hex(opened.assets.get('quota-art')),recoveryBytes:opened.assets.get('quota-art').length,originalBytes:blob.size,note:core.readAllCards(core.tripParts(opened.doc)).find(c=>c.title==='Pending durable write').body};}finally{opened.doc.destroy();}
 },{coreUrl,art});
 assert.equal(quota.persisted,false);assert.equal(quota.persistRejected,true);assert.equal(quota.recoveryHash,quota.hash);assert.equal(quota.recoveryBytes,quota.originalBytes);assert.equal(quota.note,'A synthetic storage proof');
 await page.getByText('In this tab only · download a ZIP backup',{exact:true}).first().waitFor();await page.screenshot({path:path.join(out,'quota-recovery.png')});
 const untouched=await page.evaluate(async coreUrl=>{const core=await import(coreUrl),storage=await import('/src/trip/trip-store.ts'),trip=await storage.openTrip('wp4-other-board');try{await trip.whenSaved();return JSON.stringify(Array.from(core.encodeTrip(trip.doc)))===JSON.stringify(window.__wp4Other);}finally{trip.destroy();}},coreUrl);assert.equal(untouched,true);
 const localStorageSafe=await page.evaluate(()=>!Object.values(localStorage).some(value=>value.includes('data:image/')));assert(localStorageSafe);assert.deepEqual(errors,[]);
 const result={syntheticMigration:migration,heldRealTransaction:true,noEarlySaved:true,quota,otherBoardUntouched:untouched,noMediaInLocalStorage:localStorageSafe,errors};fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({migrationPreserved:migration.untouched,futureRejected:migration.rejected,futureUntouched:migration.futureUntouched,noEarlySaved:true,quota,otherBoardUntouched:untouched,noMediaInLocalStorage:localStorageSafe,errors}));
}finally{await browser.close();}})().catch(error=>{console.error(error.stack);process.exitCode=1;});

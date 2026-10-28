const {chromium}=require(process.env.MOT_PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const { createTripThroughDestination } = require('./mot-browser-contracts.cjs');
const origin=process.env.MOT_TEST_ORIGIN||'http://127.0.0.1:5173';
const evidence=process.env.MOT_EVIDENCE_DIR||path.join(require('node:os').tmpdir(),'mot-content-storage-evidence');
const fixture=process.env.MOT_FCC_FEED_FIXTURE;
if(!fixture)throw new Error('Set MOT_FCC_FEED_FIXTURE to an actual generated FCC city feed.');
const feed=JSON.parse(fs.readFileSync(fixture,'utf8'));
fs.mkdirSync(evidence,{recursive:true});
(async()=>{
  const browser=await chromium.launch({headless:true,chromiumSandbox:true});
  const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  let source=JSON.stringify(feed);
  const cityName = feed.city.name.split(' / ')[0];
  await page.route('**/fcc/destinations.json', route => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ version: 1, cities: [{ id: feed.city.id, name: cityName,
      countryCode: feed.city.countryCode ?? 'ES', timeZone: feed.city.timeZone ?? null }] }),
  }));
  await page.route(`https://foreignclubberscorespondence.web.app/feeds/cities/${feed.city.id}.json`,route=>route.fulfill({status:200,headers:{'content-type':'application/json','access-control-allow-origin':'*'},body:source}));
  try{
    await page.goto(origin+'/?view=trip');
    const country = new Intl.DisplayNames(['en'], { type: 'region' }).of(feed.city.countryCode ?? 'ES');
    await createTripThroughDestination(page, { city: cityName, country, registry: true });
    await page.getByRole('button',{name:'Explore FCC',exact:true}).click();
    await page.getByRole('button',{name:'Add opening excerpt',exact:true}).first().click();
    const before=await page.evaluate(()=>window.motTrip.read().cards[0]);
    assert(before.sourceText.length>0);assert.equal(before.source.cityId,feed.city.id);
    await page.evaluate(id=>{const api=window.motTrip,p=api.probe();api.execute({boardId:p.boardId,revision:p.revision,ops:[{command:'trip_card_update',input:{id,body:'Traveler edit retained'}}]});},before.id);
    source=JSON.stringify({...feed,sourceVersion:feed.sourceVersion+'-refresh',articles:feed.articles.map((article,i)=>i?article:{...article,body:'Updated editorial snapshot'})});
    await page.getByRole('button',{name:'Refresh FCC content',exact:true}).click();
    await page.getByText('Updated editorial snapshot',{exact:true}).waitFor({state:'attached'});
    const after=await page.evaluate(()=>window.motTrip.read().cards[0]);
    assert.equal(after.body,'Traveler edit retained');assert.equal(after.sourceText,before.sourceText);assert.equal(after.source.retrievedAt,before.source.retrievedAt);
    await page.screenshot({path:path.join(evidence,'fcc-actual-source.png')});
    await context.setOffline(true);
    await page.getByRole('button',{name:'Board',exact:true}).click();
    await page.getByRole('button',{name:'Explore FCC',exact:true}).click();
    await page.getByText(/Cached issue/).waitFor();
    await context.setOffline(false);
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
    assert.deepEqual(errors,[]);
    fs.writeFileSync(path.join(evidence,'result.json'),JSON.stringify({fixture,feedCity:feed.city.id,articleCount:feed.articles.length,before,after,migration,offlineCache:true,syntheticDestinationRegistry:true,livePublishedFetch:false,errors},null,2));
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});

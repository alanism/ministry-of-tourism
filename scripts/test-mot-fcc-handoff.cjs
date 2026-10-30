// MOT-104: real public FCC reads, existing UI paths, actual downloads, clean offline reopen.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {chromium}=require(process.env.MOT_PLAYWRIGHT_MODULE||'playwright');
const {createTripThroughDestination}=require('./mot-browser-contracts.cjs');
const repo=path.resolve(__dirname,'..'),origin=process.env.MOT_TEST_ORIGIN||'http://127.0.0.1:5199',out=process.env.MOT_EVIDENCE_DIR;
assert(out,'Set MOT_EVIDENCE_DIR.');fs.mkdirSync(out,{recursive:true});
const mode=process.argv[2];assert(['live','offline'].includes(mode),'Use live, then offline.');
const coreUrl='/@fs/'+repo.replace(/\\/g,'/')+'/packages/core/src/index.ts';
const digest=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const nav=(page,name)=>page.getByRole('navigation',{name:'Trip views',exact:true}).getByRole('button',{name,exact:true}).click();
const native=page=>page.evaluate(async coreUrl=>{
 await window.motTrip.persist();const core=await import(coreUrl),store=await import('/src/trip/trip-store.ts'),media=await import('/src/trip/trip-assets.ts'),trip=await store.openTrip(window.motTrip.probe().boardId);
 try{await trip.whenSaved();const parts=core.tripParts(trip.doc),assets=[...parts.assets.keys()].map(id=>core.readAsset(parts,id)),bytes=await media.assetBytes(trip.doc,{includePrivate:true});
  return{meta:core.readTripMeta(trip.doc),cards:core.readAllCards(parts),presentations:core.readPresentations(parts),assets,media:await Promise.all([...bytes].map(async([id,data])=>({id,bytes:data.length,sha256:await core.sha256Hex(data)})))};
 }finally{trip.destroy();}
},coreUrl);
const byId=values=>[...values].sort((a,b)=>a.id.localeCompare(b.id));
const stable=snapshot=>({cards:byId(snapshot.cards),assets:byId(snapshot.assets),media:byId(snapshot.media),presentations:byId(snapshot.presentations.map(({boardId,...placement})=>placement))});
async function capture(page,label){for(const width of [1440,375]){await page.setViewportSize({width,height:1080});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth&&!document.querySelector('vite-error-overlay')));await page.screenshot({path:path.join(out,label+'-'+width+'.png')});}await page.setViewportSize({width:1440,height:1080});}
async function exported(page,format,label){
 await nav(page,'Export');const surface=page.getByRole('region',{name:'Export your trip',exact:true});await surface.getByRole('checkbox',{name:'Include private content',exact:true}).check();
 const card=surface.getByRole('article',{name:format==='zip'?'Editable package':'Magazine PDF',exact:true}),start=card.getByRole('button',{name:format==='zip'?'Export package':'Export PDF',exact:true});
 if(await start.count())await start.click();else await card.getByRole('button',{name:'Export again',exact:true}).click();
 await card.getByText(/^Download ready/).waitFor({timeout:60000});
 const receipt=JSON.parse(await card.locator('details.mot-export-agent pre').first().textContent());assert(receipt.downloadReady);assert.equal(receipt.scope,'personal');assert.equal(receipt.boardId,(await page.evaluate(()=>window.motTrip.probe())).boardId);
 const download=page.waitForEvent('download');await card.getByRole('button',{name:'Download',exact:true}).click();const file=await download,target=path.join(out,label+(format==='zip'?'.mot.zip':'.pdf'));assert.equal(file.suggestedFilename(),receipt.filename);await file.saveAs(target);
 const bytes=fs.readFileSync(target);assert.equal(bytes.length,receipt.bytes);assert.equal(digest(bytes),receipt.sha256);fs.writeFileSync(target+'.receipt.json',JSON.stringify({...receipt,localFilename:path.basename(target)},null,2));return{...receipt,localFilename:path.basename(target)};
}
(async()=>{const browser=await chromium.launch({headless:true,chromiumSandbox:true}),started=Date.now();try{
 const context=await browser.newContext({viewport:{width:1440,height:1080},acceptDownloads:true}),page=await context.newPage(),errors=[],posts=[],reads=[];page.setDefaultTimeout(15000);page.on('pageerror',error=>errors.push(error.message));page.on('request',request=>{if(request.method()==='POST')posts.push(request.url());});
 page.on('response',response=>{if(response.url().startsWith('https://foreignclubberscorespondence.web.app/'))reads.push({url:response.url(),status:response.status(),type:response.request().resourceType()});});
 if(mode==='live'){
  await page.goto(origin+'/?view=trip');await createTripThroughDestination(page,{city:'San Sebastián',country:'Spain',registry:true});
  const feedResponse=page.waitForResponse(response=>response.url()==='https://foreignclubberscorespondence.web.app/feeds/cities/san-sebastian.json'&&response.status()===200);await nav(page,'Explore FCC');const response=await feedResponse,feed=await response.json();assert.equal(feed.city.id,'san-sebastian');assert.equal(feed.city.countryCode,'ES');
  const article=feed.articles.find(article=>article.id==='feature-two');assert(article.body.length>600);
  const inspected=[];for(const story of feed.articles){const row=page.locator('.mot-fcc-item').filter({has:page.getByRole('heading',{name:story.title,exact:true})});await row.locator('summary').click();assert.equal(await row.locator('pre').textContent(),story.body);inspected.push({id:story.id,characters:story.body.length});}
  const row=page.locator('.mot-fcc-item').filter({has:page.getByRole('heading',{name:article.title,exact:true})});await row.getByRole('button',{name:'Add opening excerpt',exact:true}).click();
  await page.getByRole('button',{name:'FCC Almanac',exact:true}).click();await page.locator('.mot-almanac-dates').waitFor();assert((await page.locator('.mot-almanac-dates').innerText()).includes('Prices seen'));await page.getByRole('button',{name:'Close Almanac',exact:true}).click();
  await nav(page,'Board');await page.getByRole('button',{name:article.title,exact:true}).click();const details=page.getByRole('dialog',{name:/Card details/});assert((await details.getByRole('region',{name:'Source text',exact:true}).innerText()).includes(article.body));
  const travelerNote='MOT-104 personal handoff note: read the complete FCC story before choosing a hotel. This is my note, separate from the saved issue.';
  await details.getByRole('textbox',{name:'Your note',exact:true}).fill(travelerNote);await details.getByRole('button',{name:'Save changes',exact:true}).click();
  const chosen=[['san-sebastian','hotels'],['barcelona','objects']].map(([city,category])=>JSON.parse(fs.readFileSync(path.join(repo,'apps/web/public/artwork/fcc',city,category+'.json'),'utf8')).items[0]);
  for(const art of chosen){
   await page.locator('button[aria-label="Add"][aria-haspopup="menu"]').click();await page.getByRole('menuitem',{name:'FCC art',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Add FCC art',exact:true});await dialog.getByRole('group',{name:'Art categories',exact:true}).waitFor();
   if(art.city==='barcelona')await dialog.getByRole('button',{name:'Browse this country',exact:true}).click();
   await dialog.getByRole('group',{name:'Art categories',exact:true}).getByRole('button',{name:new RegExp('^'+(art.subject==='hotels'?'Hotels':'Objects')+' ')}).click();
   if(art.city==='barcelona')await dialog.getByRole('searchbox',{name:'Search country artwork',exact:true}).fill(art.label);
   await dialog.getByRole('button',{name:'Preview '+art.label+(art.city==='barcelona'?' from Barcelona':''),exact:true}).click();await dialog.locator('.art-original-preview img').waitFor();
   assert(!reads.some(read=>read.url===art.original),'Original fetched before Add');if(art.city==='barcelona'){assert((await dialog.innerText()).includes('From Barcelona'));await capture(page,'country-origin');}
   await dialog.getByRole('button',{name:'Add to board',exact:true}).click();await dialog.waitFor({state:'hidden',timeout:35000});
  }
  // Preview-only tee pages are live content until the existing choice action keeps their originals.
  await nav(page,'Keepsakes');await page.getByRole('checkbox',{name:'Include private notes and artwork in this preview',exact:true}).check();const tees=page.locator('[aria-label="Choose the tee in your issue"]');await tees.getByRole('button').first().click();await page.getByRole('button',{name:'Cancel tee selection',exact:true}).waitFor({state:'hidden'});
  const snapshot=await native(page),savedCard=snapshot.cards.find(card=>card.source?.sourceId===article.id);assert(savedCard);assert.equal(savedCard.sourceText,article.body);assert.equal(savedCard.source.contentHash,digest(Buffer.from(article.body)));assert.equal(savedCard.travelerNote,travelerNote);assert.equal(savedCard.source.canonicalUrl,article.canonicalUrl);assert.equal(savedCard.source.version,feed.sourceVersion);assert.equal(snapshot.assets.length,5);assert.equal(snapshot.meta.magazine.apparelAssetIds.length,3);assert.equal(snapshot.presentations.length,2);
  for(const art of chosen){const asset=snapshot.assets.find(asset=>asset.source.id===art.id);assert(asset);assert.equal(asset.source.cityId,art.city);assert.equal(asset.hash,art.sourceHash);assert.equal(asset.credit,art.artRef.credit);assert.equal(snapshot.media.find(media=>media.id===asset.id).sha256,art.sourceHash);}
  await page.reload();await page.waitForFunction(()=>!!window.motTrip);assert.deepEqual(stable(await native(page)),stable(snapshot));await nav(page,'Board');await page.getByRole('button',{name:article.title,exact:true}).waitFor();await page.getByText('Saved on this device',{exact:true}).first().waitFor();await capture(page,'saved-board');
  const zip=await exported(page,'zip','San-Sebastian-FCC-handoff'),pdf=await exported(page,'pdf','San-Sebastian-FCC-proof');await capture(page,'downloads-ready');
  assert.deepEqual(errors,[]);assert.deepEqual(posts,[]);const result={city:feed.city,sourceRevision:feed.sourceVersion,feedHeaders:await response.allHeaders(),inspectedArticles:inspected,selectedArticle:{id:article.id,characters:article.body.length,sha256:digest(Buffer.from(article.body))},snapshot,downloads:{zip,pdf},savedReloadMatches:true,uninterceptedLiveFcc:true,errors,posts,reads,elapsedMs:Date.now()-started};fs.writeFileSync(path.join(out,'live-result.json'),JSON.stringify(result,null,2));process.stdout.write(JSON.stringify({mode,articlesRead:inspected.length,articleCharacters:article.body.length,assets:snapshot.assets.length,zipBytes:zip.bytes,pdfBytes:pdf.bytes,errors,elapsedMs:result.elapsedMs}));
 }else{
  const prior=JSON.parse(fs.readFileSync(path.join(out,'live-result.json'),'utf8'));await page.goto(origin+'/?view=trip');await createTripThroughDestination(page,{city:'San Sebastián',country:'Spain',registry:true});await nav(page,'Composition');await page.locator('.mot-composition[aria-busy="false"]').waitFor();await nav(page,'Export');await page.getByRole('region',{name:'Export your trip',exact:true}).waitFor();
  await page.evaluate(async coreUrl=>{await import(coreUrl);await import('/src/trip/trip-assets.ts');},coreUrl);await context.setOffline(true);const networkAtImport=reads.length,previousId=await page.evaluate(()=>window.motTrip.probe().boardId);await page.locator('input[type="file"][accept*=".zip"]').setInputFiles(path.join(out,prior.downloads.zip.localFilename));await page.waitForFunction(id=>window.motTrip?.probe().boardId!==id,previousId);
  const snapshot=await native(page);assert.notEqual(snapshot.meta.boardId,prior.snapshot.meta.boardId);assert.equal(snapshot.meta.cityId,'san-sebastian');assert.deepEqual(stable(snapshot),stable(prior.snapshot));await page.getByRole('button',{name:prior.snapshot.cards[0].title,exact:true}).waitFor();await capture(page,'offline-reopened');
  const zip=await exported(page,'zip','San-Sebastian-offline-reopened'),pdf=await exported(page,'pdf','San-Sebastian-offline-proof');assert.equal(pdf.sha256,prior.downloads.pdf.sha256);assert.equal(reads.length,networkAtImport);assert.deepEqual(errors,[]);assert.deepEqual(posts,[]);const result={offline:true,cleanContext:true,preloadedAppShell:true,fullCardsAndSnapshotsMatch:true,allSelectedBytesAndCreditsMatch:true,layoutMatches:true,newBoardIdentity:true,noFccResponsesAfterImport:true,pdfByteIdentical:true,downloads:{zip,pdf},errors,posts,elapsedMs:Date.now()-started};fs.writeFileSync(path.join(out,'offline-result.json'),JSON.stringify(result,null,2));process.stdout.write(JSON.stringify({mode,zipBytes:zip.bytes,pdfBytes:pdf.bytes,pdfByteIdentical:true,errors,elapsedMs:result.elapsedMs}));
 }
}finally{await browser.close();}})().catch(error=>{process.stderr.write(error.stack);process.exitCode=1;});

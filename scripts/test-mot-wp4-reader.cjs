// Reference-led visual/round-trip QA. Supply your own licensed city fixtures; no personal data is bundled.
const {chromium}=require(process.env.MOT_PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {checkMagazineReading,captureMagazineSpreads}=require('./mot-magazine-reading-check.cjs');
const {checkMagazineInk}=require('./mot-magazine-ink-check.cjs');
const city=process.argv[2]||'bangkok',root=process.env.MOT_EVIDENCE_DIR||path.join(require('node:os').tmpdir(),'mot-magazine-qa');
const fixtureRoot=process.env.MOT_ART_FIXTURES;
if(!fixtureRoot)throw new Error('Set MOT_ART_FIXTURES to a directory of explicit, licensed <city>-fixture.json files. See docs/MAGAZINE-QA.md.');
const fixture=JSON.parse(fs.readFileSync(path.join(fixtureRoot,`${city}-fixture.json`),'utf8'));
if(city==='san-sebastian') fixture.assets=fixture.assets.filter(a=>a.role==='postcard'||a.role==='vehicle').slice(0,2);
const directory=path.join(root,city);fs.mkdirSync(directory,{recursive:true});
const origin=process.env.MOT_TEST_ORIGIN||'http://127.0.0.1:5184';
const coreUrl='/@fs/'+path.resolve(__dirname,'..').replace(/\\/g,'/')+'/packages/core/src/index.ts';
(async()=>{
 const browser=await chromium.launch({headless:true,chromiumSandbox:true}),context=await browser.newContext({viewport:{width:1920,height:1080},acceptDownloads:true}),page=await context.newPage(),errors=[],consoleMessages=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('console',message=>{if(['error','warning','warn'].includes(message.type()))consoleMessages.push({level:message.type(),text:message.text()});});
 for(const asset of fixture.assets)await context.route(asset.src,r=>r.fulfill({contentType:asset.media.mime,headers:{'access-control-allow-origin':'*'},body:Buffer.from(asset.media.data.split(',')[1],'base64')}));
 try{
  await page.goto(origin+'/?view=trip',{waitUntil:'domcontentloaded'});
  await page.evaluate(async({fixture,coreUrl})=>{
   const core=await import(coreUrl),store=await import('/src/trip/trip-store.ts'),media=await import('/src/trip/trip-assets.ts');
   const trip=await store.openTrip(`r4-real-art-${fixture.cityId}`,{title:`${fixture.name}, our way`,city:fixture.name,cityId:fixture.cityId,countryCode:fixture.countryCode,timeZone:null,dates:{start:'2026-11-13',end:'2026-11-16'}}),session=new core.TripSession(trip.doc,{newId:(()=>{let id=0;return()=>`fixture-${String(++id).padStart(4,'0')}`;})()}),actor={kind:'human',id:'traveler-1',name:'QA owner'};
   for(const article of fixture.articles)session.execute(actor,'trip_card_create',{kind:'note',title:article.title,body:article.body.split(/\n\n/)[0],source:{id:article.id,url:article.canonicalUrl,provider:'fcc',cityId:fixture.cityId,kind:'article',retrievedAt:'2026-10-28',origin:'editorial'},scope:'stay',stage:'explore',provenance:'fcc'});
   for(const item of fixture.places)session.execute(actor,'trip_card_create',{kind:'place',title:item.name,body:'',source:{id:item.id,url:item.canonicalUrl,provider:'fcc',cityId:fixture.cityId,kind:'venue',retrievedAt:'2026-10-28',origin:'catalogue'},scope:'stay',stage:'plan',provenance:'fcc'});
   for(const note of fixture.notes??[])session.execute(actor,'trip_card_create',{kind:'note',title:note.title,body:note.body,day:note.day,scope:'stay',stage:'remember',provenance:'traveler'});
   for(const [index,art] of fixture.assets.filter(a=>a.kind!=='apparel-mockup').entries()){
    const blob=await(await fetch(art.media.data)).blob(),bitmap=await createImageBitmap(blob),saved=await media.storeTripBlob(blob);
    const asset={id:art.id,hash:saved.hash,mime:blob.type,role:'original',caption:art.label,credit:'Foreign Clubbers Correspondence',rightsStatus:'unknown',width:bitmap.width,height:bitmap.height,source:{id:art.id,url:art.src,provider:'fcc',cityId:fixture.cityId,kind:'artwork',retrievedAt:'2026-10-28',origin:'artwork'}};
    bitmap.close();session.execute(actor,'trip_asset_register',{asset});session.execute(actor,'trip_presentation_create',{assetId:art.id,magazineRole:art.role,x:.1,y:.1,width:.6,height:.6,zIndex:index,scope:'stay'});
   }
   await trip.whenSaved();session.destroy();trip.destroy();
  },{fixture,coreUrl});
  await page.reload({waitUntil:'domcontentloaded'});await page.getByRole('navigation',{name:'Trip views'}).getByRole('button',{name:'Keepsakes',exact:true}).click();
  await page.getByRole('button',{name:'Magazine',exact:true}).click();
  await page.locator('.mot-issue-paper img').first().waitFor();
  assert.equal(page.url(),origin+'/?view=trip');assert((await page.title()).includes(fixture.name));assert.equal(await page.locator('vite-error-overlay').count(),0);
  const flip=page.getByRole('button',{name:'Turn the postcard over',exact:true});
  if(await flip.count()){const before=await flip.locator('img').getAttribute('src');await flip.click();assert.equal(await flip.getAttribute('aria-pressed'),'true');assert.notEqual(await flip.locator('img').getAttribute('src'),before);await flip.click();}
  const lead=page.getByRole('button',{name:'Swap lead specimen',exact:true});
  if(await lead.count()){const revision=await page.evaluate(()=>window.motTrip.probe().revision);await lead.click();assert((await page.evaluate(()=>window.motTrip.probe().revision))>revision);await page.getByRole('button',{name:'Undo',exact:true}).click();await page.locator('.mot-issue-paper img').first().waitFor();}
  const before=await page.evaluate(()=>window.motTrip.read()),magazine=await page.evaluate(async coreUrl=>{
   const core=await import(coreUrl),store=await import('/src/trip/trip-store.ts'),delivery=await import('/src/trip/artifacts.ts'),trip=await store.openTrip(window.motTrip.probe().boardId),session=new core.TripSession(trip.doc);
   try{return await delivery.prepareMagazine(session,undefined,false);}finally{session.destroy();trip.destroy();}
  },coreUrl);
  assert(magazine.apparel.length===3,'Current published brush/mono/colour originals must validate');
  const canonical=await checkMagazineInk(page,magazine.pages);assert.deepEqual(canonical.failures,[]);assert(canonical.routeLabels>0&&canonical.protectedIntersections>0);
  const creditedPages=magazine.pages.filter(p=>p.credits.length&&['personal-cover','merch','tee-advert'].includes(p.pattern)).length;assert(creditedPages>=2);assert.equal(canonical.creditBlocks,creditedPages,'Each actual credited cover/apparel page needs its paper zone; a sparse unillustrated cover needs no empty credit');
  assert(magazine.pages.every(p=>!/[\u00e2]\u20ac/.test(p.svg)));assert(magazine.pages.some(p=>p.section==='feature'&&p.side==='right'));
  const negatives=[];for(const kind of ['route-knockout','credit-zone']){
   const fault=magazine.pages.map(p=>({...p,svg:p.svg.replace(kind==='route-knockout'?/<rect data-route-label-knockout="true"[^>]*\/>/g:/<rect data-credit-zone="true"[^>]*\/>/g,'')}));
   const result=await checkMagazineInk(page,fault);assert(result.failures.some(f=>f.reason.includes(kind==='route-knockout'?'route':'credit')));negatives.push({kind,detected:result.failures.length});
  }
  const reading=[],ink=[];
  for(const width of [1920,1280,768,375,280]){
   await page.setViewportSize({width,height:1080});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   const fitted=await checkMagazineReading(page,width,directory);if(width<=375)reading.push({width,...fitted});
   const pages=await page.locator('.mot-issue-paper img').evaluateAll(images=>images.map(image=>({id:image.alt,svg:decodeURIComponent(image.src.split(',').slice(1).join(','))})));
   const current=await checkMagazineInk(page,pages);assert.deepEqual(current.failures,[],'Shared reader ink protection at '+width);ink.push({width,...current});
   if([1920,375].includes(width))await captureMagazineSpreads(page,width,directory);
  }
  assert.deepEqual(await page.evaluate(()=>window.motTrip.read()),before);assert.deepEqual(errors,[]);assert.deepEqual(consoleMessages,[]);
  const output={city,pages:magazine.pages.length,apparel:magazine.apparel.map(a=>({role:a.role,assetId:a.assetId})),canonical,negatives,reading,ink,identity:{url:page.url(),title:await page.title()},errors,consoleMessages,fixtureRoles:'Unchanged explicit saved editorial fixtures; actual current apparel metadata/original bytes; no live editorial classification claim',pairedSpreadsPreserved:true,pdfWork:false};
  fs.writeFileSync(path.join(directory,'result.json'),JSON.stringify(output,null,2));console.log(JSON.stringify({city,pages:output.pages,canonical,negatives,phoneChecks:reading.map(r=>({width:r.width,pages:r.pages.length})),ink:ink.map(({width,failures})=>({width,failures})),errors,consoleMessages}));
 }catch(error){await page.screenshot({path:path.join(directory,'failure.png')}).catch(()=>{});throw error;}finally{await browser.close();}
})().catch(error=>{console.error(error.stack);process.exitCode=1;});

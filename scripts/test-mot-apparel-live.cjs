// Actual published FCC apparel. No image bytes or classification are replaced.
const {chromium}=require(process.env.MOT_PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {createTripThroughDestination}=require('./mot-browser-contracts.cjs');
const city=process.argv[2]||'san-sebastian',origin=process.env.MOT_TEST_ORIGIN||'http://127.0.0.1:5198';
const rows=JSON.parse(fs.readFileSync(path.join(__dirname,'../apps/web/public/fcc/destinations.json'),'utf8')).cities,row=rows.find(c=>c.id===city);
assert(row,'Use a canonical city');
const country=new Intl.DisplayNames('en',{type:'region'}).of(row.countryCode);
const out=path.join(process.env.MOT_EVIDENCE_DIR||require('node:os').tmpdir(),city);fs.mkdirSync(out,{recursive:true});
const missing=process.env.MOT_TEE_MISSING,failed=process.env.MOT_TEE_FAILED;
(async()=>{
 const browser=await chromium.launch({headless:true,chromiumSandbox:true});
 try{
  const context=await browser.newContext({viewport:{width:1440,height:1080}}),page=await context.newPage(),errors=[],consoleErrors=[],shopRequests=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')consoleErrors.push(m.text());});
  context.on('request',r=>{if(new URL(r.url()).pathname==='/shop/')shopRequests.push({url:r.url(),referer:r.headers().referer??null});});
  if(missing){
   await page.route('**/artwork/fcc/manifest.json',async route=>{const r=await route.fetch(),data=await r.json();const ref=data.catalogs.find(c=>c.city===city&&c.subject==='apparel');ref.count--;await route.fulfill({json:data});});
   await page.route('**/artwork/fcc/'+city+'/apparel.json',async route=>{const r=await route.fetch(),data=await r.json();data.items=data.items.filter(i=>i.artRef.variant!==missing);await route.fulfill({json:data});});
  }
  if(failed){const data=JSON.parse(fs.readFileSync(path.join(__dirname,'../apps/web/public/artwork/fcc',city,'apparel.json'),'utf8'));const art=data.items.find(i=>i.artRef.variant===failed).artRef;await context.route(art.originalUrl??art.renditionUrl,r=>r.abort());}
  await page.goto(origin+'/?view=trip');await createTripThroughDestination(page,{city:row.name,country,registry:true});
  await page.getByRole('button',{name:'Keepsakes',exact:true}).click();await page.getByRole('button',{name:'Magazine',exact:true}).click();await page.locator('.mot-issue-tee-choices').waitFor({timeout:25000});
  const issue=await page.evaluate(async()=>{
   await window.motTrip.persist();const code=await(await fetch('/src/trip/trip-store.ts')).text(),coreUrl=code.match(/from\s+["']([^"']*packages\/core\/src\/index\.ts[^"']*)["']/)?.[1];
   if(!coreUrl)throw Error('Core module unavailable');const core=await import(coreUrl),store=await import('/src/trip/trip-store.ts'),{prepareMagazine}=await import('/src/trip/artifacts.ts');
   const opened=await store.openTrip(window.motTrip.probe().boardId),session=new core.TripSession(opened.doc);
   try{const m=await prepareMagazine(session,undefined,false);return{cityId:m.cityId,apparel:m.apparel??[],warnings:m.warnings,pages:m.pages.map(p=>({pattern:p.pattern,section:p.section,assetIds:p.assetIds,links:p.links,svg:['merch','tee-advert'].includes(p.pattern)?p.svg:undefined}))};}finally{session.destroy();opened.destroy();}
  });
  const expected=['brush','mono','color'].filter(v=>v!==missing&&v!==failed);assert.deepEqual(issue.apparel.map(a=>a.variant),expected);
  const used=issue.pages.flatMap(p=>p.assetIds.filter(id=>issue.apparel.some(a=>a.assetId===id)));assert.equal(new Set(used).size,used.length,'Do not repeat tee photos');
  assert.equal(issue.pages[0].section,'front-cover');assert.equal(issue.pages.at(-1).section,'back-cover');
  for(const [i,p] of issue.pages.entries()){for(const link of p.links??[])assert.equal(link.url,'https://foreignclubberscorespondence.web.app/shop/?city='+city);if(p.svg){fs.writeFileSync(path.join(out,'page-'+i+'.svg'),p.svg);delete p.svg;}}
  const widths=[];for(const width of [1920,1440,1280,768,375,280]){await page.setViewportSize({width,height:1080});await page.locator('.mot-issue-tee-choices').scrollIntoViewIfNeeded();assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No horizontal overflow at '+width);if([1440,375].includes(width))await page.screenshot({path:path.join(out,'tee-choices-'+width+'.png')});widths.push(width);}
  const link=page.getByRole('link',{name:'Order on FCC →',exact:true}).first();assert.equal(await link.getAttribute('target'),'_blank');assert.match(await link.getAttribute('rel'),/noopener/);assert.match(await link.getAttribute('rel'),/noreferrer/);assert.equal(await link.getAttribute('referrerpolicy'),'no-referrer');
  let pdf;
  if(process.env.MOT_TEE_PDF){
   const waiting=page.waitForEvent('download');const receipt=await page.evaluate(async()=>{const r=await window.motTrip.exportArtifact('pdf');const a=document.createElement('a');a.href=r.url;a.download='actual-apparel.pdf';a.click();return r;});
   const download=await waiting,target=path.join(out,'actual-apparel.pdf');await download.saveAs(target);const bytes=fs.readFileSync(target),text=bytes.toString('latin1');assert.equal(bytes.length,receipt.byteCount);assert(text.startsWith('%PDF-'));assert.equal((text.match(/\/Subtype \/Link/g)||[]).length,2);assert(text.includes('/URI (https://foreignclubberscorespondence.web.app/shop/?city='+city+')'));
   pdf={bytes:bytes.length,sha256:require('node:crypto').createHash('sha256').update(bytes).digest('hex'),links:2};
  }
  let shop;
  if(!missing&&!failed){
   const waiting=context.waitForEvent('page');await link.click();const popup=await waiting;await popup.setViewportSize({width:375,height:1080});await popup.waitForFunction(()=>window.fccShop&&document.querySelector('#city-switch')?.options.length===200,undefined,{timeout:20000});
   shop=await popup.evaluate(()=>({url:location.href,selected:document.querySelector('#city-switch')?.value,available:[...document.querySelectorAll('#city-switch option')].map(o=>o.value)}));await popup.screenshot({path:path.join(out,'actual-fcc-shop-375.png')});await popup.close();assert.equal(shopRequests[0]?.referer,null);
  }
  assert.deepEqual(errors,[]);assert.equal(await page.locator('vite-error-overlay').count(),0);
  const result={actualPublishedMedia:true,missingVariant:missing??null,failedVariant:failed??null,issue,widths,pdf,shop,shopRequests,errors,consoleErrors};fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(result,null,2));
  process.stdout.write(JSON.stringify({city,variants:expected,teePages:issue.pages.filter(p=>p.pattern==='merch'||p.pattern==='tee-advert').length,shopCity:shop?.selected,shopCities:shop?.available.length,errors}));
  if(shop)assert.equal(shop.selected,city,'FCC must land on the requested city; an HTTP 200 is insufficient');
 }finally{await browser.close();}
})().catch(e=>{process.stderr.write(e.stack);process.exitCode=1;});

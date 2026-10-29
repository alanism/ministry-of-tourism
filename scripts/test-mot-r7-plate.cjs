// Sparse food-spread and route regression with explicit, licensed facade/interior fixtures.
const {chromium}=require(process.env.MOT_PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {checkMagazineReading}=require('./mot-magazine-reading-check.cjs');
const {rasterPdfPage}=require('./mot-pdf-raster.cjs');
const city=process.argv[2]||'san-sebastian',origin=process.env.MOT_TEST_ORIGIN||'http://127.0.0.1:5198';
if(!process.env.MOT_ART_FIXTURES)throw Error('Supply the licensed fixture directory from docs/MAGAZINE-QA.md');
const fixture=JSON.parse(fs.readFileSync(path.join(process.env.MOT_ART_FIXTURES,city+'-fixture.json'),'utf8'));
fixture.assets=fixture.assets.filter(a=>['facade','interior'].includes(a.role));
assert(fixture.assets.length,'The fixture needs an actual facade');
const directory=path.join(process.env.MOT_EVIDENCE_DIR||require('node:os').tmpdir(),city+'-plate');fs.mkdirSync(directory,{recursive:true});
const coreUrl='/@fs/'+path.resolve(__dirname,'..').replace(/\\/g,'/')+'/packages/core/src/index.ts';
(async()=>{const started=Date.now(),browser=await chromium.launch({headless:true,chromiumSandbox:true});try{
 const page=await browser.newPage({viewport:{width:1920,height:1080}}),errors=[],warnings=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(['error','warning'].includes(m.type()))warnings.push(m.text());});
 await page.route('**/artwork/index.json',r=>r.fulfill({contentType:'application/json',body:JSON.stringify({version:1,styles:[]})}));
 await page.goto(origin+'/?view=trip');
 await page.evaluate(async({fixture,coreUrl})=>{
  const core=await import(coreUrl),store=await import('/src/trip/trip-store.ts'),media=await import('/src/trip/trip-assets.ts');
  const trip=await store.openTrip('r7-plate-'+fixture.cityId,{title:fixture.name+', our way',city:fixture.name,cityId:fixture.cityId,countryCode:fixture.countryCode,timeZone:null}),session=new core.TripSession(trip.doc),owner={kind:'human',id:'qa',name:'QA'};
  for(const article of fixture.articles)session.execute(owner,'trip_card_create',{kind:'note',title:article.title,body:article.body.split(/\n\n/)[0],source:{id:article.id,kind:'article',provider:'fcc',retrievedAt:'2026-10-29',url:article.canonicalUrl},provenance:'fcc',scope:'stay'});
  for(const item of fixture.places)session.execute(owner,'trip_card_create',{kind:'place',title:item.name,scope:'stay'});
  for(const note of fixture.notes??[])session.execute(owner,'trip_card_create',{kind:'note',title:note.title,body:note.body,day:note.day,scope:'stay',provenance:'traveler'});
  for(const art of fixture.assets){const blob=await(await fetch(art.media.data)).blob(),saved=await media.storeTripBlob(blob),image=await createImageBitmap(blob);session.execute(owner,'trip_asset_register',{asset:{id:art.id,hash:saved.hash,mime:blob.type,role:'original',width:image.width,height:image.height,caption:art.label,credit:'Foreign Clubbers Correspondence',rightsStatus:'unknown',source:{id:art.id,kind:'artwork',provider:'fcc',cityId:fixture.cityId,retrievedAt:'2026-10-29',url:art.src}}});image.close();session.execute(owner,'trip_presentation_create',{assetId:art.id,magazineRole:art.role,scope:'stay'});}
  await trip.whenSaved();session.destroy();trip.destroy();
 },{fixture,coreUrl});
 await page.reload();await page.getByRole('navigation',{name:'Trip views'}).getByRole('button',{name:'Keepsakes',exact:true}).click();await page.locator('.mot-issue-paper img').first().waitFor();
 assert((await page.title()).includes(fixture.name));assert.equal(await page.locator('vite-error-overlay').count(),0);
 const result=await page.evaluate(async coreUrl=>{const core=await import(coreUrl),store=await import('/src/trip/trip-store.ts'),delivery=await import('/src/trip/artifacts.ts'),trip=await store.openTrip(window.motTrip.probe().boardId),session=new core.TripSession(trip.doc);try{const magazine=await delivery.prepareMagazine(session,undefined,false),bytes=await delivery.magazinePdf(magazine);let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);return{magazine,pdf:btoa(binary)};}finally{session.destroy();trip.destroy();}},coreUrl);
 const {magazine}=result,right=magazine.pages.find(p=>p.section==='plate'&&p.side==='right');assert(right);assert.deepEqual(right.sourceCardIds,[]);assert(!/Places in the notebook/.test(right.svg));
 const printed=right.svg.replace(/<style>[\s\S]*?<\/style>/g,'').replace(/<[^>]*>/g,' ');for(const p of fixture.places)if(!fixture.assets.some(a=>a.label.toLowerCase()===p.name.toLowerCase()))assert(!printed.includes(p.name),'Unrelated place on the plate: '+p.name);
 assert(printed.includes(fixture.assets.length>1?'Nº 2':'Nº 1'));assert(!printed.includes('Nº 4'));
 const pdf=path.join(directory,'issue.pdf');fs.writeFileSync(pdf,Buffer.from(result.pdf,'base64'));fs.writeFileSync(path.join(directory,'magazine.json'),JSON.stringify(magazine));
 const reading=[];for(const width of [1920,1280,768,375,280]){
  await page.setViewportSize({width,height:1080});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  if(width<=375){
   reading.push({width,...await checkMagazineReading(page,width,directory)});
   const split=await page.locator('.mot-issue-paper img').evaluateAll(images=>images.flatMap(image=>{const svg=new DOMParser().parseFromString(decodeURIComponent(image.src.split(',').slice(1).join(',')),'image/svg+xml');return [...svg.querySelectorAll('[data-route-label]')].filter(t=>(t.getAttribute('data-flow-source')??'').trim().replace(/\s+/g,' ')!==[...t.querySelectorAll('tspan')].map(s=>s.textContent).join(' ').trim().replace(/\s+/g,' ')).map(t=>t.getAttribute('data-flow-source'));}));
   assert.deepEqual(split,[],'Route labels split ordinary words at '+width);
  }
  for(const id of ['issue-plate','issue-route'])await page.locator('#'+id).screenshot({path:path.join(directory,id+'-'+width+'.png')});
 }
 const comparisons=[];for(const [index,p] of magazine.pages.entries())if(p.section==='plate'||p.section==='route'){
  const prefix=path.join(directory,'proof-'+(index+1));await rasterPdfPage(page,pdf,index+1,prefix);
  const mean=await page.evaluate(async({svg,png})=>{const load=async src=>{const i=new Image();i.src=src;await i.decode();const c=document.createElement('canvas');c.width=1184;c.height=1680;const x=c.getContext('2d');x.drawImage(i,0,0);return x.getImageData(0,0,1184,1680).data;};const a=await load('data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg)),b=await load('data:image/png;base64,'+png);let sum=0;for(let i=0;i<a.length;i+=4)for(let k=0;k<3;k++)sum+=Math.abs(a[i+k]-b[i+k]);return sum/(1184*1680*3);},{svg:p.svg,png:fs.readFileSync(prefix+'.png').toString('base64')});
  assert(mean<=4);comparisons.push({page:index+1,section:p.section,mean});
 }
 assert.deepEqual(errors,[]);const output={city,elapsedMs:Date.now()-started,pages:magazine.pages.length,facadeOrInteriorPictures:fixture.assets.map(a=>a.label),reading,comparisons,unrelatedHotelsExcluded:true,errors,warnings};fs.writeFileSync(path.join(directory,'result.json'),JSON.stringify(output,null,2));console.log(JSON.stringify({city,elapsedMs:output.elapsedMs,pages:output.pages,comparisons,errors}));
}finally{await browser.close();}})().catch(e=>{console.error(e.stack);process.exitCode=1;});

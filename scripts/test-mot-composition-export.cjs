// Reference-led visual/round-trip QA. Supply your own licensed city fixtures; no personal data is bundled.
const {chromium}=require(process.env.MOT_PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const startedAt=Date.now();
const city=process.argv[2]||'bangkok',root=process.env.MOT_EVIDENCE_DIR||path.join(require('node:os').tmpdir(),'mot-magazine-qa');
const fixtureRoot=process.env.MOT_ART_FIXTURES;
if(!fixtureRoot)throw new Error('Set MOT_ART_FIXTURES to a directory of explicit, licensed <city>-fixture.json files. See docs/MAGAZINE-QA.md.');
const fixture=JSON.parse(fs.readFileSync(path.join(fixtureRoot,`${city}-fixture.json`),'utf8'));
if(city==='san-sebastian') fixture.assets=fixture.assets.filter(a=>a.role==='postcard'||a.role==='vehicle').slice(0,2);
const directory=path.join(root,city);fs.mkdirSync(directory,{recursive:true});
const origin=process.env.MOT_TEST_ORIGIN||'http://127.0.0.1:5184',fcc='https://foreignclubberscorespondence.web.app';
const coreUrl='/@fs/'+path.resolve(__dirname,'..').replace(/\\/g,'/')+'/packages/core/src/index.ts';
const apparel=fixture.assets.filter(a=>a.kind==='apparel-mockup').map(a=>({assetId:a.id,category:'tee',kind:'apparel-mockup',originCityId:city,label:a.label,variant:a.variant,role:a.role,thumbnailUrl:a.thumb,renditionUrl:a.src,width:800,height:1000,mimeType:'image/webp',hash:a.media.hash,rightsStatus:'unknown',credit:'Foreign Clubbers Correspondence',source:{provider:'fcc',sourceId:a.id,canonicalUrl:`${fcc}/${city}.html`,cityId:city,kind:'artwork',retrievedAt:'2026-10-28',origin:'artwork'}}));
(async()=>{
 const browser=await chromium.launch({headless:true,chromiumSandbox:true}),context=await browser.newContext({viewport:{width:1920,height:1080},acceptDownloads:true}),page=await context.newPage(),errors=[],consoleMessages=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('console',message=>{if(['error','warning','warn'].includes(message.type()))consoleMessages.push({level:message.type(),text:message.text()});});
 const json=(route,value)=>route.fulfill({contentType:'application/json',body:JSON.stringify(value)});
 await context.route('**/artwork/index.json',r=>json(r,{version:1,styles:[{id:'r4',label:'Reference transport',manifest:'/artwork/r4/manifest.json'}]}));
 await context.route('**/artwork/r4/manifest.json',r=>json(r,{version:1,styleId:'r4',subjects:[{id:'apparel',label:'Apparel'}],cities:[{id:city,label:fixture.name}],catalogs:[{subject:'apparel',city,url:'/artwork/r4/tees.json',count:apparel.length}]}));
 await context.route('**/artwork/r4/tees.json',r=>json(r,{version:1,styleId:'r4',items:apparel}));
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
  await page.reload({waitUntil:'domcontentloaded'});await page.getByRole('navigation',{name:'Trip views'}).getByRole('button',{name:'Composition',exact:true}).click();
  await page.locator('[aria-label="Trip composition"]').waitFor();
  assert.equal(page.url(),origin+'/?view=trip');assert((await page.title()).includes(fixture.name));assert.equal(await page.locator('vite-error-overlay').count(),0);

  const mono=apparel.find(a=>a.variant==='mono');if(mono){await page.getByRole('navigation',{name:'Trip views'}).getByRole('button',{name:'Keepsakes',exact:true}).click();await page.getByRole('button',{name:mono.label,exact:true}).click();await page.waitForFunction(()=>[...document.querySelectorAll('.mot-issue-tee')].every(b=>!b.disabled));await page.getByRole('navigation',{name:'Trip views'}).getByRole('button',{name:'Composition',exact:true}).click();}
  await page.locator('[aria-label="Trip composition"][aria-busy="false"]').waitFor();await page.getByLabel('Spread',{exact:true}).selectOption('plate');
  const artifactResult=await page.evaluate(async()=>{const api=window.motTrip,p=api.read().presentations.find(p=>p.magazineRole==='facade'),probe=api.probe();const patch={magazineLayout:{dx:.03,dy:.02,scaleX:.8,scaleY:.8,order:2},rotation:45,crop:[.1,.1,.8,.8],locked:true};api.execute({boardId:probe.boardId,revision:probe.revision,ops:[{command:'trip_presentation_update',input:{id:p.id,...patch}}]});const read=async format=>{const a=await api.exportArtifact(format),bytes=new Uint8Array(await(await fetch(a.url)).arrayBuffer());let text='';for(const b of bytes)text+=String.fromCharCode(b);return {bytes:btoa(text),sha256:a.sha256,filename:a.filename};};return {pdf:await read('pdf'),zip:await read('zip'),id:p.id,patch};});
  const pdfFile=path.join(directory,'edited.pdf'),zipFile=path.join(directory,'edited.mot.zip');fs.writeFileSync(pdfFile,Buffer.from(artifactResult.pdf.bytes,'base64'));fs.writeFileSync(zipFile,Buffer.from(artifactResult.zip.bytes,'base64'));assert.equal(crypto.createHash('sha256').update(fs.readFileSync(pdfFile)).digest('hex'),artifactResult.pdf.sha256);
  await page.waitForFunction(()=>Number(document.querySelector('[aria-label="Trip composition"]').dataset.magazineRevision)===window.motTrip.probe().revision);const svg=await page.locator('.mot-composition-page').nth(1).locator('svg').first().evaluate(e=>e.outerHTML);fs.writeFileSync(path.join(directory,'edited-page-5.svg'),svg);
  const prefix=path.join(directory,'edited-proof-5');execFileSync('pdftoppm',['-f','5','-l','5','-singlefile','-png','-scale-to-x','1184','-scale-to-y','1680',pdfFile,prefix],{timeout:15000,stdio:'pipe'});
  const compared=await page.evaluate(async({svg,png})=>{const load=async src=>{const i=new Image();i.src=src;await i.decode();const c=document.createElement('canvas');c.width=1184;c.height=1680;const ctx=c.getContext('2d');ctx.drawImage(i,0,0,1184,1680);return{pixels:ctx.getImageData(0,0,1184,1680).data,png:c.toDataURL().split(',')[1]};};const a=await load('data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg)),b=await load('data:image/png;base64,'+png);let sum=0;for(let i=0;i<a.pixels.length;i+=4)for(let k=0;k<3;k++)sum+=Math.abs(a.pixels[i+k]-b.pixels[i+k]);return{mean:sum/(1184*1680*3),png:a.png};},{svg,png:fs.readFileSync(prefix+'.png').toString('base64')});fs.writeFileSync(path.join(directory,'edited-preview-5.png'),Buffer.from(compared.png,'base64'));assert(compared.mean<=4,`Edited page G9 mismatch ${compared.mean}`);
  const cleanContext=await browser.newContext({viewport:{width:1280,height:1000}}),clean=await cleanContext.newPage();try{
   await clean.goto(origin+'/?view=trip');await clean.evaluate(async({fixture})=>{const store=await import('/src/trip/trip-store.ts');const trip=await store.openTrip('composition-offline-staging',{title:'Offline staging',city:fixture.name,cityId:fixture.cityId,countryCode:fixture.countryCode,timeZone:null});await trip.whenSaved();trip.destroy();},{fixture});await clean.reload();await clean.getByRole('navigation',{name:'Trip views'}).waitFor();await clean.evaluate(async()=>{await import('/src/trip/artifacts.ts');});await cleanContext.setOffline(true);await clean.locator('input[type="file"]').setInputFiles(zipFile);await clean.waitForFunction(()=>window.motTrip?.probe().boardId!=='composition-offline-staging');
   const restored=await clean.evaluate(async id=>{const p=window.motTrip.read().presentations.find(p=>p.id===id),a=await window.motTrip.exportArtifact('pdf'),b=await(await fetch(a.url)).arrayBuffer();return{p,sha256:[...new Uint8Array(await crypto.subtle.digest('SHA-256',b))].map(v=>v.toString(16).padStart(2,'0')).join('')};},artifactResult.id);for(const [k,v] of Object.entries(artifactResult.patch))assert.deepEqual(restored.p[k],v);assert.equal(restored.sha256,artifactResult.pdf.sha256,'Edited PDF changed after offline ZIP reopen');
  }finally{await cleanContext.close();}
  const output={city,elapsedMs:Date.now()-startedAt,pdfSha256:artifactResult.pdf.sha256,pdfBytes:fs.statSync(pdfFile).size,meanRgbDifference:compared.mean,offlinePdfByteIdentical:true,geometryCropRotationOrderLockPreserved:true,errors,consoleMessages};fs.writeFileSync(path.join(directory,'artifact-result.json'),JSON.stringify(output,null,2));console.log(JSON.stringify(output));assert.deepEqual(errors,[]);
 }catch(error){await page.screenshot({path:path.join(directory,'artifact-failure.png')}).catch(()=>{});throw error;}finally{await browser.close();}
})().catch(e=>{console.error(e.stack);process.exitCode=1;});

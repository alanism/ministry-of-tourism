// MOT-86 consumer QA with actual FCC rendition bytes and explicit local transport fixtures.
const {chromium}=require(process.env.MOT_PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const origin=process.env.MOT_TEST_ORIGIN||'http://127.0.0.1:5198',fcc=process.env.MOT_FCC_SOURCE;
if(!fcc)throw Error('Set MOT_FCC_SOURCE to the read-only local FCC source.');
const directory=process.env.MOT_EVIDENCE_DIR||require('node:os').tmpdir();fs.mkdirSync(directory,{recursive:true});
const coreUrl='/@fs/'+path.resolve(__dirname,'..').replace(/\\/g,'/')+'/packages/core/src/index.ts';
const catalog=city=>JSON.parse(fs.readFileSync(path.resolve(__dirname,'../apps/web/public/artwork/fcc',city,'hotels.json'),'utf8')).items;
const assets=new Map();
async function fixture(city){
 const art=catalog(city).find(a=>fs.existsSync(path.join(fcc,'public',new URL(a.src).pathname))),bytes=fs.readFileSync(path.join(fcc,'public',new URL(art.src).pathname)),thumbPath=path.join(fcc,'public',new URL(art.thumb).pathname),thumb=fs.existsSync(thumbPath)?fs.readFileSync(thumbPath):bytes;
 // Use the real 960 px rendition as this transport fixture's available original; no pixels are edited.
 const {readRasterHeader}=await import('./fcc-art-metadata.ts'),pixels=readRasterHeader(bytes);
 const hash=crypto.createHash('sha256').update(bytes).digest('hex'),base='https://foreignclubberscorespondence.web.app/qa/'+city;
 assets.set(base+'-original.webp',bytes);assets.set(base+'-preview.webp',bytes);assets.set(base+'-thumb.webp',thumb);
 return{...art,id:'qa:'+city,thumb:base+'-thumb.webp',src:base+'-preview.webp',original:base+'-original.webp',width:pixels.width,height:pixels.height,sourceHash:hash,artRef:{...art.artRef,assetId:'qa:'+city,thumbnailUrl:base+'-thumb.webp',renditionUrl:base+'-preview.webp',originalUrl:base+'-original.webp',width:pixels.width,height:pixels.height,mimeType:'image/webp',hash}};
}
(async()=>{const started=Date.now(),browser=await chromium.launch({headless:true,chromiumSandbox:true});try{
 let previewFailure=false,originalFailure=false;
 const context=await browser.newContext({viewport:{width:1920,height:1080}}),page=await context.newPage(),errors=[],requests=[];
 page.on('pageerror',e=>errors.push(e.message));
 const a=await fixture('san-sebastian'),b=await fixture('barcelona'),items=[a,b];
 const manifest={version:1,styleId:'fcc-editorial',subjects:[{id:'hotels',label:'Hotels'},{id:'apparel',label:'Apparel'}],cities:[{id:'san-sebastian',label:'San Sebastián'},{id:'barcelona',label:'Barcelona'}],catalogs:items.map(art=>({city:art.city,subject:'hotels',count:1,url:'/artwork/qa/'+art.city+'.json'}))};
 await page.route('**/artwork/index.json',r=>r.fulfill({json:{version:1,styles:[{id:'fcc-editorial',label:'FCC city illustrations',manifest:'/artwork/qa/manifest.json'}]}}));
 await page.route('**/artwork/qa/*.json',r=>{const name=new URL(r.request().url()).pathname.split('/').at(-1);return r.fulfill({json:name==='manifest.json'?manifest:{version:1,styleId:'fcc-editorial',items:items.filter(a=>a.city+'.json'===name)}});});
 await page.route('https://foreignclubberscorespondence.web.app/**',r=>{const url=r.request().url();requests.push(url);if(previewFailure&&url.endsWith('-preview.webp')||originalFailure&&url.endsWith('-original.webp'))return r.fulfill({status:503,body:'QA failure'});return assets.has(url)?r.fulfill({body:assets.get(url),contentType:'image/webp',headers:{'Access-Control-Allow-Origin':'*'}}):r.abort();});
 await page.goto(origin+'/?view=trip');
 await page.evaluate(async coreUrl=>{const core=await import(coreUrl),store=await import('/src/trip/trip-store.ts'),trip=await store.openTrip('mot86-qa',{title:'San Sebastián QA trip',city:'San Sebastián',cityId:'san-sebastian',countryCode:'ES',timeZone:'Europe/Madrid'});await trip.whenSaved();trip.destroy();},coreUrl);
 await page.reload();await page.waitForFunction(()=>!!window.motTrip);
 const open=async()=>{await page.locator('button[aria-label="Add"][aria-haspopup="menu"]').click();await page.getByRole('menuitem',{name:'FCC art',exact:true}).click();await page.getByRole('dialog',{name:'Add FCC art'}).waitFor();};
 await open();await page.getByRole('button',{name:'Browse this country',exact:true}).click();await page.getByRole('button',{name:'Preview '+b.label+' from Barcelona',exact:true}).click();
 const preview=page.getByRole('complementary',{name:'Artwork preview'});await preview.locator('.art-original-preview img').waitFor();
 assert((await preview.innerText()).includes('Not your destination'));assert((await preview.innerText()).includes(b.artRef.credit));
 assert(!requests.some(url=>url.endsWith('-original.webp')),'Original must not download during browse/preview');
 assert.equal(await page.getByRole('option',{name:'Apparel',exact:true}).count(),0);
 const widths=[];for(const width of [1920,1440,1280,768,375,280]){
  await page.setViewportSize({width,height:1080});
  const fit=await page.evaluate(()=>({page:document.documentElement.scrollWidth<=innerWidth,dialog:document.querySelector('.trip-artwork').scrollWidth<=document.querySelector('.trip-artwork').clientWidth+1,preview:document.querySelector('.trip-art-preview').scrollWidth<=document.querySelector('.trip-art-preview').clientWidth+1}));assert(fit.page&&fit.dialog&&fit.preview,JSON.stringify({width,fit}));
  const kit=await page.getByRole('dialog',{name:'Add FCC art'}).evaluate(dialog=>{const visible=e=>e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden';return{primaries:[...dialog.querySelectorAll('.primary')].filter(visible).length,type:[...dialog.querySelectorAll('*')].filter(e=>visible(e)&&[...e.childNodes].some(n=>n.nodeType===Node.TEXT_NODE&&n.textContent.trim())).map(e=>{const s=getComputedStyle(e);return{font:s.fontFamily,weight:s.fontWeight,size:s.fontSize};})};});
  assert.equal(kit.primaries,1);assert(kit.type.every(t=>t.font.includes('IBM Plex')&&['400','600'].includes(t.weight)&&['12px','15px','19px','24px','30px'].includes(t.size)),JSON.stringify(kit.type));
  const metrics=await preview.locator('button').evaluateAll(buttons=>buttons.filter(b=>b.getClientRects().length).map(b=>({label:b.textContent.trim(),height:b.getBoundingClientRect().height})));assert(metrics.every(m=>m.height>=44));
  await page.screenshot({path:path.join(directory,'art-preview-'+width+'.png')});widths.push({width,fit,kit,targets:metrics});
 }
 await page.setViewportSize({width:1280,height:1080});
 await preview.locator('summary').click();await preview.locator('a').focus();await page.keyboard.press('Tab');assert(await preview.getByRole('button',{name:'Add to board',exact:true}).evaluate(b=>b===document.activeElement));
 const readFixture=()=>page.evaluate(async coreUrl=>{await window.motTrip.persist();const core=await import(coreUrl),store=await import('/src/trip/trip-store.ts'),trip=await store.openTrip(window.motTrip.probe().boardId);try{const parts=core.tripParts(trip.doc);return{meta:core.readTripMeta(trip.doc),cards:core.readAllCards(parts),presentations:core.readPresentations(parts),assets:[...parts.assets.keys()].map(id=>core.readAsset(parts,id))};}finally{trip.destroy();}},coreUrl);
 const before=await readFixture();
 await preview.getByRole('button',{name:'Add to board',exact:true}).click();await page.getByRole('dialog',{name:'Add FCC art'}).waitFor({state:'hidden'});
 const after=await readFixture();assert.equal(after.presentations.length,before.presentations.length+1);assert.equal(after.meta.city,'San Sebastián');assert.equal(after.cards.length,before.cards.length);assert.equal(after.assets[0].credit,b.artRef.credit);assert.equal(after.assets[0].source.cityId,'barcelona');assert.equal(after.assets[0].hash,b.artRef.hash);assert.equal(requests.filter(url=>url.endsWith('-original.webp')).length,1);
 const packageCheck=await page.evaluate(async coreUrl=>{const core=await import(coreUrl),store=await import('/src/trip/trip-store.ts'),media=await import('/src/trip/trip-assets.ts'),trip=await store.openTrip(window.motTrip.probe().boardId),bytes=await media.assetBytes(trip.doc);try{const zip=await core.exportTripPackage(trip.doc,bytes,{includePrivate:true}),copy=await core.importTripPackage(zip),parts=core.tripParts(copy.doc);let binary='';for(const byte of zip)binary+=String.fromCharCode(byte);return{assets:copy.assets.size,credit:core.readAsset(parts,[...parts.assets.keys()][0]).credit,bytes:zip.length,zip:btoa(binary)};}finally{trip.destroy();}},coreUrl);
 fs.writeFileSync(path.join(directory,'selected-art-personal.mot.zip'),Buffer.from(packageCheck.zip,'base64'));delete packageCheck.zip;
 await page.getByRole('button',{name:'Undo',exact:true}).last().click();assert.equal((await readFixture()).presentations.length,before.presentations.length);
 await open();await page.getByRole('button',{name:'Preview '+a.label,exact:true}).click();await page.keyboard.press('Escape');await page.getByRole('dialog',{name:'Add FCC art'}).waitFor({state:'hidden'});assert.equal((await readFixture()).presentations.length,before.presentations.length);
 assert(await page.locator('button[aria-label="Add"][aria-haspopup="menu"]').evaluate(b=>b===document.activeElement),'Escape must return focus to Add');
 // Explicit preview and original failures keep the document unchanged and retain honest next actions.
 previewFailure=true;await open();await page.getByRole('button',{name:'Preview '+a.label,exact:true}).click();await preview.getByRole('alert').waitFor();
 for(let i=0;i<3;i++){await preview.getByRole('button',{name:'Try again',exact:true}).click();await preview.getByRole('alert').waitFor();}
 assert.equal(await preview.getByRole('button',{name:'Try again',exact:true}).count(),0);assert((await preview.innerText()).includes('Three retries failed'));
 for(const width of [1440,375]){await page.setViewportSize({width,height:1080});await page.screenshot({path:path.join(directory,'preview-failed-'+width+'.png')});}
 previewFailure=false;originalFailure=true;await preview.getByRole('button',{name:'Add to board',exact:true}).click();await page.locator('.dialog-error').waitFor();assert((await page.locator('.dialog-error').innerText()).includes('503'));assert.equal((await readFixture()).presentations.length,before.presentations.length);
 await page.keyboard.press('Escape');originalFailure=false;
 // A genuine small source rendition is the only image for this fixture. Low dpi never disables Add.
 const {readRasterHeader}=await import('./fcc-art-metadata.ts'),small=assets.get(b.thumb),pixels=readRasterHeader(small),hash=crypto.createHash('sha256').update(small).digest('hex');
 Object.assign(b,{src:b.thumb,original:undefined,width:pixels.width,height:pixels.height,sourceHash:hash});Object.assign(b.artRef,{renditionUrl:b.thumb,originalUrl:undefined,width:pixels.width,height:pixels.height,hash});
 await open();await page.getByRole('button',{name:'Browse this country',exact:true}).click();await page.getByRole('button',{name:'Preview '+b.label+' from Barcelona',exact:true}).click();await preview.locator('.art-original-preview img').waitFor();
 assert((await preview.innerText()).includes('below 300'));assert(await preview.getByRole('button',{name:'Add to board',exact:true}).isEnabled());
 await page.setViewportSize({width:375,height:1080});await preview.locator('.art-print-meter').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(directory,'thumbnail-only-375.png')});
 await preview.getByRole('button',{name:'Add to board',exact:true}).click();await page.getByRole('dialog',{name:'Add FCC art'}).waitFor({state:'hidden'});
 const lowResolution=await page.evaluate(async coreUrl=>{await window.motTrip.persist();const core=await import(coreUrl),store=await import('/src/trip/trip-store.ts'),delivery=await import('/src/trip/artifacts.ts'),trip=await store.openTrip(window.motTrip.probe().boardId),session=new core.TripSession(trip.doc);try{const magazine=await delivery.prepareMagazine(session,undefined,true);const pdf=await delivery.magazinePdf(magazine);let binary='';for(const byte of pdf)binary+=String.fromCharCode(byte);return{pdf:btoa(binary),pages:magazine.pages.length,warnings:magazine.warnings,pixels:[...trip.doc.getMap('tripAssets').values()].map(a=>[a.get('width'),a.get('height')])};}finally{session.destroy();trip.destroy();}},coreUrl);
 fs.writeFileSync(path.join(directory,'thumbnail-only-A5.pdf'),Buffer.from(lowResolution.pdf,'base64'));lowResolution.pdfBytes=Buffer.from(lowResolution.pdf,'base64').length;delete lowResolution.pdf;
 assert(lowResolution.warnings.some(w=>/300 dpi/i.test(w)),'A5 issue must warn about the thumbnail-only source');
 assert.deepEqual(errors,[]);
 const result={transport:'Actual FCC 480/960 rendition bytes; local fixture URLs and 960 px originals. This is consumer QA, not proof of deployed CORS.',widths,originalDeferred:true,oneAddOneUndo:true,sourceRetained:true,packageCheck,escapeNoWrite:true,threeRetryLimit:true,failedOriginalNoWrite:true,lowResolution,errors,elapsedMs:Date.now()-started};fs.writeFileSync(path.join(directory,'art-preview-result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({widths:widths.length,packageCheck,errors,elapsedMs:result.elapsedMs}));
}finally{await browser.close();}})().catch(e=>{console.error(e.stack);process.exitCode=1;});

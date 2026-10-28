// Personal-art acceptance in fresh sandboxed contexts. No model calls, uploads or deployments.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const {unzipSync,strFromU8}=require('fflate');
const Y=require('yjs');
const {chromium}=require(process.env.MOT_PLAYWRIGHT_MODULE||'playwright');
const {createTripThroughDestination,openExport}=require('./mot-browser-contracts.cjs');
const ORIGIN=process.env.MOT_TEST_ORIGIN||'http://127.0.0.1:5184';
const MAIN_REPO=process.env.MOT_APP_REPO||path.resolve(__dirname,'..');
const CITY={ 'san-sebastian':{name:'San Sebastián',country:'ES'},zurich:{name:'Zürich',country:'CH'},tokyo:{name:'Tokyo',country:'JP'} };
const output=path.join(process.env.MOT_EVIDENCE_DIR||path.join(os.tmpdir(),'mot-art-evidence'),new Date().toISOString().replace(/[:.]/g,'-'));
fs.mkdirSync(output,{recursive:true});
const summarize=object=>Object.fromEntries(Object.entries(object).filter(([key])=>key!=='boardId'));

async function newTrip(page,details) {
  await page.goto(`${ORIGIN}/?view=trip`,{waitUntil:'domcontentloaded'});
  await createTripThroughDestination(page,{city:details.name,country:new Intl.DisplayNames(['en'],{type:'region'}).of(details.country)});
  await page.waitForFunction(()=>!!window.motTrip?.probe()?.boardId);
}
async function insertArt(page,city,art) {
  await page.locator('header.mot-header').scrollIntoViewIfNeeded();await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  await page.locator('button[aria-haspopup="menu"][aria-label="Add"]').click();await page.getByRole('menuitem',{name:'FCC art',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'Artwork',exact:true});await dialog.waitFor();
  await dialog.getByLabel(/^Style/).selectOption('fcc-editorial');await dialog.getByLabel(/^Subject/).selectOption('places');await dialog.getByLabel(/^City/).selectOption(city);
  await dialog.getByRole('button',{name:`Add ${art.label}`,exact:true}).click();await dialog.waitFor({state:'hidden',timeout:35000});
}
const view=(page,name)=>page.getByRole('navigation',{name:'Trip views',exact:true}).getByRole('button',{name,exact:true}).click();
async function geometry(page) {
  const controls=page.getByRole('complementary',{name:'Placement controls'});
  const state={};
  for(const key of ['x','y','width','height','rotation','zIndex'])state[key]=Number(await controls.getByLabel(`Object ${key}`,{exact:true}).inputValue());
  state.crop=[];
  for(const key of ['left','top','width','height'])state.crop.push(Number(await controls.getByLabel(`Crop ${key}`,{exact:true}).inputValue()));
  state.locked=await controls.getByRole('button',{name:'Unlock object',exact:true}).count()>0;
  const pattern=controls.getByLabel(/^Spread pattern/);if(await pattern.count())state.pattern=await pattern.inputValue();
  return state;
}
function equivalentGeometry(actual,expected) {
  for(const key of ['x','y','width','height','rotation','zIndex'])assert.ok(Math.abs(actual[key]-expected[key])<1e-8,`${key} changed: ${actual[key]} vs ${expected[key]}`);
  assert.deepEqual(actual.crop,expected.crop);assert.equal(actual.locked,expected.locked);
  assert.equal(actual.pattern,expected.pattern);
}
async function personalExport(page,format) {
  // Remount the shared-by-default surface, then deliberately select the owner's full copy.
  await view(page,'Board');
  const surface=await openExport(page);
  await surface.getByRole('checkbox',{name:'Include private content',exact:true}).check();
  const card=surface.getByRole('article',{name:format==='pdf'?'Magazine PDF':'Editable package',exact:true});
  await card.getByRole('button',{name:format==='pdf'?'Export PDF':'Export package',exact:true}).click();
  await card.getByText(/^Download ready/).waitFor({timeout:60000});
  const receipt=JSON.parse(await card.locator('.mot-export-agent pre').first().textContent());
  assert.equal(receipt.scope,'personal');assert.equal(receipt.downloadReady,true);
  assert.match(receipt.sha256,/^[a-f0-9]{64}$/);assert.ok(Number.isInteger(receipt.revision));
  return {card,receipt};
}
async function backup(page,target) {
  const {card,receipt}=await personalExport(page,'zip');
  const [download]=await Promise.all([page.waitForEvent('download'),card.getByRole('button',{name:'Download',exact:true}).click()]);
  await download.saveAs(target);
  const bytes=fs.readFileSync(target);assert.equal(bytes.length,receipt.bytes);
  assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),receipt.sha256);
  return target;
}
function inspectPackage(file) {
  const files=unzipSync(fs.readFileSync(file));
  const manifest=JSON.parse(strFromU8(files['manifest.json'])),trip=JSON.parse(strFromU8(files['trip.json']));
  const doc=new Y.Doc();Y.applyUpdate(doc,Buffer.from(strFromU8(files['document.b64']).trim(),'base64'));
  const assets=[...doc.getMap('tripAssets').entries()].map(([id,asset])=>({id,...asset.toJSON()}));doc.destroy();
  assert.equal(manifest.version,2);
  for(const entry of manifest.assets) {
    assert.ok(files[entry.file]?.length>0,`Asset ${entry.id} has no bytes`);
    assert.equal(crypto.createHash('sha256').update(files[entry.file]).digest('hex'),entry.sha256);
  }
  return {manifest,trip,assets};
}
async function previewPng(page,img,target) {
  const data=await img.evaluate(async image=>{await image.decode();const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;canvas.getContext('2d').drawImage(image,0,0);return canvas.toDataURL('image/png').split(',')[1];});
  fs.writeFileSync(target,Buffer.from(data,'base64'));
}
async function personalPdf(page,directory,tag) {
  await view(page,'Keepsakes');
  const studio=page.getByRole('region',{name:'Trip magazine studio',exact:true});
  await studio.getByRole('checkbox',{name:'Include private notes and artwork in this preview',exact:true}).check();
  await page.waitForFunction(()=>[...document.querySelectorAll('.mot-issue-paper img')].some(image=>decodeURIComponent(image.src).includes('data-placement=')));
  const previews=studio.locator('.mot-issue-paper img');await previews.first().waitFor();
  const count=await previews.count(),svgs=[],pageLabels=[];
  const ordered=await Promise.all(Array.from({length:count},async(_,index)=>({index,folio:Number((await previews.nth(index).getAttribute('alt')).match(/ · page (\d+)$/)[1])})));
  ordered.sort((a,b)=>a.folio-b.folio);
  assert.deepEqual(ordered.map(page=>page.folio),Array.from({length:count},(_,index)=>index+1));
  for(let i=0;i<count;i++) {
    const image=previews.nth(ordered[i].index);svgs.push(decodeURIComponent((await image.getAttribute('src')).split(',').slice(1).join(',')));pageLabels.push(await image.getAttribute('alt'));
    await previewPng(page,image,path.join(directory,`${tag}-preview-${i+1}.png`));
  }
  await page.screenshot({path:path.join(directory,`${tag}-studio-desktop.png`)});
  await page.setViewportSize({width:375,height:812});await studio.scrollIntoViewIfNeeded();await page.screenshot({path:path.join(directory,`${tag}-studio-phone.png`)});await page.setViewportSize({width:1440,height:1000});
  const {card,receipt}=await personalExport(page,'pdf');
  const [download]=await Promise.all([page.waitForEvent('download'),card.getByRole('button',{name:'Download',exact:true}).click()]);
  const pdf=path.join(directory,`${tag}.pdf`);await download.saveAs(pdf);
  const bytes=fs.readFileSync(pdf);assert.equal(bytes.subarray(0,5).toString(),'%PDF-');
  assert.equal(receipt.type,'application/pdf');assert.equal(receipt.bytes,bytes.length);
  assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),receipt.sha256);
  const prefix=path.join(directory,`${tag}-pdf-page`);
  execFileSync(process.env.MOT_PDFTOPPM||'pdftoppm',['-png','-scale-to-x','1184','-scale-to-y','1680',pdf,prefix],{stdio:['ignore','pipe','pipe'],timeout:20000});
  const renders=fs.readdirSync(directory).filter(name=>name.startsWith(`${tag}-pdf-page-`)&&name.endsWith('.png')).sort((a,b)=>Number(a.match(/-(\d+)\.png$/)[1])-Number(b.match(/-(\d+)\.png$/)[1]));
  assert.equal(renders.length,count,'Actual PDF page count differs from preview');
  const differences=[];
  for(let i=0;i<count;i++) {
    const preview=fs.readFileSync(path.join(directory,`${tag}-preview-${i+1}.png`)).toString('base64');
    const raster=fs.readFileSync(path.join(directory,renders[i])).toString('base64');
    const mean=await page.evaluate(async({preview,raster})=>{
      const pixels=async value=>{const image=new Image();image.src=`data:image/png;base64,${value}`;await image.decode();const canvas=document.createElement('canvas');canvas.width=1184;canvas.height=1680;const context=canvas.getContext('2d');context.drawImage(image,0,0,1184,1680);return context.getImageData(0,0,1184,1680).data;};
      const [a,b]=await Promise.all([pixels(preview),pixels(raster)]);let total=0;for(let offset=0;offset<a.length;offset+=4)for(let c=0;c<3;c++)total+=Math.abs(a[offset+c]-b[offset+c]);return total/(a.length/4*3);
    },{preview,raster});
    assert.ok(mean<8,`PDF page ${i+1} differs from SVG preview: mean RGB error ${mean}`);differences.push(mean);
  }
  return {file:pdf,byteCount:bytes.length,pageCount:count,pageLabels,receipt,meanRgbDifferences:differences,svgs};
}

async function runCity(browser,city) {
  const details=CITY[city];if(!details)throw new Error(`Unknown test city ${city}`);
  const directory=path.join(output,city);fs.mkdirSync(directory,{recursive:true});
  const context=await browser.newContext({viewport:{width:1440,height:1000},locale:'en-US',timezoneId:'Asia/Bangkok',acceptDownloads:true});
  let clean;
  const page=await context.newPage();page.setDefaultTimeout(15000);
  const errors=[],sourceRequests=[],sourceFailures=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('request',request=>{if(new URL(request.url()).hostname==='foreignclubberscorespondence.web.app')sourceRequests.push(request.url());});
  page.on('requestfailed',request=>{if(new URL(request.url()).hostname==='foreignclubberscorespondence.web.app')sourceFailures.push({url:request.url(),error:request.failure()?.errorText});});
  try {
    await newTrip(page,details);
    const catalog=JSON.parse(fs.readFileSync(path.join(MAIN_REPO,`apps/web/public/artwork/fcc/${city}/places.json`),'utf8'));
    const art=process.env.MOT_FCC_ART_LABEL?catalog.items.find(art=>art.label===process.env.MOT_FCC_ART_LABEL):catalog.items.find(art=>new URL(art.original||art.src).pathname.startsWith('/assets/generated/'));
    assert.ok(art,'No requested artwork or generated original fixture is available');assert.ok(art.original||art.src);
    await insertArt(page,city,art);
    const object=page.locator('.mot-composition-object').first();await object.waitFor();await object.click();
    await page.getByLabel('Object width',{exact:true}).fill('0.6');await page.getByLabel('Object height',{exact:true}).fill('0.4');
    await page.getByLabel('Object x',{exact:true}).fill('0.12');await page.getByLabel('Object y',{exact:true}).fill('0.2');
    await page.getByLabel('Crop width',{exact:true}).fill('0.8');await page.getByLabel('Crop height',{exact:true}).fill('0.6');
    await page.getByLabel('Crop left',{exact:true}).fill('0.1');await page.getByLabel('Crop top',{exact:true}).fill('0.1');
    await page.getByLabel('Object rotation',{exact:true}).fill('18');
    const baseline=await geometry(page);
    for(let index=0;index<30;index++) {await object.focus();await object.press(index%2?'ArrowDown':'ArrowRight');}
    const moved=await geometry(page);assert.ok(moved.x>baseline.x&&moved.y>baseline.y);
    const composition=page.getByRole('region',{name:'Trip composition',exact:true});
    for(let index=0;index<30;index++)await composition.getByRole('button',{name:'Undo',exact:true}).click();
    equivalentGeometry(await geometry(page),baseline);
    for(let index=0;index<30;index++)await composition.getByRole('button',{name:'Redo',exact:true}).click();
    equivalentGeometry(await geometry(page),moved);
    await page.getByRole('button',{name:'Lock object',exact:true}).click();
    let locked=await geometry(page);assert.ok(await page.getByLabel('Object x',{exact:true}).isDisabled());
    await object.focus();await object.press('ArrowLeft');
    const box=await object.boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2+35,box.y+box.height/2+30);await page.mouse.up();
    equivalentGeometry(await geometry(page),locked);
    await page.screenshot({path:path.join(directory,'composition-desktop.png')});
    await page.setViewportSize({width:375,height:812});await composition.scrollIntoViewIfNeeded();await page.screenshot({path:path.join(directory,'composition-phone.png')});
    const mobileWidth=await page.evaluate(()=>({viewport:innerWidth,document:document.documentElement.scrollWidth}));await page.setViewportSize({width:1440,height:1000});
    const patterns=['personal-cover','city-feature','food-culture','map','correspondence'];
    await view(page,'Board');
    for(const pattern of patterns) {await page.getByPlaceholder('New card title',{exact:true}).fill(`${details.name} — ${pattern}`);await page.getByRole('button',{name:'Add card',exact:true}).click();}
    const cards=await page.evaluate(()=>window.motTrip.read().cards);
    await view(page,'Composition');await page.locator('.mot-composition-object').first().click();
    const firstCard=cards.find(card=>card.title===`${details.name} — personal-cover`);assert.ok(firstCard);
    await page.getByLabel(/^Linked card/).selectOption(firstCard.id);
    await page.getByLabel('Card notes',{exact:true}).fill('My personal travel notes. This FCC illustration decorates the page; current services and opening hours still need checking.');await page.getByLabel('Card notes',{exact:true}).press('Tab');
    await page.getByRole('button',{name:'Unlock object',exact:true}).click();await page.getByLabel(/^Spread pattern/).selectOption(patterns[0]);await page.getByLabel('Object rotation',{exact:true}).fill('8');
    // Keep the intended cover placement first when repeated references share one original.
    await page.getByLabel('Object zIndex',{exact:true}).fill('-1');
    await page.getByRole('button',{name:'Lock object',exact:true}).click();locked=await geometry(page);
    for(let index=1;index<5;index++) {
      await insertArt(page,city,art);await page.getByRole('button',{name:'Select artwork',exact:true}).click();
      const card=cards.find(card=>card.title===`${details.name} — ${patterns[index]}`);assert.ok(card);
      await page.getByLabel(/^Linked card/).selectOption(card.id);
      await page.getByLabel('Card notes',{exact:true}).fill(`A personal ${patterns[index]} page for my trip. Original illustration and source stay attached to this board.`);await page.getByLabel('Card notes',{exact:true}).press('Tab');
      await page.getByLabel(/^Spread pattern/).selectOption(patterns[index]);
      await page.getByRole('button',{name:'Lock object',exact:true}).click();
    }
    const primary=page.getByRole('button',{name:`Select ${firstCard.title} (locked)`,exact:true});await primary.focus();await primary.press('Enter');
    equivalentGeometry(await geometry(page),locked);
    const blobCount=await page.evaluate(()=>new Promise((resolve,reject)=>{const request=indexedDB.open('writers-board-blobs');request.onerror=()=>reject(request.error);request.onsuccess=()=>{const db=request.result;const transaction=db.transaction('blobs','readonly');const count=transaction.objectStore('blobs').count();transaction.oncomplete=()=>{db.close();resolve(count.result);};transaction.onerror=()=>reject(transaction.error);};}));
    assert.equal(blobCount,1,'Repeated artwork must have one durable blob');
    const original=inspectPackage(await backup(page,path.join(directory,'original.mot.zip')));
    assert.equal(original.manifest.assets.length,1,'Repeated art must reuse one packaged asset');assert.equal(new Set(original.manifest.assets.map(asset=>asset.sha256)).size,1);assert.equal(original.trip.presentations.length,5);assert.equal(original.trip.cards.length,5);
    if(art.sourceHash)assert.equal(original.manifest.assets[0].sha256,art.sourceHash,'Downloaded original differs from its published source hash');
    assert.deepEqual(original.trip.presentations.map(object=>object.pattern).sort(),[...patterns].sort());
    const originalPlacement=original.trip.presentations.find(object=>object.cardId===firstCard.id);assert.equal(originalPlacement.locked,true);assert.deepEqual(originalPlacement.crop,[0.1,0.1,0.8,0.6]);
    await page.reload();await page.waitForFunction(()=>!!window.motTrip?.probe()?.boardId);await view(page,'Composition');const reloadedPrimary=page.getByRole('button',{name:`Select ${firstCard.title} (locked)`,exact:true});await reloadedPrimary.focus();await reloadedPrimary.press('Enter');
    equivalentGeometry(await geometry(page),locked);
    const personal=await personalPdf(page,directory,'personal');
    assert.ok(personal.pageCount>0);
    // Five editable placements remain in the package; issue-wide deduplication prints their one original once.
    const rendered=personal.svgs.flatMap(svg=>[...svg.matchAll(/<g\b[^>]*data-art="([^"]+)"[^>]*data-placement="([^"]+)"[^>]*>/g)]);
    assert.equal(rendered.length,1,'The same original must not be repeated across issue slots');
    assert.equal(rendered[0][1],original.manifest.assets[0].id);
    assert.equal(rendered[0][2],originalPlacement.id,'The chosen cover placement must supply its actual crop and rotation');
    const renderedPlacement=original.trip.presentations.find(object=>object.id===rendered[0][2]);assert.ok(renderedPlacement);
    assert.ok(personal.svgs.some(svg=>svg.includes(`data-placement="${renderedPlacement.id}"`)&&svg.includes(`data-crop="${renderedPlacement.crop.join(',')}"`)&&svg.includes(`rotate(${renderedPlacement.rotation} `)));
    assert.equal(renderedPlacement.locked,true);
    const beforeId=await page.evaluate(()=>window.motTrip.probe().boardId);
    clean=await browser.newContext({viewport:{width:1440,height:1000},locale:'en-US',acceptDownloads:true});
    const offline=await clean.newPage();offline.setDefaultTimeout(15000);offline.on('pageerror',error=>errors.push(error.message));
    await newTrip(offline,{name:'Offline import fixture',country:'ES'});
    await clean.setOffline(true);
    await offline.locator('input[type="file"][accept*=".zip"]').setInputFiles(path.join(directory,'original.mot.zip'));
    await offline.waitForFunction(()=>window.motTrip?.read().meta.city!=='Offline import fixture');
    const importedId=await offline.evaluate(()=>window.motTrip.probe().boardId);assert.notEqual(importedId,beforeId);
    await view(offline,'Composition');const offlinePrimary=offline.getByRole('button',{name:`Select ${firstCard.title} (locked)`,exact:true});await offlinePrimary.focus();await offlinePrimary.press('Enter');
    equivalentGeometry(await geometry(offline),locked);
    const imported=inspectPackage(await backup(offline,path.join(directory,'offline-reopened.mot.zip')));
    assert.deepEqual(imported.manifest.assets,original.manifest.assets);assert.deepEqual(imported.assets,original.assets);
    assert.deepEqual(imported.trip.presentations.map(summarize),original.trip.presentations.map(summarize));
    const offlinePdf=await personalPdf(offline,directory,'offline-personal');
    assert.equal(offlinePdf.pageCount,personal.pageCount);
    assert.equal(crypto.createHash('sha256').update(fs.readFileSync(offlinePdf.file)).digest('hex'),crypto.createHash('sha256').update(fs.readFileSync(personal.file)).digest('hex'),'Offline PDF bytes differ from personal export');
    await offline.screenshot({path:path.join(directory,'offline-reopened.png')});
    assert.deepEqual(errors,[]);
    const result={ok:true,city,artLabel:art.label,sourceUrl:art.original||art.src,sourceRequests:[...new Set(sourceRequests)],sourceFailures,geometry:locked,mobileWidth,blobCount,patterns,assetHashes:original.manifest.assets.map(asset=>asset.sha256),personal:{...personal,svgs:undefined},offline:{...offlinePdf,svgs:undefined},checks:{undoRedoMoves:30,lockedKeyboardAndPointer:true,reload:true,cleanOfflineImport:true,hashAndMetadataRoundtrip:true,pdfPreviewRasterParity:true}};
    fs.writeFileSync(path.join(directory,'result.json'),JSON.stringify(result,null,2));return result;
  } catch(error) {
    await page.screenshot({path:path.join(directory,'failure.png')}).catch(()=>{});
    const result={ok:false,city,error:error.message,errors,sourceRequests:[...new Set(sourceRequests)],sourceFailures,alerts:await page.getByRole('alert').allTextContents().catch(()=>[])};
    fs.writeFileSync(path.join(directory,'result.json'),JSON.stringify(result,null,2));return result;
  } finally {if(clean)await clean.close();await context.close();}
}
(async()=>{
  const browser=await chromium.launch({headless:true,chromiumSandbox:true});
  const results=[];
  try {for(const city of (process.env.MOT_TEST_CITIES||'san-sebastian,zurich,tokyo').split(','))results.push(await runCity(browser,city.trim()));}
  finally {await browser.close();}
  const result={ok:results.every(result=>result.ok),origin:ORIGIN,evidenceDirectory:output,results};fs.writeFileSync(path.join(output,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));if(!result.ok)process.exitCode=1;
})().catch(error=>{console.error(error);process.exitCode=1;});

// Reference-led visual/round-trip QA. Supply your own licensed city fixtures; no personal data is bundled.
const {chromium}=require(process.env.MOT_PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const {checkMagazineReading,captureMagazineSpreads,checkReadingNegativeControls}=require('./mot-magazine-reading-check.cjs');
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
  await page.reload({waitUntil:'domcontentloaded'});await page.getByRole('navigation',{name:'Trip views'}).getByRole('button',{name:'Keepsakes',exact:true}).click();
  await page.locator('.mot-issue-paper img').first().waitFor();
  assert.equal(page.url(),origin+'/?view=trip');assert((await page.title()).includes(fixture.name));assert.equal(await page.locator('vite-error-overlay').count(),0);
  const flip=page.getByRole('button',{name:'Turn the postcard over',exact:true});
  if(await flip.count()){const before=await flip.locator('img').getAttribute('src');await flip.click();assert.equal(await flip.getAttribute('aria-pressed'),'true');assert.notEqual(await flip.locator('img').getAttribute('src'),before);await flip.click();}
  const lead=page.getByRole('button',{name:'Swap lead specimen',exact:true});
  if(await lead.count()){const revision=await page.evaluate(()=>window.motTrip.probe().revision);await lead.click();assert((await page.evaluate(()=>window.motTrip.probe().revision))>revision);await page.getByRole('button',{name:'Undo',exact:true}).click();await page.locator('.mot-issue-paper img').first().waitFor();}
  const mono=apparel.find(a=>a.variant==='mono');
  if(mono){await page.getByRole('button',{name:mono.label,exact:true}).click();await page.waitForFunction(label=>[...document.querySelectorAll('.mot-issue-tee')].some(button=>button.textContent.includes(label)&&button.getAttribute('aria-pressed')==='true'),mono.label);await page.waitForFunction(()=>[...document.querySelectorAll('.mot-issue-tee')].every(button=>!button.disabled));await page.locator('.mot-issue-paper img').first().waitFor();}
  const result=await page.evaluate(async(coreUrl)=>{
   const store=await import('/src/trip/trip-store.ts'),core=await import(coreUrl),delivery=await import('/src/trip/artifacts.ts');
   const probe=window.motTrip.probe(),trip=await store.openTrip(probe.boardId),session=new core.TripSession(trip.doc);
   try{const magazine=await delivery.prepareMagazine(session,undefined,false);const bytes=await delivery.magazinePdf(magazine);let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);return{magazine,pdf:btoa(binary),gates:core.auditMagazinePages(magazine)};}finally{session.destroy();trip.destroy();}
  },coreUrl);
  assert.deepEqual(result.gates,{frontFirst:true,backLast:true,repeats:[]});
  const {magazine}=result;assert.equal(magazine.pages[0].section,'front-cover');assert.equal(magazine.pages.at(-1).section,'back-cover');
  const identities=magazine.spreads.flatMap(s=>s.usedSlots.map(a=>a.identity));assert.equal(new Set(identities).size,identities.length,'An editorial image slot was repeated');
  for(const section of['feature','plate','route','style','letters']){const spread=magazine.spreads.find(s=>s.section===section);if(spread)assert.equal(spread.pageIds.length,2,`${section} is not a real pair`);}
  assert(magazine.pages.every(p=>p.svg.includes('@font-face')&&p.svg.includes('IBM Plex')));
  assert(!magazine.pages.some(p=>/font-family="(?:Arial|Georgia)|Â·|· Version \d/.test(p.svg)));
  const pdfFile=path.join(directory,'issue.pdf');fs.writeFileSync(pdfFile,Buffer.from(result.pdf,'base64'));fs.writeFileSync(path.join(directory,'magazine.json'),JSON.stringify(magazine));
  for(let index=0;index<magazine.pages.length;index++)fs.writeFileSync(path.join(directory,`page-${String(index+1).padStart(2,'0')}.svg`),magazine.pages[index].svg);
  const reading=[];
  for(const width of[1920,1280,768,375,280]){
   await page.setViewportSize({width,height:1080});await page.evaluate(()=>document.querySelector('main.mot').scrollTop=0);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`Global overflow ${width}`);
   if(width<=1000){const jacket=await page.locator('#issue-jacket .mot-issue-paper').evaluate(paper=>{const front=paper.querySelector('.front'),back=paper.querySelector('figure:not(.front)');return{front:front.getBoundingClientRect().top,back:back.getBoundingClientRect().top};});assert(jacket.front<jacket.back,`Front cover must precede the back cover when pages stack at ${width}px`);}
   if(width<=600){const cover=await page.locator('#issue-jacket .mot-issue-paper').evaluate(paper=>{const image=paper.querySelector('.front img').getBoundingClientRect(),box=paper.getBoundingClientRect(),style=getComputedStyle(paper);return{left:image.left,right:image.right,min:box.left+parseFloat(style.paddingLeft),max:box.right-parseFloat(style.paddingRight)};});assert(cover.left>=cover.min-1&&cover.right<=cover.max+1,`The entire front cover must fit without panning at ${width}px`);}
   await page.screenshot({path:path.join(directory,`studio-${width}.png`)});
   if(width===375||width===280)reading.push({width,...await checkMagazineReading(page,width,directory)});
   if(city==='bangkok'&&width===375)await checkReadingNegativeControls(page,width,directory);
   if([1920,375,280].includes(width))await captureMagazineSpreads(page,width,directory);
  }
  const comparison=[];
  const checked=[...new Set([0,...['feature','plate','style','letters'].map(section=>magazine.pages.findIndex(p=>p.section===section)),magazine.pages.length-1].filter(index=>index>=0))];
  for(const index of checked){
   const prefix=path.join(directory,`proof-${index+1}`);execFileSync(process.env.MOT_PDFTOPPM||'pdftoppm',['-f',String(index+1),'-l',String(index+1),'-singlefile','-png','-scale-to-x','1184','-scale-to-y','1680',pdfFile,prefix],{timeout:15000,stdio:['ignore','pipe','pipe']});
   const raster=fs.readFileSync(prefix+'.png').toString('base64');const pixels=await page.evaluate(async({svg,raster})=>{const load=async src=>{const image=new Image();image.src=src;await image.decode();const canvas=document.createElement('canvas');canvas.width=1184;canvas.height=1680;const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0,1184,1680);return{data:ctx.getImageData(0,0,1184,1680).data,png:canvas.toDataURL('image/png').split(',')[1]};};const a=await load('data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg)),b=await load('data:image/png;base64,'+raster);let diff=0;for(let i=0;i<a.data.length;i+=4)for(let c=0;c<3;c++)diff+=Math.abs(a.data[i+c]-b.data[i+c]);return{mean:diff/(1184*1680*3),png:a.png};},{svg:magazine.pages[index].svg,raster});
   fs.writeFileSync(path.join(directory,`preview-${index+1}.png`),Buffer.from(pixels.png,'base64'));assert(pixels.mean<=4,`Preview/PDF mean mismatch ${pixels.mean}`);comparison.push({page:index+1,mean:pixels.mean});
  }
  const links=execFileSync(process.env.MOT_PDFINFO||'pdfinfo',['-url',pdfFile],{encoding:'utf8'});if(apparel.length)assert(links.includes(`/shop/?city=${city}`));
  let offlineRoundTrip;
  if(city==='bangkok'){
   const packageResult=await page.evaluate(async()=>{const artifact=await window.motTrip.exportArtifact('zip');const bytes=new Uint8Array(await(await fetch(artifact.url)).arrayBuffer());let text='';for(const byte of bytes)text+=String.fromCharCode(byte);return btoa(text);});
   const packageFile=path.join(directory,'selected-tee.mot.zip');fs.writeFileSync(packageFile,Buffer.from(packageResult,'base64'));
   const cleanContext=await browser.newContext({viewport:{width:1280,height:1000}}),clean=await cleanContext.newPage();
   try{
    await clean.goto(origin+'/?view=trip',{waitUntil:'domcontentloaded'});
    await clean.evaluate(async({fixture})=>{const store=await import('/src/trip/trip-store.ts');const trip=await store.openTrip('r4-offline-staging',{title:'Offline staging',city:fixture.name,cityId:fixture.cityId,countryCode:fixture.countryCode,timeZone:null});await trip.whenSaved();trip.destroy();},{fixture});
    await clean.reload({waitUntil:'domcontentloaded'});await clean.getByRole('navigation',{name:'Trip views'}).waitFor();
    await clean.evaluate(async()=>{await import('/src/trip/artifacts.ts');});await cleanContext.setOffline(true);
    await clean.locator('input[type="file"]').setInputFiles(packageFile);await clean.waitForFunction(()=>window.motTrip?.probe().boardId!=='r4-offline-staging');
    const actual=await clean.evaluate(async()=>{const receipt=await window.motTrip.exportArtifact('pdf');const bytes=new Uint8Array(await(await fetch(receipt.url)).arrayBuffer());return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(b=>b.toString(16).padStart(2,'0')).join('');});
    const expected=crypto.createHash('sha256').update(fs.readFileSync(pdfFile)).digest('hex');assert.equal(actual,expected,'Chosen-tee PDF changed after clean offline ZIP reopen');offlineRoundTrip={byteIdentical:true,sha256:actual};
   }finally{await cleanContext.close();}
  }
  const output={city,pages:magazine.pages.length,sections:magazine.spreads.map(s=>s.section),uniqueEditorialSlots:identities.length,actualPhotos:apparel.length,classificationTransportFixture:true,livePublicationClaim:false,assetChoicesSource:'Explicit caller-supplied FCC art descriptors',notesAreFictional:fixture.notesAreFictional===true,bodyMinimumPx:11,readingMode:'Canonical SVG text wraps to the phone width at 11px or larger; the same spreads may grow taller; fixed A5 export is unchanged',reading,g8NegativeControls:city==='bangkok'?['same-element-overlap','unmarked-overflow','opaque-panel-cover']:[],gates:result.gates,comparison,chosenTee:mono?.assetId,postcardFlip:await flip.count()>0,offlineRoundTrip,pdfBytes:fs.statSync(pdfFile).size,sha256:crypto.createHash('sha256').update(fs.readFileSync(pdfFile)).digest('hex'),errors};
  output.pageIdentity={url:page.url(),title:await page.title()};output.consoleMessages=consoleMessages;
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(directory,'result.json'),JSON.stringify(output,null,2));console.log(JSON.stringify(output));
 }catch(error){await page.screenshot({path:path.join(directory,'failure.png')}).catch(()=>{});throw error;}finally{await browser.close();}
})().catch(e=>{console.error(e.stack);process.exitCode=1;});

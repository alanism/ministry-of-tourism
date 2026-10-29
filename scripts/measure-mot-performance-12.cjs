// Local production preview, real native package and actual PDF bytes. No provider calls.
const {chromium}=require(process.env.MOT_PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {createTripThroughDestination}=require('./mot-browser-contracts.cjs');
const origin=process.env.MOT_TEST_ORIGIN||'http://127.0.0.1:5206',out=process.env.MOT_EVIDENCE_DIR,input=process.env.MOT_PERFORMANCE_INPUT;
assert(out&&input,'Supply MOT_EVIDENCE_DIR and MOT_PERFORMANCE_INPUT.');fs.mkdirSync(out,{recursive:true});
const samples=Number(process.env.MOT_PERFORMANCE_SAMPLES||3);assert(Number.isSafeInteger(samples)&&samples>=1&&samples<=5);
const profiles=[{id:'desktop',viewport:{width:1440,height:1000},cpu:1},{id:'phone-chromium-emulation',viewport:{width:393,height:852},cpu:4,network:{offline:false,latency:150,downloadThroughput:1.6*1024*1024/8,uploadThroughput:750*1024/8}}];
const report={sourceRevision:process.env.MOT_SOURCE_REVISION||'working-tree',environment:'Local production Vite preview; app loaded and QA package imported before throttling',host:{platform:os.platform(),release:os.release(),cpu:os.cpus()[0].model,logicalCpus:os.cpus().length,memoryBytes:os.totalmem()},fixture:JSON.parse(fs.readFileSync(input+'.json','utf8')),budgets:{firstViewMs:4000,cachedViewMs:2000,pdf12pagesMs:60000},physicalIosMeasured:false,coldAppStartupMeasured:false,samplesPerProfile:samples,runs:[]};
assert.equal(crypto.createHash('sha256').update(fs.readFileSync(input)).digest('hex'),report.fixture.sha256);
const save=()=>fs.writeFileSync(path.join(out,'performance-12.json'),JSON.stringify(report,null,2)+'\n');
(async()=>{const browser=await chromium.launch({headless:true,chromiumSandbox:true});
try{
 report.browser=browser.version();
 for(const profile of profiles){
  const context=await browser.newContext({viewport:profile.viewport,hasTouch:profile.cpu>1,deviceScaleFactor:profile.cpu>1?3:1,acceptDownloads:true}),page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));await page.goto(origin+'/?view=trip');await createTripThroughDestination(page,{city:'Kyoto',country:'Japan',registry:true});
  const previous=await page.evaluate(()=>window.motTrip.probe().boardId);await page.locator('input[type="file"]').setInputFiles(input);await page.waitForFunction(id=>window.motTrip?.probe().boardId!==id,previous);await page.evaluate(()=>window.motTrip.persist());
  const before=await page.evaluate(()=>window.motTrip.read()),cdp=await context.newCDPSession(page);await cdp.send('Network.enable');await cdp.send('Network.setCacheDisabled',{cacheDisabled:true});await cdp.send('Emulation.setCPUThrottlingRate',{rate:profile.cpu});if(profile.network)await cdp.send('Network.emulateNetworkConditions',profile.network);
  const artView=async()=>{const start=await page.evaluate(()=>performance.now());await page.locator('button[aria-label="Add"][aria-haspopup="menu"]').click();await page.getByRole('menuitem',{name:'FCC art',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Add FCC art'});await dialog.getByRole('button',{name:/^Preview /}).first().waitFor();const gridMs=await page.evaluate(start=>performance.now()-start,start);await dialog.locator('.artwork-preview img').first().evaluate(image=>image.decode());const decodedMs=await page.evaluate(start=>performance.now()-start,start);await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});return{gridMs,decodedMs,imageDecoded:true};};
  const first=await artView();await cdp.send('Network.setCacheDisabled',{cacheDisabled:false});const cached=await artView();
  const run={profile,first,cached,pdf:[],firstWithinBudget:first.decodedMs<=4000,cachedWithinBudget:cached.decodedMs<=2000,errors};report.runs.push(run);save();console.log(JSON.stringify({profile:profile.id,firstMs:first.decodedMs,cachedMs:cached.decodedMs}));
  await page.getByRole('navigation',{name:'Trip views'}).getByRole('button',{name:'Export',exact:true}).click();
  const card=page.getByRole('article',{name:'Magazine PDF',exact:true});await card.locator('.mot-export-mini img').first().waitFor();
  await page.evaluate(()=>{window.__pdfProgress=[];const root=document.querySelector('[aria-label="Magazine PDF"]');window.__pdfObserver=new MutationObserver(()=>{const text=root.querySelector('.mot-export-steps')?.textContent;if(text&&window.__pdfProgress.at(-1)!==text)window.__pdfProgress.push(text);});window.__pdfObserver.observe(root,{subtree:true,childList:true,characterData:true});});
  for(let index=0;index<samples;index++){
    await page.evaluate(()=>window.__pdfProgress=[]);const start=await page.evaluate(()=>performance.now());await card.getByRole('button',{name:index?'Export again':'Export PDF',exact:true}).click();
    await card.getByText(/^Download ready/).waitFor({timeout:120000});
    const receipt=JSON.parse(await card.locator('.mot-export-agent pre').first().textContent());
    const pdf=await page.evaluate(async({receipt,start})=>{const bytes=new Uint8Array(await(await fetch(receipt.url)).arrayBuffer()),milliseconds=performance.now()-start,text=new TextDecoder('latin1').decode(bytes);return{milliseconds,pages:(text.match(/\/Type \/Page\b/g)||[]).length,bytes:bytes.length,sha256:[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(byte=>byte.toString(16).padStart(2,'0')).join(''),progress:window.__pdfProgress};},{receipt,start});
    assert.equal(pdf.pages,12,'Count actual PDF page objects, never assume the target size.');assert.equal(pdf.bytes,receipt.bytes);assert.equal(pdf.sha256,receipt.sha256);assert(pdf.progress.some(text=>/pages/.test(text)));assert(pdf.progress.every(text=>!/\d\s*%/.test(text)));
    run.pdf.push({...pdf,receipt,sample:index+1,withinBudget:pdf.milliseconds<=60000});save();console.log(JSON.stringify({profile:profile.id,sample:index+1,pages:pdf.pages,pdfMs:pdf.milliseconds,bytes:pdf.bytes,withinBudget:pdf.milliseconds<=60000}));
    if(!index){const event=page.waitForEvent('download');await card.getByRole('button',{name:'Download',exact:true}).click();await(await event).saveAs(path.join(out,`performance-12-${profile.id}.pdf`));}
  }
  await page.screenshot({path:path.join(out,`performance-${profile.id}.png`)});assert.deepEqual(await page.evaluate(()=>window.motTrip.read()),before);assert.deepEqual(errors,[]);await context.close();
 }
 report.allWithinBudget=report.runs.every(run=>run.firstWithinBudget&&run.cachedWithinBudget&&run.pdf.every(pdf=>pdf.withinBudget));save();console.log(JSON.stringify({allWithinBudget:report.allWithinBudget,physicalIosMeasured:false}));if(!report.allWithinBudget)process.exitCode=2;
}finally{await browser.close();}})().catch(error=>{report.failure=error.message;save();console.error(error.stack);process.exitCode=1;});

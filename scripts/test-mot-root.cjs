// MoT owns the homepage before any document/persistence hook mounts.
const {chromium}=require(process.env.MOT_PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {createTripThroughDestination}=require('./mot-browser-contracts.cjs');
const origin=process.env.MOT_TEST_ORIGIN||'http://127.0.0.1:5206',out=process.env.MOT_EVIDENCE_DIR;
assert(out,'Supply MOT_EVIDENCE_DIR');fs.mkdirSync(out,{recursive:true});
(async()=>{const browser=await chromium.launch({headless:true,chromiumSandbox:true}),runs=[];try{
 for(const width of [1440,375]){
  const context=await browser.newContext({viewport:{width,height:1000}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin+'/');try{await page.getByRole('button',{name:'Make this my trip',exact:true}).waitFor({timeout:3000});}catch(error){await page.screenshot({path:path.join(out,`root-failed-${width}.png`)});throw error;}
  assert.match(await page.title(),/MOT|Ministry of Tourism/);assert.equal(new URL(page.url()).search,'');assert.equal(await page.evaluate(()=>!!window.writersBoard),false);
  assert.equal(await page.locator('link[rel="alternate"][type="text/markdown"]').getAttribute('href'),'/trip-agents.md');assert.match(await page.locator('.agent-notes-body').textContent(),/Ministry of Tourism: trip agent contract/);assert.match(await(await page.request.get(origin+'/llms.txt')).text(),/# Ministry of Tourism/);
  assert(!(await page.evaluate(async()=>(await indexedDB.databases()).map(db=>db.name))).some(name=>name?.startsWith('writers-board:')));
  await page.screenshot({path:path.join(out,`root-entry-${width}.png`)});await createTripThroughDestination(page,{city:'Bilbao'});await page.waitForFunction(()=>window.motTrip?.read().meta.city==='Bilbao');assert.deepEqual((await page.evaluate(()=>window.motTrip.read())).cards,[]);
  await page.evaluate(()=>window.motTrip.persist());const boardId=await page.evaluate(()=>window.motTrip.probe().boardId);await page.reload();await page.waitForFunction(id=>window.motTrip?.probe().boardId===id,boardId);assert.equal(new URL(page.url()).search,'');assert.equal(await page.evaluate(()=>!!window.writersBoard),false);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);assert.deepEqual(errors,[]);
  await page.screenshot({path:path.join(out,`root-board-${width}.png`)});runs.push({width,rootTravelEntry:true,noHiddenWriter:true,newBoardEmpty:true,savedTripReopened:true,noQueryRequired:true,errors});await context.close();
 }
 fs.writeFileSync(path.join(out,'root-result.json'),JSON.stringify({pass:true,runs},null,2)+'\n');console.log(JSON.stringify({pass:true,widths:runs.map(r=>r.width)}));
}finally{await browser.close();}})().catch(error=>{console.error(error.stack);process.exitCode=1;});

// Separate injected-fault check; synthetic browser profile with a caller-supplied licensed QA trip.
const {chromium}=require(process.env.MOT_PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {createTripThroughDestination}=require('./mot-browser-contracts.cjs');
const origin=process.env.MOT_TEST_ORIGIN||'http://127.0.0.1:5199',out=process.env.MOT_EVIDENCE_DIR,input=process.env.MOT_PERFORMANCE_INPUT;
assert(out&&input,'Supply MOT_EVIDENCE_DIR and MOT_PERFORMANCE_INPUT.');fs.mkdirSync(out,{recursive:true});
(async()=>{
  const browser=await chromium.launch({headless:true,chromiumSandbox:true}),runs=[];
  try{
    for(const profile of [{id:'desktop',width:1440,height:1000,cpu:1},{id:'phone-chromium-emulation',width:393,height:852,cpu:4}]){
      const context=await browser.newContext({viewport:{width:profile.width,height:profile.height},hasTouch:profile.cpu>1}),page=await context.newPage(),errors=[];
      page.on('pageerror',error=>errors.push(error.message));
      try{
        await page.goto(origin+'/?view=trip');await createTripThroughDestination(page,{city:'Kyoto',country:'Japan',registry:true});
        const previous=await page.evaluate(()=>window.motTrip.probe().boardId);await page.locator('input[type="file"]').setInputFiles(input);await page.waitForFunction(id=>window.motTrip.probe().boardId!==id,previous);
        await page.getByRole('navigation',{name:'Trip views'}).getByRole('button',{name:'Export',exact:true}).click();
        const card=page.getByRole('article',{name:'Magazine PDF',exact:true});await card.locator('.mot-export-mini img').first().waitFor();
        const before=await page.evaluate(()=>window.motTrip.read()),cdp=await context.newCDPSession(page);await cdp.send('Emulation.setCPUThrottlingRate',{rate:profile.cpu});
        await page.evaluate(()=>{
          const original=window.createImageBitmap;window.__bitmapFault={next:true,began:false,closed:0};
          window.createImageBitmap=function(...args){if(!window.__bitmapFault.next)return original.apply(this,args);window.__bitmapFault.next=false;window.__bitmapFault.began=true;return new Promise(resolve=>{window.__bitmapFault.release=async()=>{const image=await original.apply(window,args),close=image.close.bind(image);image.close=()=>{window.__bitmapFault.closed++;close()};resolve(image)}})};
        });
        await card.getByRole('button',{name:'Export PDF',exact:true}).click();await page.waitForFunction(()=>window.__bitmapFault.began);
        const start=await page.evaluate(()=>performance.now());await card.getByRole('button',{name:'Cancel PDF',exact:true}).click();await card.getByText('Export cancelled',{exact:true}).waitFor({timeout:1000});
        const cancellationMs=await page.evaluate(start=>performance.now()-start,start);assert(cancellationMs<1000);
        await page.evaluate(()=>window.__bitmapFault.release());await page.waitForFunction(()=>window.__bitmapFault.closed===1);
        assert.equal(await card.getByRole('button',{name:'Download',exact:true}).count(),0);assert.equal(await page.getByRole('region',{name:'Kept exports'}).locator('li').count(),0);
        assert.deepEqual(await page.evaluate(()=>window.motTrip.read()),before);await page.screenshot({path:path.join(out,`bitmap-cancelled-${profile.id}.png`)});
        await card.getByRole('button',{name:'Start again',exact:true}).click();await card.getByText(/^Download ready/).waitFor({timeout:120000});
        const receipt=JSON.parse(await card.locator('.mot-export-agent pre').first().textContent()),actual=await page.evaluate(async receipt=>{const bytes=new Uint8Array(await(await fetch(receipt.url)).arrayBuffer());return{bytes:bytes.length,pages:(new TextDecoder('latin1').decode(bytes).match(/\/Type \/Page\b/g)||[]).length,sha256:[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(v=>v.toString(16).padStart(2,'0')).join('')}} ,receipt);
        assert.equal(actual.pages,12);assert.equal(actual.bytes,receipt.bytes);assert.equal(actual.sha256,receipt.sha256);assert.deepEqual(await page.evaluate(()=>window.motTrip.read()),before);assert.deepEqual(errors,[]);
        runs.push({profile,cancellationMs,lateBitmapClosedOnce:true,noLateFile:true,boardUnchanged:true,receipt,actual,errors});
        fs.writeFileSync(path.join(out,'bitmap-cancellation.json'),JSON.stringify({faultInjected:true,physicalIosMeasured:false,normalTimingSample:false,runs},null,2));console.log(JSON.stringify({profile:profile.id,cancellationMs,lateBitmapClosedOnce:true,recoveryPages:actual.pages}));
      }finally{await context.close()}
    }
  }finally{await browser.close()}
})().catch(error=>{console.error(error.stack);process.exitCode=1});

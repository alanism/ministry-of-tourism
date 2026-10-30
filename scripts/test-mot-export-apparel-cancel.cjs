// Injected decoder fault over unchanged published FCC garment bytes; no timing-budget claim.
const {chromium}=require(process.env.MOT_PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {createTripThroughDestination}=require('./mot-browser-contracts.cjs');
const origin=process.env.MOT_TEST_ORIGIN,out=process.env.MOT_EVIDENCE_DIR,city='san-sebastian';
assert(origin&&out,'Supply MOT_TEST_ORIGIN and MOT_EVIDENCE_DIR.');fs.mkdirSync(out,{recursive:true});
const raw=JSON.parse(fs.readFileSync(path.join(__dirname,'../apps/web/public/artwork/fcc',city,'apparel.json'),'utf8'));
const roles=['apparel-brush','apparel-map-mono','apparel-map-color'];
const garments=raw.items.map(item=>item.artRef).filter(art=>roles.includes(art.role)).sort((a,b)=>roles.indexOf(a.role)-roles.indexOf(b.role));
assert.equal(garments.length,3);const first=garments[0],urls=garments.map(art=>art.originalUrl??art.renditionUrl);
(async()=>{const browser=await chromium.launch({headless:true,chromiumSandbox:true}),runs=[];try{
  for(const width of [1440,375]){
    const context=await browser.newContext({viewport:{width,height:1000},hasTouch:width===375}),page=await context.newPage(),errors=[],warnings=[],requests=[];
    page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(['error','warning'].includes(m.type()))warnings.push(m.text());});
    page.on('request',r=>{if(urls.includes(r.url()))requests.push(r.url());});
    try{
      await page.goto(origin+'/?view=trip');await page.getByRole('button',{name:'Make this my trip',exact:true}).waitFor();assert.match(await page.title(),/MOT|Ministry of Tourism/);
      await createTripThroughDestination(page,{city:'San Sebastián',country:'Spain',registry:true});
      await page.getByLabel('New card title').fill('Garment export cancellation control');await page.getByRole('button',{name:'Add card',exact:true}).click();await page.evaluate(()=>window.motTrip.persist());
      await page.getByRole('navigation',{name:'Trip views'}).getByRole('button',{name:'Export',exact:true}).click();
      const card=page.getByRole('article',{name:'Magazine PDF',exact:true});await card.locator('.mot-export-mini img').first().waitFor({timeout:30000});
      const before=await page.evaluate(()=>window.motTrip.read()),baselineRequests=requests.length;
      await page.evaluate(()=>{
        const original=window.createImageBitmap;window.__garmentFault={armed:true,began:false,closed:0};
        window.createImageBitmap=function(blob,...args){
          if(!window.__garmentFault.armed)return original.call(this,blob,...args);
          const fault=window.__garmentFault;fault.armed=false;fault.began=true;fault.blob=blob;
          return new Promise((resolve,reject)=>{fault.release=()=>original.call(window,blob,...args).then(image=>{fault.dimensions={width:image.width,height:image.height};const close=image.close.bind(image);image.close=()=>{fault.closed++;close();};resolve(image);},reject);});
        };
      });
      await card.getByRole('button',{name:'Export PDF',exact:true}).click();await page.waitForFunction(()=>window.__garmentFault.began);
      const decodedInput=await page.evaluate(async()=>{const blob=window.__garmentFault.blob;return{mime:blob.type,bytes:blob.size,sha256:[...new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer()))].map(v=>v.toString(16).padStart(2,'0')).join('')};});
      assert.equal(decodedInput.mime,first.mimeType);assert.equal(decodedInput.sha256,first.hash);assert.equal(requests.length-baselineRequests,1);assert.equal(requests.at(-1),urls[0]);
      const start=await page.evaluate(()=>performance.now());await card.getByRole('button',{name:'Cancel PDF',exact:true}).click();await card.getByText('Export cancelled',{exact:true}).waitFor({timeout:1000});
      const cancellationMs=await page.evaluate(start=>performance.now()-start,start);assert(cancellationMs<1000);
      await page.evaluate(()=>window.__garmentFault.release());await page.waitForFunction(()=>window.__garmentFault.closed===1);
      const dimensions=await page.evaluate(()=>window.__garmentFault.dimensions);assert.deepEqual(dimensions,{width:first.width,height:first.height});
      assert.equal(requests.length-baselineRequests,1);assert.equal(await card.getByRole('button',{name:'Download',exact:true}).count(),0);assert.equal(await page.getByRole('region',{name:'Kept exports'}).locator('li').count(),0);assert.deepEqual(await page.evaluate(()=>window.motTrip.read()),before);
      await page.screenshot({path:path.join(out,'cancelled-'+width+'.png')});
      await card.getByRole('button',{name:'Start again',exact:true}).click();await card.getByText(/^Download ready/).waitFor({timeout:60000});
      const receipt=JSON.parse(await card.locator('.mot-export-agent pre').first().textContent());
      const actual=await page.evaluate(async receipt=>{const bytes=new Uint8Array(await(await fetch(receipt.url)).arrayBuffer()),text=new TextDecoder('latin1').decode(bytes);return{bytes:bytes.length,sha256:[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(v=>v.toString(16).padStart(2,'0')).join(''),pages:(text.match(/\/Type \/Page\b/g)||[]).length,shopLinks:(text.match(/\/URI \(https:\/\/foreignclubberscorespondence\.web\.app\/shop\/\?city=san-sebastian\)/g)||[]).length};},receipt);
      assert.equal(actual.bytes,receipt.bytes);assert.equal(actual.sha256,receipt.sha256);assert(actual.pages>0);assert.equal(actual.shopLinks,2);
      for(const url of urls)assert(requests.slice(baselineRequests+1).includes(url));
      const downloadPending=page.waitForEvent('download');await card.getByRole('button',{name:'Download',exact:true}).click();const download=await downloadPending;assert.equal(download.suggestedFilename(),receipt.filename);const target=path.join(out,width+'-'+receipt.filename);await download.saveAs(target);assert.equal(fs.statSync(target).size,receipt.bytes);
      assert.deepEqual(await page.evaluate(()=>window.motTrip.read()),before);assert.equal(await page.locator('vite-error-overlay').count(),0);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(errors,[]);assert.deepEqual(warnings,[]);
      await page.screenshot({path:path.join(out,'recovered-'+width+'.png')});
      runs.push({width,phoneEmulation:width===375,cancellationMs,decodedInput,dimensions,lateBitmapClosedOnce:true,noLateFile:true,noNextGarmentAfterCancel:true,boardUnchanged:true,receipt,actual,downloadFilename:download.suggestedFilename(),errors,warnings});
      fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({actualPublishedMedia:true,faultInjected:true,normalTimingSample:false,physicalPhoneMeasured:false,browserPlugin:'not available; sandboxed Playwright fallback',source:{assetId:first.assetId,originCityId:first.originCityId,credit:first.credit,rightsStatus:first.rightsStatus,source:first.source},runs},null,2));
      console.log(JSON.stringify({width,cancellationMs,lateBitmapClosedOnce:true,pages:actual.pages,bytes:actual.bytes}));
    }finally{await context.close();}
  }
}finally{await browser.close();}})().catch(error=>{console.error(error.stack);process.exitCode=1;});

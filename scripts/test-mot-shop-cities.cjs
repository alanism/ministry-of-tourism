// Read-only live shop routing. Images are blocked; this check makes no photo/stock/payment claim.
const {chromium}=require(process.env.MOT_PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const cities=JSON.parse(fs.readFileSync(path.join(__dirname,'../apps/web/public/fcc/destinations.json'),'utf8')).cities;
const begin=Number(process.argv[2]??0),end=Number(process.argv[3]??Math.min(begin+10,cities.length)),selected=cities.slice(begin,end);
const out=process.env.MOT_EVIDENCE_DIR||require('node:os').tmpdir();fs.mkdirSync(out,{recursive:true});
(async()=>{
 const started=Date.now(),browser=await chromium.launch({headless:true,chromiumSandbox:true,args:['--disable-webgl']});
 try{
  const context=await browser.newContext();await context.route('**/*',route=>['image','media','font'].includes(route.request().resourceType())?route.abort():route.continue());
  let next=0;const results=new Array(selected.length);
  await Promise.all(Array.from({length:4},async()=>{const page=await context.newPage();try{while(next<selected.length){const i=next++,city=selected[i];
   try{await page.goto('https://foreignclubberscorespondence.web.app/shop/?city='+city.id,{waitUntil:'domcontentloaded',timeout:20000});await page.waitForFunction(()=>window.fccShop&&document.querySelector('#city-switch')?.options.length===200,undefined,{timeout:15000});
    results[i]=await page.evaluate(expected=>({expected,selected:document.querySelector('#city-switch').value,url:location.href}),city.id);
   }catch(e){results[i]={expected:city.id,error:e.message};process.stderr.write(city.id+': '+e.message+'\n');}
   fs.writeFileSync(path.join(out,`shop-${begin}-${end}-progress.json`),JSON.stringify({elapsedMs:Date.now()-started,results:results.filter(Boolean)},null,2));
  }}finally{await page.close();}}));
  const failed=results.filter(r=>r.error||r.expected!==r.selected),receipt={begin,end,checked:results.length,failed,results,imagesBlocked:true,webglDisabled:true,elapsedMs:Date.now()-started,checkedAt:new Date().toISOString()};
  fs.writeFileSync(path.join(out,`shop-${begin}-${end}.json`),JSON.stringify(receipt,null,2));assert.deepEqual(failed,[],'Every city must select itself in the real rendered shop');
 }finally{await browser.close();}
})().catch(e=>{process.stderr.write(e.stack);process.exitCode=1;});

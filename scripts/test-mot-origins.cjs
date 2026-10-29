// Real-browser origin test. Source URLs are explicit; no mocks can establish a release pass.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const {createHash} = require('node:crypto');
const {once} = require('node:events');
const FCC_HOST='foreignclubberscorespondence.web.app';
const playwright=()=>require(process.env.MOT_PLAYWRIGHT_MODULE||'playwright');
async function server(handler) {const instance=http.createServer(handler);instance.listen(0,'127.0.0.1');await once(instance,'listening');return {instance,origin:`http://127.0.0.1:${instance.address().port}`};}
const closeServer=instance=>new Promise((resolve,reject)=>instance.close(error=>error?reject(error):resolve()));

async function negativeCorsTest(browser) {
  let png=Buffer.alloc(0);
  const origin=await server((request,response)=>{response.setHeader('Content-Type','text/html');response.end('<!doctype html><title>CORS test fixture</title>');});
  const asset=await server((request,response)=>{if(request.url==='/image?cors=1')response.setHeader('Access-Control-Allow-Origin','*');response.setHeader('Content-Type','image/png');response.end(png);});
  const context=await browser.newContext();
  try {
    const page=await context.newPage();await page.goto(origin.origin);
    png=Buffer.from(await page.evaluate(()=>{const canvas=document.createElement('canvas');canvas.width=8;canvas.height=8;const ctx=canvas.getContext('2d');ctx.fillStyle='#cc0000';ctx.fillRect(0,0,8,8);return canvas.toDataURL('image/png').split(',')[1];}),'base64');
    const outcome=await page.evaluate(async assetOrigin=>{
      let fetchBlocked=false,canvasBlocked=false;
      try{await fetch(`${assetOrigin}/image`,{credentials:'omit'});}catch{fetchBlocked=true;}
      const image=new Image();image.src=`${assetOrigin}/image`;await image.decode();
      const canvas=document.createElement('canvas');canvas.width=8;canvas.height=8;canvas.getContext('2d').drawImage(image,0,0);
      try{canvas.toDataURL('image/png');}catch(error){canvasBlocked=error.name==='SecurityError';}
      const allowed=await fetch(`${assetOrigin}/image?cors=1`,{credentials:'omit'});
      const bitmap=await createImageBitmap(await allowed.blob());
      const clean=document.createElement('canvas');clean.width=8;clean.height=8;clean.getContext('2d').drawImage(bitmap,0,0);bitmap.close();
      return {fetchBlocked,canvasBlocked,positiveControl:clean.toDataURL('image/png').length>30};
    },asset.origin);
    assert.deepEqual(outcome,{fetchBlocked:true,canvasBlocked:true,positiveControl:true});
    return outcome;
  } finally {await context.close();await Promise.all([closeServer(origin.instance),closeServer(asset.instance)]);}
}
function settings() {
  const origin=new URL(process.env.MOT_TEST_ORIGIN||'missing:');
  if (!['https:','http:'].includes(origin.protocol)||origin.username||origin.password||origin.pathname!=='/'||origin.search||origin.hash) throw new Error('MOT_TEST_ORIGIN must be the exact dev, preview, or production origin (no path, query or credentials).');
  const resources={feed:process.env.MOT_FCC_FEED_URL,manifest:process.env.MOT_FCC_MANIFEST_URL,art:process.env.MOT_FCC_ART_URL};
  for(const [kind,value] of Object.entries(resources)) {
    if(!value)throw new Error(`MOT_FCC_${kind.toUpperCase()}_URL is required; no source path is guessed.`);
    const url=new URL(value);
    if(url.protocol!=='https:'||url.hostname!==FCC_HOST||url.username||url.password)throw new Error(`${kind} must be a public HTTPS resource on ${FCC_HOST}.`);
  }
  return {origin:origin.origin,resources};
}
async function testOrigin(browser,config) {
  const context=await browser.newContext({viewport:{width:1440,height:1000}});
  const output=process.env.MOT_EVIDENCE_DIR||fs.mkdtempSync(path.join(os.tmpdir(),'mot-origin-evidence-'));
  fs.mkdirSync(output,{recursive:true});
  const errors=[];
  try {
    const page=await context.newPage();page.setDefaultTimeout(12000);page.on('pageerror',error=>errors.push(error.message));
    await page.goto(`${config.origin}/?view=trip`,{waitUntil:'domcontentloaded',timeout:15000});
    if(!await page.evaluate(()=>!!window.motTrip?.probe()?.boardId)) {
      await page.getByRole('button',{name:'Make this my trip',exact:true}).click();
      await page.getByPlaceholder('City, or another name for it').fill(process.env.MOT_TEST_CITY||'San Sebastián');
      await page.getByRole('option').filter({hasText:'as you typed it'}).click();
      await page.getByPlaceholder('Search countries by name').fill(process.env.MOT_TEST_COUNTRY||'Spain');
      await page.getByRole('button',{name:process.env.MOT_TEST_COUNTRY||'Spain',exact:true}).click();
      await page.getByRole('button',{name:'Create trip',exact:true}).click();
    }
    await page.waitForFunction(()=>!!window.motTrip?.probe()?.boardId);
    const fetched=await page.evaluate(async resources=>{
      const read=async url=>{try{return await fetch(url,{credentials:'omit',signal:AbortSignal.timeout(12000)});}catch{throw new Error(`Public FCC fetch blocked or unavailable: ${url}`);}};
      const json=async url=>{const response=await read(url);if(!response.ok)throw new Error(`Source HTTP ${response.status}: ${url}`);const value=await response.json();if(!value||typeof value!=='object')throw new Error('Source JSON is not an object');return {url,status:response.status,bytes:new TextEncoder().encode(JSON.stringify(value)).byteLength};};
      const [feed,manifest]=await Promise.all([json(resources.feed),json(resources.manifest)]);
      const response=await read(resources.art);if(!response.ok)throw new Error(`Artwork HTTP ${response.status}: ${resources.art}`);
      const blob=await response.blob();const bitmap=await createImageBitmap(blob);const width=bitmap.width,height=bitmap.height;
      const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;canvas.getContext('2d').drawImage(bitmap,0,0);bitmap.close();
      const encoded=canvas.toDataURL('image/png');if(encoded==='data:,'||encoded.length<40)throw new Error('Canvas export contains no image bytes');
      const original=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=reject;reader.readAsDataURL(blob);});
      return {feed,manifest,art:{url:resources.art,status:response.status,mime:blob.type,bytes:blob.size,width,height,canvasBytes:encoded.length},original};
    },config.resources);
    const before=await page.evaluate(()=>window.motTrip.probe());
    const title='FCC origin proof';
    await page.evaluate(({title,url})=>{const api=window.motTrip,{boardId,revision}=api.probe();api.execute({boardId,revision,ops:[{command:'trip_card_create',input:{kind:'photo',title,body:url}}]});},{title,url:config.resources.art});
    await page.getByRole('button',{name:`Actions for ${title}`,exact:true}).click();
    const choosing=page.waitForEvent('filechooser');
    await page.getByRole('menuitem',{name:'Add photo',exact:true}).click();
    const original=Buffer.from(fetched.original,'base64');delete fetched.original;
    await (await choosing).setFiles({name:'fcc-original.png',mimeType:fetched.art.mime,buffer:original});
    const originalSha256=createHash('sha256').update(original).digest('hex');
    await page.waitForFunction(hash=>window.motTrip.read().assets.some(asset=>asset.hash===hash),originalSha256);
    await page.getByText('Photo added',{exact:true}).waitFor();
    await page.evaluate(()=>window.motTrip.persist());
    await page.reload({waitUntil:'domcontentloaded',timeout:15000});
    await page.waitForFunction(hash=>window.motTrip?.read().assets.some(asset=>asset.hash===hash),originalSha256);
    const stored=await page.evaluate(()=>window.motTrip.read());
    assert.equal(stored.assets.length,1);assert.equal(stored.assets[0].hash,originalSha256);
    assert.ok(!/blob:|[?&](?:token|expires|signature)=/i.test(JSON.stringify(stored)),'Document media must use hashes or stable URLs');
    await page.locator('.m-card-photo img').waitFor();
    await page.waitForFunction(()=>[...document.querySelectorAll('.m-card-photo img')].some(image=>image.complete&&image.naturalWidth>0));
    const probe=await page.evaluate(()=>window.motTrip.probe());
    const exported=await page.evaluate(async()=>{const artifact=await window.motTrip.exportArtifact('pdf');const blob=await(await fetch(artifact.url)).blob();const base64=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=reject;reader.readAsDataURL(blob);});const {url,coverSvg,...receipt}=artifact;return {base64,receipt};});
    const bytes=Buffer.from(exported.base64,'base64');fs.writeFileSync(path.join(output,'art-containing-trip.pdf'),bytes);
    const receipt=exported.receipt;
    const pdfText=bytes.toString('latin1');
    assert.equal(bytes.subarray(0,5).toString(),'%PDF-');assert.ok(pdfText.includes('/Subtype /Image'));assert.ok(!/\/Count\s+0\b/.test(pdfText));
    assert.equal(receipt.mime,'application/pdf');assert.equal(receipt.byteCount,bytes.length);assert.equal(receipt.revision,probe.revision);assert.equal(receipt.inventory.assets,1);
    assert.equal(receipt.sha256,createHash('sha256').update(bytes).digest('hex'));
    assert.equal(receipt.boardId,before.boardId);assert.ok(receipt.revision>before.revision,'Artwork must change the visible TripSession');
    await page.screenshot({path:path.join(output,'trip-origin.png')});
    assert.deepEqual(errors,[],'Application errors occurred');
    const result={ok:true,origin:config.origin,at:new Date().toISOString(),title:await page.title(),fetched,storedOriginalSha256:originalSha256,persistedAndReopened:true,receipt,runtimeErrors:errors,evidenceDirectory:output};
    return result;
  } finally {await context.close();}
}
async function main() {
  const negativeOnly=process.argv.includes('--negative-self-test');
  const config=negativeOnly?null:settings();
  const browser=await playwright().chromium.launch({headless:true,chromiumSandbox:true});
  let deadline;
  try {
    const negative=await negativeCorsTest(browser);
    if(negativeOnly){console.log(JSON.stringify({ok:true,negative}));return;}
    const result=await Promise.race([testOrigin(browser,config),new Promise((resolve,reject)=>{deadline=setTimeout(()=>reject(new Error('Origin test exceeded its 55-second budget')),55000);})]);
    const receipt={...result,negative};fs.writeFileSync(path.join(result.evidenceDirectory,'origin-result.json'),JSON.stringify(receipt,null,2));console.log(JSON.stringify(receipt,null,2));
  } finally {clearTimeout(deadline);await browser.close();}
}
if(require.main===module)main().catch(error=>{console.error(JSON.stringify({ok:false,error:error.message}));process.exitCode=1;});
module.exports={negativeCorsTest,settings};

// Native PDF text and pixel checks. Evidence stays outside source; needs pypdf and Poppler.
const {chromium}=require(process.env.MOT_PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const started=Date.now(),origin=process.env.MOT_TEST_ORIGIN||'http://127.0.0.1:5191';
const directory=process.env.MOT_EVIDENCE_DIR||path.join(require('node:os').tmpdir(),'mot-pdf-text');
fs.mkdirSync(directory,{recursive:true});
(async()=>{
 const browser=await chromium.launch({headless:true,chromiumSandbox:true}),page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.goto(origin+'/?view=trip');
  const result=await page.evaluate(async()=>{
   const {svgPdfTextLayer}=await import('/src/trip/pdf-text-layer.ts'),{magazinePdf}=await import('/src/trip/artifacts.ts');
   const svg='<svg xmlns="http://www.w3.org/2000/svg" width="1184" height="1680" viewBox="0 0 1184 1680"><rect width="1184" height="1680" fill="white"/><g transform="translate(90 180) rotate(-9)"><text font-family="sans-serif" font-size="48" text-anchor="middle" data-flow-source="UNPRINTED PRIVATE TAIL"><tspan x="300" y="0">San Sebastián · 京都 🧳</tspan><tspan x="300" dy="64">A whole second line.</tspan></text></g><g opacity="0"><text x="90" y="600" font-size="32">HIDDEN PRIVATE TEXT</text></g><text x="1500" y="600">OUTSIDE THE TRIM</text></svg>';
   const runs=await svgPdfTextLayer(svg);
   if(runs.length!==2||runs.some(r=>/PRIVATE|OUTSIDE/.test(r.text)))throw Error('Invisible content leaked to PDF text: '+JSON.stringify(runs));
   const controller=new AbortController();controller.abort();let aborted=false;try{await svgPdfTextLayer(svg,controller.signal);}catch{aborted=true;}if(!aborted)throw Error('Cancelled text preparation continued');
   const issue={title:'San Sebastián — 私の旅',boardId:'text-layer-test',revision:1,pages:[{id:'p1',folio:1,pattern:'personal-cover',svg,assetIds:[],credits:[]}],warnings:[],pictureDpi:[],spreads:[],unusedAssetIds:[]};
   const first=await magazinePdf(issue),second=await magazinePdf(issue);
   const base64=data=>{let s='';for(const v of data)s+=String.fromCharCode(v);return btoa(s);};
   const hash=async data=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',data))].map(v=>v.toString(16).padStart(2,'0')).join('');
   const image=new Image();image.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);await image.decode();const canvas=document.createElement('canvas');canvas.width=1184;canvas.height=1680;canvas.getContext('2d').drawImage(image,0,0);
   return {pdf:base64(first),sameBytes:base64(first)===base64(second),sha256:await hash(first),runs,preview:canvas.toDataURL().split(',')[1],aborted,leakedMeasurementHosts:document.querySelectorAll('body > div[aria-hidden="true"] svg').length};
  });
  fs.writeFileSync(path.join(directory,'unicode.pdf'),Buffer.from(result.pdf,'base64'));
  fs.writeFileSync(path.join(directory,'unicode-preview.png'),Buffer.from(result.preview,'base64'));
  assert(result.sameBytes);assert.equal(result.leakedMeasurementHosts,0);
  const proof=path.join(directory,'unicode-proof');
  execFileSync(process.env.MOT_PDFTOPPM||'pdftoppm',['-singlefile','-png','-scale-to-x','1184','-scale-to-y','1680',path.join(directory,'unicode.pdf'),proof],{timeout:15000,stdio:'pipe'});
  const difference=await page.evaluate(async({a,b})=>{
   const pixels=async data=>{const i=new Image();i.src='data:image/png;base64,'+data;await i.decode();const c=document.createElement('canvas');c.width=1184;c.height=1680;const x=c.getContext('2d');x.drawImage(i,0,0);return x.getImageData(0,0,1184,1680).data;};
   const x=await pixels(a),y=await pixels(b);let sum=0;for(let i=0;i<x.length;i+=4)for(let k=0;k<3;k++)sum+=Math.abs(x[i+k]-y[i+k]);return sum/(1184*1680*3);
  },{a:result.preview,b:fs.readFileSync(proof+'.png').toString('base64')});
  assert(difference<=4,'Text layer altered the raster: '+difference);
  const native=JSON.parse(execFileSync(process.env.MOT_PYTHON||'python',['-c',"from pypdf import PdfReader; import json,sys; r=PdfReader(sys.argv[1]); p=r.pages[0]; print(json.dumps({'text':p.extract_text(),'producer':r.metadata.producer,'title':r.metadata.title,'tagged':'/StructTreeRoot' in r.trailer['/Root'],'paragraphs':len(r.trailer['/Root']['/StructTreeRoot']['/K'][0].get_object()['/K'][0].get_object()['/K'])}))",path.join(directory,'unicode.pdf')],{encoding:'utf8',timeout:15000,stdio:['ignore','pipe','pipe']}));
  assert(native.text.includes('San Sebastián · 京都 🧳'));assert(native.text.includes('A whole second line.'));assert(!/PRIVATE|OUTSIDE/.test(native.text));assert.equal(native.producer,'Ministry of Tourism');assert.equal(native.title,'San Sebastián — 私の旅');assert(native.tagged);assert.equal(native.paragraphs,2);assert.deepEqual(errors,[]);
  await page.route('**/artwork/index.json',r=>r.fulfill({contentType:'application/json',body:JSON.stringify({version:1,styles:[]})}));
  const scoped=await page.evaluate(async coreUrl=>{
   const core=await import(coreUrl),{createTripArtifact,forgetTripArtifact}=await import('/src/trip/artifacts.ts');
   const session=new core.TripSession(core.createTrip({title:'Fictional scope proof',city:'San Sebastián',cityId:'san-sebastian',timeZone:null})),actor={kind:'human',id:'qa',name:'QA'};
   session.execute(actor,'trip_card_create',{kind:'note',title:'PUBLIC CAFÉ NOTE',body:'A shared fictional travel note.',scope:'stay',stage:'remember',provenance:'traveler'});
   session.execute(actor,'trip_card_create',{kind:'note',title:'PRIVATE SECRET SENTINEL',body:'Fictional private material for a privacy regression.',scope:'private',stage:'remember',provenance:'traveler'});
   const output={};try{
    for(const scope of ['shared','personal']){
     const a=await createTripArtifact(session,'pdf',undefined,{includePrivate:scope==='personal'});
     const data=new Uint8Array(await(await fetch(a.url)).arrayBuffer());let s='';for(const b of data)s+=String.fromCharCode(b);output[scope]=btoa(s);await forgetTripArtifact(a.id);
    }
    return output;
   }finally{session.destroy();}
  },'/@fs/'+path.resolve(__dirname,'..').replace(/\\/g,'/')+'/packages/core/src/index.ts');
  for(const [scope,data] of Object.entries(scoped))fs.writeFileSync(path.join(directory,scope+'.pdf'),Buffer.from(data,'base64'));
  const privacy=JSON.parse(execFileSync(process.env.MOT_PYTHON||'python',['-c',"from pypdf import PdfReader; import json,sys; print(json.dumps({k:''.join(p.extract_text() for p in PdfReader(sys.argv[i+1]).pages) for i,k in enumerate(['shared','personal'])}))",path.join(directory,'shared.pdf'),path.join(directory,'personal.pdf')],{encoding:'utf8',timeout:15000,stdio:['ignore','pipe','pipe']}));
  assert(privacy.shared.includes('PUBLIC CAFÉ NOTE'));assert(!privacy.shared.includes('PRIVATE SECRET SENTINEL'));assert(privacy.personal.includes('PRIVATE SECRET SENTINEL'));assert.deepEqual(errors,[]);
  const output={elapsedMs:Date.now()-started,sha256:result.sha256,sameBytes:true,meanRgbDifference:difference,runs:result.runs,native,aborted:result.aborted,sharedPrivateSentinelExcluded:true,explicitPersonalSentinelIncluded:true,errors};
  fs.writeFileSync(path.join(directory,'text-result.json'),JSON.stringify(output,null,2));console.log(JSON.stringify(output));
 }finally{await browser.close();}
})().catch(e=>{console.error(e.stack);process.exitCode=1;});

// Verify the existing R7-1 fix against an actual magazine/PDF output; no layout changes.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
const {chromium}=require(process.env.MOT_PLAYWRIGHT_MODULE||'playwright'),{rasterPdfPage}=require('./mot-pdf-raster.cjs');
const directory=process.argv[2];assert(directory,'Supply the city evidence directory produced by test-mot-magazine.cjs.');const magazine=JSON.parse(fs.readFileSync(path.join(directory,'magazine.json'),'utf8')),pdf=path.join(directory,'issue.pdf');
const python=process.env.MOT_PYTHON||'python',native=JSON.parse(execFileSync(python,['-c',"from pypdf import PdfReader; import json,sys; r=PdfReader(sys.argv[1]); print(json.dumps({'title':r.metadata.title,'producer':r.metadata.producer,'pages':[{'text':p.extract_text(),'links':[str(a.get_object()['/A']['/URI']) for a in p.get('/Annots',[]) if '/URI' in a.get_object().get('/A',{})]} for p in r.pages]}))",pdf],{encoding:'utf8',timeout:15000,stdio:['ignore','pipe','pipe']}));
(async()=>{const browser=await chromium.launch({headless:true,chromiumSandbox:true});try{
 const page=await browser.newPage();await page.goto((process.env.MOT_TEST_ORIGIN||'http://127.0.0.1:5198')+'/?view=trip');const checked=[];assert.equal(native.title,magazine.title);assert.equal(native.producer,'Ministry of Tourism');
 for(const [index,source] of magazine.pages.entries()){
  const text=native.pages[index].text;
  if(source.title?.startsWith('Trip notebook'))assert(!/\[(?:S\d+|C)\]/.test(text),'Unresolved source marker in notebook');
  if(source.title!=='Sources')continue;
  assert(!/https?:\/\//.test(text),'Metadata URL rendered as source-page prose');assert(text.includes('Retrieved'));assert(text.includes('Foreign Clubbers Correspondence'));
  const expected=(source.links||[]).map(link=>link.url).sort();assert(expected.length);assert.deepEqual([...native.pages[index].links].sort(),expected);
  const titles=await page.evaluate(svg=>{const doc=new DOMParser().parseFromString(svg,'image/svg+xml');return[...doc.querySelectorAll('a')].map(a=>[...a.querySelectorAll('tspan')].map(t=>t.textContent).join(' '));},source.svg);
  for(const title of titles)assert(text.replace(/\s+/g,' ').includes(title.replace(/\s+/g,' ')),title);
  const prefix=path.join(directory,`sources-native-${index+1}`);await rasterPdfPage(page,pdf,index+1,prefix);
  const comparison=await page.evaluate(async({svg,raster})=>{const pixels=async src=>{const image=new Image();image.src=src;await image.decode();const canvas=document.createElement('canvas');canvas.width=1184;canvas.height=1680;const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0,1184,1680);return{data:ctx.getImageData(0,0,1184,1680).data,png:canvas.toDataURL('image/png').split(',')[1]};};const a=await pixels('data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg)),b=await pixels('data:image/png;base64,'+raster);let sum=0;for(let i=0;i<a.data.length;i+=4)for(let c=0;c<3;c++)sum+=Math.abs(a.data[i+c]-b.data[i+c]);return{mean:sum/(1184*1680*3),png:a.png};},{svg:source.svg,raster:fs.readFileSync(prefix+'.png').toString('base64')});
  assert(comparison.mean<=4);fs.writeFileSync(path.join(directory,`sources-preview-${index+1}.png`),Buffer.from(comparison.png,'base64'));checked.push({page:index+1,titles,linkCount:expected.length,nativeTargetsMatch:true,noRawMetadataUrls:true,noUnresolvedNotebookMarkers:true,meanRgbDifference:comparison.mean});
 }
 assert(checked.length>0);const result={sourcePages:checked,pageCount:magazine.pages.length,producer:native.producer,title:native.title};fs.writeFileSync(path.join(directory,'source-credits-check.json'),JSON.stringify(result,null,2));process.stdout.write(JSON.stringify(result));
}finally{await browser.close();}})().catch(error=>{process.stderr.write(error.stack);process.exitCode=1;});

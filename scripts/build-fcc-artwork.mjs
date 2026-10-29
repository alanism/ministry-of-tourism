// Metadata only: FCC source remains read-only and image bytes stay on its existing host.
import {readFile,writeFile,mkdir,open} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {createArtRef,readRasterHeader} from './fcc-art-metadata.ts';

const source=process.argv[2];if(!source)throw Error('Pass the FCC The-Aria-Bangkok directory.');
const output=process.argv[3]??fileURLToPath(new URL('../apps/web/public/artwork/fcc/',import.meta.url));
const host='https://foreignclubberscorespondence.web.app',styleId='fcc-editorial';
const read=async name=>JSON.parse(await readFile(path.join(source,name),'utf8'));
const [catalog,optimized,brush,wall,destinations]=await Promise.all([
 read('output/prototypes/city-pages/journal/city-art.json'),read('data/optimized-assets-release.json'),read('data/brush-portraits.json'),read('data/home-map-wall-release.json'),
 readFile(new URL('../apps/web/public/fcc/destinations.json',import.meta.url),'utf8').then(JSON.parse),
]);
const cities=new Map(destinations.cities.map(city=>[city.id,city])),thumbnails=new Map(),publicFiles=new Map(optimized.files.map(file=>[file.path,file]));
for(const file of optimized.files){const match=file.path.match(/-([a-f0-9]{10})-480w\.webp$/);if(match)thumbnails.set(match[1],file.path);}
const registryPath=path.join(output,'..','index.json');let registry={version:1,styles:[]},previous={};
try{registry=JSON.parse(await readFile(registryPath,'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
try{previous=JSON.parse(await readFile(path.join(output,'manifest.json'),'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
const previousPack=registry.styles.find(style=>style.id===styleId);
const policy={credit:previous.credit??previousPack?.credit??'Foreign Clubbers Correspondence',rightsStatus:previous.rightsStatus??previousPack?.rightsStatus??'unknown'};
const manifest={version:1,styleId,...policy,subjects:[],cities:[],catalogs:[]},groups=new Map(),skipped=new Set();
const labels={cafe:'Café',portraits:'Brush & fashion portraits','city-ink':'City ink',hotels:'Hotels',restaurants:'Restaurants',maps:'Maps',stickers:'Stickers',objects:'Objects',people:'People',activities:'Activities','city-illustrations':'City illustrations',apparel:'Apparel',other:'Other drawings'};
const url=value=>new URL(value,host).href;
const humanize=value=>value.replace(/-/g,' ').replace(/\b\w/g,letter=>letter.toUpperCase());
const cropFor=(frame,width,height)=>frame?[frame[0]/width,frame[1]/height,(frame[2]-frame[0])/width,(frame[3]-frame[1])/height]:undefined;
function add(slug,input,crop){
 const city=cities.get(slug);if(!city){skipped.add(slug);return;}
 const artRef=createArtRef({...input,cityId:slug,countryCode:city.countryCode,snapshotDate:optimized.snapshotDate,version:optimized.contentVersion,crop},policy);
 const item={id:artRef.assetId,styleId,label:input.label,subject:artRef.category,city:slug,collection:input.collection,thumb:artRef.thumbnailUrl,src:artRef.renditionUrl,...(artRef.originalUrl?{original:artRef.originalUrl}:{}),...(artRef.hash?{sourceHash:artRef.hash}:{}),width:artRef.width,height:artRef.height,...(crop?{crop}:{}),artRef};
 if(crop&&(!crop.every(Number.isFinite)||crop[0]<0||crop[1]<0||crop[2]<=0||crop[3]<=0||crop[0]+crop[2]>1.000001||crop[1]+crop[3]>1.000001))throw Error('Invalid source crop for '+slug);
 const key=slug+'/'+artRef.category;const group=groups.get(key)??[];if(!group.some(value=>value.id===item.id))group.push(item);groups.set(key,group);
}
for(const [slug,records] of Object.entries(catalog).sort(([a],[b])=>a.localeCompare(b))){
 if(!cities.has(slug)){skipped.add(slug);continue;}
 let city;
 try{const html=await readFile(path.join(source,'output/prototypes/city-pages',slug+'.html'),'utf8');city=JSON.parse(html.match(/<script id="fcc-data" type="application\/json">([\s\S]*?)<\/script>/)?.[1]??'null')?.city;}
 catch(error){if(error.code!=='ENOENT')throw error;}
 const used=new Set();
 function drawing(record,category,label,crop,role){
  if(!record?.src)return;
  const original=url(record.original),known=publicFiles.get(new URL(original).pathname);
  add(slug,{sourceId:record.id,label,category,collection:'city-illustrations',thumbnailUrl:thumbnails.has(record.id.slice(0,10))?url(thumbnails.get(record.id.slice(0,10))):new URL(record.thumb,host+'/output/prototypes/city-pages/journal/').href,renditionUrl:url(record.src),originalUrl:original,width:record.width,height:record.height,mimeType:original.endsWith('.webp')?'image/webp':'image/png',hash:known?.sha256??record.id,role,credit:record.credit,rightsStatus:record.rightsStatus,depictedPlace:record.depictedPlace},crop);
  used.add(record.id);
 }
 const fashion=city?.fashion,sheet=fashion&&records.find(record=>record.id===fashion.sha256);
 for(const [i,slot] of (fashion?.slots??[]).entries())if(fashion.frames?.[i])drawing(sheet,'fashion',humanize(slot),cropFor(fashion.frames[i],fashion.width,fashion.height),'portrait');
 for(const figure of city?.figures??[]){
  if(figure.kind==='style')continue;const record=records.find(value=>value.id===figure.sha256);if(!record||used.has(record.id))continue;
  const category=['backdrop','foreground'].includes(figure.kind)?figure.kind:figure.kind==='scene'?'people':figure.kind==='object'?'objects':record.category;
  drawing(record,category,figure.label,cropFor(figure.frame,figure.width,figure.height),['backdrop','foreground'].includes(figure.kind)?figure.kind:undefined);
 }
 for(const record of records){
  if(used.has(record.id)||['fashion','fashion-men'].includes(record.category)||/sheet/i.test(record.label))continue;
  if(record.category==='city-illustration'){if(/backdrop|foreground/i.test(record.label))drawing(record,record.category,record.label);continue;}
  drawing(record,record.category,/^[a-f0-9]{10,}$/i.test(record.label)?humanize(record.category):record.label,undefined,record.category==='city-ink'?'city-ink':undefined);
 }
}
async function header(publicPath){
 const file=await open(path.join(source,'public',publicPath.replace(/^\//,'')),'r');
 try{const bytes=Buffer.alloc(64),{bytesRead}=await file.read(bytes,0,64,0);return readRasterHeader(bytes.subarray(0,bytesRead));}finally{await file.close();}
}
for(const photo of brush.cities){
 if(!cities.has(photo.slug)){skipped.add(photo.slug);continue;}
 add(photo.slug,{sourceId:photo.sha256,label:photo.alt??photo.name+' brush portrait tee',category:'fashion',collection:'brush-portraits-apparel',variant:'brush',thumbnailUrl:url(photo.thumbnail),renditionUrl:url(photo.web),originalUrl:url(photo.original),width:photo.width,height:photo.height,mimeType:'image/png',hash:publicFiles.get(photo.original)?.sha256??photo.sha256,credit:photo.credit,rightsStatus:photo.rightsStatus});
}
const master=brush.artworkMaster;
if(master){
 // The explicit artworkMaster is original art, unlike photos in the collection's cities array.
 const slug=master.original.split('/')[3],pixels=await header(master.original);
 add(slug,{sourceId:master.sha256,label:cities.get(slug)?.name+' brush portrait',category:'brush-portrait',collection:'brush-original',thumbnailUrl:url(master.thumbnail),renditionUrl:url(master.web),originalUrl:url(master.original),...pixels,hash:publicFiles.get(master.original)?.sha256??master.sha256,role:'portrait',credit:master.credit,rightsStatus:master.rightsStatus});
}
const teeGroups=new Map();
for(const file of optimized.files){
 const match=file.path.match(/^\/assets\/home-map-wall-v2\/tiles\/([^/]+)\/(\d+)\/([a-z0-9-]+)\.webp$/);
 if(!match||!wall.tshirtCollections.includes(match[1]))continue;
 const key=match[3]+'/'+match[1],list=teeGroups.get(key)??[];list.push({...file,size:Number(match[2])});teeGroups.set(key,list);
}
for(const [key,files] of [...teeGroups].sort(([a],[b])=>a.localeCompare(b))){
 const [slug,variant]=key.split('/');if(!cities.has(slug)){skipped.add(slug);continue;}
 files.sort((a,b)=>a.size-b.size);const original=files.at(-1),preview=files.find(file=>file.size>=800)??original,thumb=files.find(file=>file.size>=240)??files[0],pixels=await header(original.path);
 add(slug,{sourceId:original.sha256,label:cities.get(slug).name+' '+variant+' tee',category:'map',collection:'map-tee-apparel',variant,thumbnailUrl:url(thumb.path),renditionUrl:url(preview.path),originalUrl:url(original.path),...pixels,hash:original.sha256});
}
const files=[];let count=0;
for(const [key,items] of [...groups].sort(([a],[b])=>a.localeCompare(b))){
 const [city,subject]=key.split('/');items.sort((a,b)=>a.id.localeCompare(b.id));
 files.push({name:key+'.json',bytes:JSON.stringify({version:1,styleId,items})});
 manifest.catalogs.push({subject,city,url:'/artwork/fcc/'+key+'.json',count:items.length});count+=items.length;
}
const populated=new Set(manifest.catalogs.map(ref=>ref.subject));manifest.subjects=Object.entries(labels).filter(([id])=>populated.has(id)).map(([id,label])=>({id,label}));
manifest.cities=[...new Set(manifest.catalogs.map(ref=>ref.city))].sort().map(id=>({id,label:cities.get(id).name}));
files.push({name:'manifest.json',bytes:JSON.stringify(manifest)});
const report={version:1,entryCount:count,cityCount:manifest.cities.length,catalogCount:manifest.catalogs.length,categoryCounts:Object.fromEntries(manifest.subjects.map(subject=>[subject.id,manifest.catalogs.filter(ref=>ref.subject===subject.id).reduce((n,ref)=>n+ref.count,0)])),skippedUnregisteredCityIds:[...skipped].sort(),skipReason:'Origins outside the canonical 200-city registry are reported, never renamed or assigned a guessed country.',rightsDefault:policy.rightsStatus};
files.push({name:'build-report.json',bytes:JSON.stringify(report,null,2)+'\n'});
const pack={id:styleId,label:'FCC · Fashion, travel & lifestyle',manifest:'/artwork/fcc/manifest.json',...policy};registry.styles=[...registry.styles.filter(value=>value.id!==styleId),pack];
// All references, origins, policies and crops have validated before the first write.
async function fourWorkers(values,work){let next=0;await Promise.all(Array.from({length:Math.min(4,values.length)},async()=>{while(next<values.length){const index=next++;await work(values[index],index);}}));}
await fourWorkers(files,async file=>{await mkdir(path.dirname(path.join(output,file.name)),{recursive:true});await writeFile(path.join(output,file.name),file.bytes);});
await writeFile(registryPath,JSON.stringify(registry,null,2)+'\n');
const receipt=new Array(files.length);await fourWorkers(files,async(file,index)=>{if(await readFile(path.join(output,file.name),'utf8')!==file.bytes)throw Error('Artwork build read-back failed');receipt[index]={path:file.name,sha256:createHash('sha256').update(file.bytes).digest('hex')};});
console.log(JSON.stringify({...report,metadataSha256:createHash('sha256').update(JSON.stringify(receipt)).digest('hex')}));

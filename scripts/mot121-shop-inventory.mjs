// MOT-121 offline source inventory. No network, external JS execution or product writes.
import {createHash} from 'node:crypto';
import {open, realpath} from 'node:fs/promises';

const ORIGIN='https://foreignclubberscorespondence.web.app';
const SOURCE=ORIGIN+'/shop/assets/city-catalog.mjs';
const MAX_SOURCE=4*1024*1024;
const ID=/^[a-z0-9][a-z0-9_-]{0,159}$/;
const PRODUCT_KEYS='art category city id line name number price print printFile printLayout tee'.split(' ');
const CITY_KEYS=['country','dek','name','word'];
const sha=b=>createHash('sha256').update(b).digest('hex');
const fail=message=>{throw new Error('Invalid shop source: '+message);};
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const keys=(value,expected)=>object(value)&&JSON.stringify(Object.keys(value).sort())===JSON.stringify(expected);
const text=v=>typeof v==='string'&&v.length>0&&v.length<=4096;

// Tokenize the literal before JSON.parse so duplicate keys cannot disappear.
// No eval/import: only finite JSON, bounded depth and exact export declarations.
function literal(source,start){
  const token=/\s+|"(?:\\(?:["\\/bfnrt]|u[0-9a-fA-F]{4})|[^"\\\u0000-\u001f])*"|[{}\[\]:,]|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null/y;
  const stack=[];let at=start;let tokens=0;
  while(at<source.length){
    token.lastIndex=at;const m=token.exec(source);if(!m)fail('non-JSON token');
    const value=m[0];at=token.lastIndex;if(/^\s+$/.test(value))continue;
    if(++tokens>500000)fail('token bound');
    if(value==='{'||value==='['){stack.push({kind:value,keys:new Set()});if(stack.length>32)fail('depth bound');}
    else if(value==='}'||value===']'){
      if(stack.pop()?.kind!==(value==='}'?'{':'['))fail('unbalanced JSON');
      if(!stack.length){const raw=source.slice(start,at);let parsed;try{parsed=JSON.parse(raw);}catch{fail('malformed JSON');}return {value:parsed,end:at};}
    }else if(value.startsWith('"')){
      const decoded=JSON.parse(value);
      if(Buffer.from(decoded).toString('utf8')!==decoded)fail('invalid Unicode');
      if(/^\s*:/.test(source.slice(at))){const frame=stack.at(-1);
        if(!frame||frame.kind!=='{'||frame.keys.has(decoded))fail('duplicate object key');frame.keys.add(decoded);}
    }else if(/^-?\d/.test(value)&&(!Number.isFinite(Number(value))||(Number.isInteger(Number(value))&&!Number.isSafeInteger(Number(value)))))fail('non-finite/unsafe number');
  }
  fail('incomplete JSON');
}

function assetUrl(value,role){
  // Check raw text first: URL parsers otherwise strip tabs/newlines or normalize paths.
  if(typeof value!=='string'||/[\u0000-\u0020\u007f]/.test(value))fail('control/whitespace in locator');
  const prefix=`assets/${role}/`;
  const relative=value.startsWith(ORIGIN+'/shop/')?value.slice((ORIGIN+'/shop/').length):value;
  if(!relative.startsWith(prefix)||!/^[-A-Za-z0-9_]+\.(png|webp|svg|jpe?g)$/.test(relative.slice(prefix.length)))fail('unsupported asset origin/path');
  return ORIGIN+'/shop/'+relative;
}

export function parseShopSource(raw,receipt){
  if(!Buffer.isBuffer(raw)||raw.length>MAX_SOURCE)fail('4 MiB byte bound');
  if(!object(receipt)||receipt.url!==SOURCE||receipt.status!==200||!['text/javascript','application/javascript'].includes(receipt.mime)
    ||receipt.bytes!==raw.length||receipt.sha256!==sha(raw)||typeof receipt.fetchedAtUtc!=='string'
    ||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(receipt.fetchedAtUtc)
    ||!Number.isFinite(Date.parse(receipt.fetchedAtUtc)))fail('receipt identity/digest/bytes/fetch mismatch');
  let source;try{source=new TextDecoder('utf-8',{fatal:true}).decode(raw);}catch{fail('UTF-8');}
  const data={};let at=0;
  while(source.slice(at).trim()){
    const m=/^\s*export\s+const\s+(CITY|PRODUCTS)\s*=\s*/.exec(source.slice(at));
    if(!m||Object.hasOwn(data,m[1]))fail('only one CITY and PRODUCTS JSON export allowed');
    const parsed=literal(source,at+m[0].length);const suffix=/^\s*;/.exec(source.slice(parsed.end));
    if(!suffix)fail('non-literal export');data[m[1]]=parsed.value;at=parsed.end+suffix[0].length;
  }
  if(!object(data.CITY)||Object.keys(data.CITY).length<1||Object.keys(data.CITY).length>1000
    ||!Array.isArray(data.PRODUCTS)||data.PRODUCTS.length<1||data.PRODUCTS.length>10000)fail('inventory shape/bound');
  const cities=Object.entries(data.CITY).map(([id,city])=>{
    if(!ID.test(id)||!keys(city,CITY_KEYS)||!Object.values(city).every(text))fail('city metadata');
    return {id,sourceCity:city};
  }).sort((a,b)=>a.id.localeCompare(b.id,'en'));
  const ids=new Set();const slots=new Set();
  const products=data.PRODUCTS.map(product=>{
    if(!keys(product,PRODUCT_KEYS)||!['id','city','name','line','category','print','printLayout'].every(k=>text(product[k]))
      ||!ID.test(product.id)||!Object.hasOwn(data.CITY,product.city)||!Number.isSafeInteger(product.number)||product.number<1||product.number>1000
      ||typeof product.price!=='number'||!Number.isFinite(product.price)||product.price<0)fail('product metadata');
    const slot=product.city+'\0'+product.number;
    if(ids.has(product.id)||slots.has(slot))fail('duplicate product ID/city slot');ids.add(product.id);slots.add(slot);
    const representations=[['mockup','tee','tees'],['artwork','art','art']];
    if(product.printFile!==null)representations.push(['print-file','printFile','print']);
    return {id:'fcc-shop:'+product.id,cityId:product.city,sourceProduct:product,sourceSnapshotSha256:receipt.sha256,
      representations:representations.map(([role,key,path])=>({role,url:assetUrl(product[key],path),sha256:null,width:null,height:null})),
      credit:null,rightsStatus:'unknown',commerceVerified:false,
      shopCityUrl:ORIGIN+'/shop/?city='+product.city,
      eligibility:{discover:'source-metadata-observed',preview:'locator-declared; bytes unverified',insert:'unresolved',
        share:'unresolved for product; existing asset policy unchanged',embed:'unresolved',shop:'city-route-declared; selection unverified'}};
  }).sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
  return {schema:'fcc.shop-inventory/1',snapshot:{sourceUrl:SOURCE,sha256:receipt.sha256,bytes:raw.length,fetchedAtUtc:receipt.fetchedAtUtc},cities,products};
}

export function reconcileShopProducts(inventory,assetAudit){
  const byIdentity=new Map();const byUrl=new Map();const add=(map,key,id)=>{if(!map.has(key))map.set(key,new Set());map.get(key).add(id);};
  for(const row of assetAudit.rows){
    if(row.kind==='apparel-mockup'&&row.category==='apparel')for(const id of [row.sourceId,...(row.aliasSourceIds??[])])if(id)add(byIdentity,row.cityId+'\0'+id,row.id);
    for(const url of [row.originalUrl,...(row.originalAliases??[]),...(row.renditionUrls??[])])if(url)add(byUrl,row.cityId+'\0'+url,row.id);
  }
  const products=inventory.products.map(product=>({...product,status:'unresolved',
    reason:'Product-to-asset identity and operation eligibility require authoritative mapping/product verification',
    candidateAssetRows:[...(byIdentity.get(product.cityId+'\0'+product.sourceProduct.id)??[])].sort(),
    relatedRepresentationRows:[...new Set(product.representations.flatMap(rep=>[...(byUrl.get(product.cityId+'\0'+rep.url)??[])]))].sort()}));
  const count=new Map();const categories={};
  for(const p of products){count.set(p.cityId,(count.get(p.cityId)??0)+1);categories[p.sourceProduct.category]=(categories[p.sourceProduct.category]??0)+1;}
  const cities=inventory.cities.map(city=>({...city,productRecords:count.get(city.id)??0}));
  return {...inventory,products,cities,scanComplete:true,ok:false,
    summary:{cities:cities.length,productRecords:products.length,unresolvedProductRecords:products.length,
      candidateAssociationProducts:products.filter(p=>p.candidateAssetRows.length>0).length,
      relatedRepresentationProducts:products.filter(p=>p.relatedRepresentationRows.length>0).length,
      citiesWithoutProducts:cities.filter(c=>c.productRecords===0).map(c=>c.id),
      declaredCategoryCounts:Object.fromEntries(Object.entries(categories).sort(([a],[b])=>a<b?-1:a>b?1:0))},
    limitations:['Product records and asset rows are different units; counts are not unique designs.',
      'Complete metadata scan is not complete coverage. IDs/locators give candidates, never byte/rights/commerce proof.',
      'No network or image/print bytes read; source price/country/line/print metadata is preserved without current commerce or country-code claims.',
      'MOT-137 authority gaps, A23 product acceptance and MOT-139 actual-client prerequisite remain unresolved.']};
}

async function boundedFile(path,max){
  const file=await realpath(path);const handle=await open(file,'r');
  try{
    const before=await handle.stat();if(!before.isFile()||before.size>max)fail('input file/byte bound');
    const buffer=Buffer.alloc(before.size+1);let offset=0;
    while(offset<buffer.length){const read=await handle.read(buffer,offset,buffer.length-offset,offset);if(!read.bytesRead)break;offset+=read.bytesRead;}
    const after=await handle.stat();if(offset!==before.size||before.size!==after.size||before.mtimeMs!==after.mtimeMs)fail('input changed during read');
    return buffer.subarray(0,offset);
  }finally{await handle.close();}
}

export async function readShopSource(sourcePath,receiptPath){
  if(!sourcePath&&!receiptPath)return null;
  if(!sourcePath||!receiptPath)fail('shop source and receipt are both required');
  const raw=await boundedFile(sourcePath,MAX_SOURCE);const receiptRaw=await boundedFile(receiptPath,65536);
  const receiptText=new TextDecoder('utf-8',{fatal:true}).decode(receiptRaw);
  const parsed=literal(receiptText,0);if(receiptText.slice(parsed.end).trim())fail('receipt trailing data');
  return parseShopSource(raw,parsed.value);
}

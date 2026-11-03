import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp, mkdir, writeFile, readFile, unlink, rmdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, dirname} from 'node:path';
import {spawnSync} from 'node:child_process';
import {parseShopSource, reconcileShopProducts} from './mot121-shop-inventory.mjs';
import {auditFccCoverage} from './audit-mot-fcc-coverage.mjs';

const ORIGIN = 'https://foreignclubberscorespondence.web.app';
const sourceUrl = ORIGIN + '/shop/assets/city-catalog.mjs';
const sha = b => createHash('sha256').update(b).digest('hex');
const fixture = () => ({
  CITY: {alpha: {name: 'Alpha', country: 'Example country', word: 'Alpha', dek: 'The collection.'}},
  PRODUCTS: [{id: 'alpha-01-panel', city: 'alpha', number: 1, name: 'Panel',
    line: 'The declared product line', category: 'people', print: 'Source print descriptor',
    price: 32, printLayout: 'chest', tee: 'assets/tees/alpha.svg',
    art: 'assets/art/alpha.webp', printFile: null}],
});
const bytes = data => Buffer.from(Object.entries(data).map(([k,v])=>`export const ${k} = ${JSON.stringify(v)};`).join('\n'));
const receipt = raw => ({url:sourceUrl, fetchedAtUtc:'2026-11-01T10:07:34.257606+00:00',
  status:200, mime:'text/javascript', bytes:raw.length, sha256:sha(raw)});
const parse = (data=fixture()) => {const raw=bytes(data);return parseShopSource(raw,receipt(raw));};
const baseline = () => ({version:1,ok:true,summary:{sourceRows:1,matched:1,missing:0,unresolved:0},
  rows:[{id:'legacy-alpha',sourceId:'old-alpha',cityId:'alpha',category:'apparel',kind:'apparel-mockup',
    status:'matched',originalUrl:ORIGIN+'/legacy.webp',matchedMotIds:['mot-alpha']}]});

test('complete source metadata, representation roles and unknown rights survive normalization',()=>{
  const f=fixture();f.PRODUCTS[0].printFile='assets/print/alpha.png';
  const result=parse(f);const p=result.products[0];
  assert.equal(p.id,'fcc-shop:alpha-01-panel');
  assert.deepEqual(p.sourceProduct,f.PRODUCTS[0]);
  assert.deepEqual(result.cities[0].sourceCity,f.CITY.alpha);
  assert.equal(p.cityId,'alpha');assert.equal(p.sourceSnapshotSha256,result.snapshot.sha256);
  assert.deepEqual(p.representations.map(x=>x.role),['mockup','artwork','print-file']);
  assert.ok(p.representations.every(x=>x.sha256===null&&x.width===null&&x.height===null));
  assert.equal(p.rightsStatus,'unknown');assert.equal(p.credit,null);
  assert.equal(p.commerceVerified,false);assert.equal(p.eligibility.embed,'unresolved');
});

test('stable product IDs survive a changed snapshot; snapshots never silently alias',()=>{
  const a=parse();const data=fixture();data.PRODUCTS[0].name='Revised source label';const b=parse(data);
  assert.equal(a.products[0].id,b.products[0].id);assert.notEqual(a.snapshot.sha256,b.snapshot.sha256);
  assert.equal(b.products[0].sourceProduct.name,'Revised source label');
});

test('source JS is data: active code, duplicate exports/keys, nonfinite and malformed Unicode fail',()=>{
  const raw=bytes(fixture());
  for(const bad of [Buffer.concat([raw,Buffer.from('globalThis.executed=true;')]),
    Buffer.concat([raw,Buffer.from('export const CITY = {};')]),
    Buffer.from(raw.toString().replace('"price":32','"price":32,"price":1')),
    Buffer.from(raw.toString().replace('"price":32','"price":1e999')),
    Buffer.from(raw.toString().replace('"price":32','"price":NaN')),
    Buffer.from(raw.toString().replace('"Panel"','"\\ud800"')),Buffer.from([0xff])]){
    assert.throws(()=>parseShopSource(bad,receipt(bad)));
  }
  assert.equal(globalThis.executed,undefined);
});

test('URL control characters, whitespace, traversal, credentials and foreign URLs are refused',()=>{
  for(const locator of ['assets/art/a\nlpha.webp','assets/art/a\tlpha.webp','assets/art/a\rlpha.webp',
    ' assets/art/alpha.webp','assets/art/alpha.webp ','assets/art/../alpha.webp',
    'assets/art/%2e%2e/alpha.webp','//example.com/alpha.webp',
    'https://user@foreignclubberscorespondence.web.app/shop/assets/art/alpha.webp',
    'https://example.com/shop/assets/art/alpha.webp','assets/art/alpha.webp?token=x',
    'assets/art/alpha.webp#x','data:image/png;base64,AAAA']){
    const data=fixture();data.PRODUCTS[0].art=locator;
    assert.throws(()=>parse(data),locator);
  }
});

test('source and receipt limits, digest, byte count, origin, response and fetch identity are enforced',()=>{
  const raw=bytes(fixture());
  for(const change of [{sha256:'0'.repeat(64)},{bytes:raw.length+1},{url:ORIGIN+'/other'},
    {status:404},{mime:'text/html'},{fetchedAtUtc:'not-a-time'}]){
    assert.throws(()=>parseShopSource(raw,{...receipt(raw),...change}));
  }
  assert.throws(()=>parseShopSource(Buffer.alloc(4194305),receipt(Buffer.alloc(4194305))));
});

test('duplicate identity/slot, unknown city, changed schema and invalid fields fail the inventory',()=>{
  for(const change of [p=>{p.city='unknown';},p=>{p.number=true;},p=>{p.price=Infinity;},
    p=>{delete p.printLayout;},p=>{p.licenseGranted=true;}]){
    const data=fixture();change(data.PRODUCTS[0]);assert.throws(()=>parse(data));
  }
  for(const sameId of [true,false]){
    const data=fixture();data.PRODUCTS.push({...data.PRODUCTS[0],id:sameId?'alpha-01-panel':'alpha-other'});
    assert.throws(()=>parse(data));
  }
});

test('asset rows and product records stay separate; exact IDs/URLs never prove product eligibility',()=>{
  const old=baseline();old.rows[0].sourceId='alpha-01-panel';
  old.rows[0].originalUrl=ORIGIN+'/shop/assets/tees/alpha.svg';
  const before=structuredClone(old);const out=reconcileShopProducts(parse(),old);
  assert.equal(out.summary.productRecords,1);assert.equal(out.summary.unresolvedProductRecords,1);
  assert.equal(out.summary.candidateAssociationProducts,1);
  assert.equal(out.products[0].status,'unresolved');
  assert.deepEqual(out.products[0].candidateAssetRows,['legacy-alpha']);
  assert.equal(out.products[0].eligibility.insert,'unresolved');assert.deepEqual(old,before);
});

test('wrong-city IDs do not associate; empty cities remain visible; category counts are exhaustive',()=>{
  const old=baseline();old.rows[0].sourceId='alpha-01-panel';old.rows[0].cityId='beta';
  const data=fixture();data.CITY.beta={...data.CITY.alpha,name:'Beta'};
  const out=reconcileShopProducts(parse(data),old);
  assert.equal(out.summary.candidateAssociationProducts,0);
  assert.deepEqual(out.summary.citiesWithoutProducts,['beta']);
  assert.deepEqual(out.summary.declaredCategoryCounts,{people:1});
  assert.equal(out.cities.find(c=>c.id==='beta').productRecords,0);
});

test('source categories named like Object properties remain numeric and visible',()=>{
  const data=fixture();data.PRODUCTS=['__proto__','constructor','toString'].map((category,index)=>({
    ...data.PRODUCTS[0],id:'alpha-'+index,number:index+1,category,
  }));
  const out=reconcileShopProducts(parse(data),baseline());
  assert.deepEqual(Object.keys(out.summary.declaredCategoryCounts).sort(),['__proto__','constructor','toString']);
  assert.ok(Object.values(out.summary.declaredCategoryCounts).every(value=>value===1));
  assert.equal(Object.values(out.summary.declaredCategoryCounts).reduce((a,b)=>a+b,0),3);
});

test('exact derivative locators remain related evidence within their source city only',()=>{
  for(const city of ['alpha','beta']){
    const old=baseline();old.rows[0].cityId=city;
    old.rows[0].derivativeUrl=ORIGIN+'/shop/assets/art/alpha.webp';
    const out=reconcileShopProducts(parse(),old);
    assert.deepEqual(out.products[0].relatedRepresentationRows,city==='alpha'?['legacy-alpha']:[]);
    assert.equal(out.products[0].status,'unresolved');
  }
});

async function world(){
  const root=await mkdtemp(join(tmpdir(),'mot121-shop-'));const paths=[];const dirs=new Set([root]);
  const put=async(rel,value)=>{const file=join(root,rel);await mkdir(dirname(file),{recursive:true});
    for(let d=dirname(file);d!==root;d=dirname(d))dirs.add(d);
    await writeFile(file,typeof value==='string'||Buffer.isBuffer(value)?value:JSON.stringify(value));paths.push(file);return file;};
  await put('fcc/content/cities/index.json',{schema:'fcc.city-sources/1',slugs:['alpha']});
  await put('fcc/content/assets/registry.json',{schema:'fcc.asset-registry/1',assets:[]});
  await put('fcc/data/optimized-assets-release.json',{files:[]});
  await put('fcc/data/brush-portraits.json',{schema:'fcc.brush-portraits/1',cities:[],unchanged:[]});
  await put('fcc/data/home-map-wall-release.json',{});
  await put('fcc/output/prototypes/city-pages/journal/city-art.json',{});
  await put('fcc/output/prototypes/city-pages/journal/collections.json',{version:1,collections:[]});
  await put('fcc/output/magazine-articles/art-registry.json',{cities:[]});
  await put('fcc/content/cities/alpha/city.json',{schema:'fcc.city-source/1',catalog:{city:{slug:'alpha'}},gallery:[]});
  await put('mot/fcc/destinations.json',{cities:[{id:'alpha',countryCode:'AA'}]});
  await put('mot/artwork/index.json',{styles:[]});
  const raw=bytes(fixture());const shopSource=await put('shop.mjs',raw);const shopReceipt=await put('receipt.json',receipt(raw));
  return {root,shopSource,shopReceipt,put,opts:{fccRoot:join(root,'fcc'),motPublicRoot:join(root,'mot'),shopSource,shopReceipt},
    cleanup:async()=>{for(const file of new Set(paths))await unlink(file).catch(()=>{});
      for(const dir of [...dirs].sort((a,b)=>b.length-a.length))await rmdir(dir);}};
}

test('opt-in v2 contains the exact unchanged v1 audit and a separate incomplete shop inventory',async()=>{
  const w=await world();try{
    const {shopSource,shopReceipt,...legacy}=w.opts;const old=await auditFccCoverage(legacy);
    const out=await auditFccCoverage(w.opts);
    assert.equal(old.version,1);assert.equal(out.version,2);assert.equal(out.ok,false);
    assert.deepEqual(out.assetAudit,old);assert.equal(out.shopAudit.summary.productRecords,1);
    assert.equal(out.shopAudit.scanComplete,true);assert.equal(out.shopAudit.ok,false);
  }finally{await w.cleanup();}
});

test('requested shop scans fail closed on missing files/receipts and never overwrite their inputs',async()=>{
  const w=await world();try{
    for(const opts of [{...w.opts,shopReceipt:undefined},{...w.opts,shopSource:undefined},
      {...w.opts,shopSource:join(w.root,'absent')}, {...w.opts,shopReceipt:join(w.root,'absent')}]){
      await assert.rejects(auditFccCoverage(opts));
    }
    const before=await readFile(w.shopSource);
    const r=spawnSync(process.execPath,['scripts/audit-mot-fcc-coverage.mjs','--fcc-root',w.opts.fccRoot,
      '--mot-public',w.opts.motPublicRoot,'--shop-source',w.shopSource,'--shop-receipt',w.shopReceipt,
      '--output',w.shopSource],{encoding:'utf8'});
    assert.equal(r.status,1);assert.match(r.stderr,/input|source/i);assert.deepEqual(await readFile(w.shopSource),before);
  }finally{await w.cleanup();}
});

test('a failed requested v2 scan cannot write a fresh success report over prior evidence',async()=>{
  const w=await world();try{
    const output=await w.put('report.json','previous evidence, not a new success');
    const raw=await readFile(w.shopSource);await writeFile(w.shopReceipt,JSON.stringify({...receipt(raw),sha256:'0'.repeat(64)}));
    const r=spawnSync(process.execPath,['scripts/audit-mot-fcc-coverage.mjs','--fcc-root',w.opts.fccRoot,
      '--mot-public',w.opts.motPublicRoot,'--shop-source',w.shopSource,'--shop-receipt',w.shopReceipt,
      '--output',output],{encoding:'utf8'});
    assert.equal(r.status,1);assert.equal(r.stdout,'');assert.match(r.stderr,/receipt|digest/i);
    assert.equal(await readFile(output,'utf8'),'previous evidence, not a new success');
  }finally{await w.cleanup();}
});

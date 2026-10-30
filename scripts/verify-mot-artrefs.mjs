// MOT-84 read-only acceptance audit. Only manifest-referenced public metadata is read.
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {artRefSchema,ART_CATEGORIES} from '../packages/core/src/trip/art-ref.ts';
const [rootArg,reportArg,mode]=process.argv.slice(2);assert(rootArg&&reportArg,'Supply a public-root directory and output receipt JSON.');
const root=path.resolve(rootArg),started=Date.now(),files={},json=async name=>{const bytes=await readFile(path.join(root,name));files[name]=createHash('sha256').update(bytes).digest('hex');return JSON.parse(bytes);};
const registry=await json('artwork/index.json'),pack=registry.styles.find(s=>s.id==='fcc-editorial');assert(pack);assert.equal(pack.manifest,'/artwork/fcc/manifest.json');
const manifest=await json(pack.manifest.slice(1)),build=await json('artwork/fcc/build-report.json');assert.equal(manifest.styleId,pack.id);
const destinations=JSON.parse(await readFile(new URL('../apps/web/public/fcc/destinations.json',import.meta.url),'utf8')),countries=new Map(destinations.cities.map(c=>[c.id,c.countryCode]));
function check(item){
 const ref=artRefSchema.parse(item.artRef);for(const [a,b] of [['id','assetId'],['city','originCityId'],['label','label'],['subject','category'],['thumb','thumbnailUrl'],['src','renditionUrl'],['original','originalUrl'],['width','width'],['height','height'],['sourceHash','hash']])assert.equal(item[a],ref[b]);
 assert.equal(ref.countryCode,countries.get(item.city));assert.equal(ref.source.provider,'fcc');assert.equal(ref.source.kind,'artwork');
 if(['brush-portraits-apparel','map-tee-apparel'].includes(item.collection)){assert.equal(ref.kind,'apparel-mockup');assert.equal(ref.category,'apparel');}
 else{assert(['city-illustrations','brush-original'].includes(item.collection));assert.notEqual(ref.kind,'apparel-mockup');assert.notEqual(ref.category,'apparel');}
 return ref;
}
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
const payload=item=>{const copy=structuredClone(item);delete copy.id;delete copy.artRef.assetId;delete copy.artRef.source.retrievedAt;delete copy.artRef.source.version;return createHash('sha256').update(JSON.stringify(canonical(copy))).digest('hex');};
let next=0;const items=[],ids=new Set(),pairs=new Set();
await Promise.all(Array.from({length:4},async()=>{while(next<manifest.catalogs.length){const entry=manifest.catalogs[next++];assert.equal(entry.url,`/artwork/fcc/${entry.city}/${entry.subject}.json`);assert(entry.count>0);const key=entry.city+'/'+entry.subject;assert(!pairs.has(key));pairs.add(key);const catalog=await json(entry.url.slice(1));assert.equal(catalog.styleId,pack.id);assert.equal(catalog.items.length,entry.count);
 for(const item of catalog.items){assert.equal(item.styleId,pack.id);assert.equal(item.city,entry.city);assert.equal(item.subject,entry.subject);assert(!ids.has(item.id));ids.add(item.id);check(item);items.push(item);}
}}));
assert.equal(items.length,build.entryCount);assert.equal(manifest.cities.length,build.cityCount);assert.equal(manifest.catalogs.length,build.catalogCount);
const kinds={},categories={},policies={},epochs=new Set();for(const item of items){const ref=item.artRef;kinds[ref.kind]=(kinds[ref.kind]??0)+1;categories[ref.category]=(categories[ref.category]??0)+1;const policy=JSON.stringify([ref.credit,ref.rightsStatus]);policies[policy]=(policies[policy]??0)+1;epochs.add(JSON.stringify([ref.source.retrievedAt,ref.source.version]));}
assert.deepEqual(categories,build.categoryCounts);
const tee=items.find(i=>i.collection==='map-tee-apparel');assert(tee);const disguised=structuredClone(tee);Object.assign(disguised,{subject:'maps'});Object.assign(disguised.artRef,{kind:'map',category:'maps',role:'map'});delete disguised.artRef.variant;
assert(artRefSchema.safeParse(disguised.artRef).success,'Negative control must be schema-valid before checking collection provenance');assert.throws(()=>check(disguised));
const missing=structuredClone(tee);delete missing.artRef;assert.throws(()=>check(missing));const foreign=structuredClone(tee);foreign.artRef.countryCode='ZZ';foreign.artRef.source.countryCode='ZZ';assert(artRefSchema.safeParse(foreign.artRef).success);assert.throws(()=>check(foreign));const uncredited=structuredClone(tee);uncredited.artRef.credit='';assert.throws(()=>check(uncredited));
const mapTees=items.filter(i=>i.collection==='map-tee-apparel');assert(mapTees.every(i=>i.artRef.kind==='apparel-mockup'));const sample=[...new Set(mapTees.map(i=>i.city))].sort().slice(0,50);assert.equal(sample.length,50);
if(mode==='policy-fixture'){assert.equal(manifest.credit,'QA PACK CREDIT — FIXTURE ONLY');assert.equal(manifest.rightsStatus,'approved');assert(items.every(i=>i.artRef.credit===manifest.credit&&i.artRef.rightsStatus==='approved'));}
const sortedFiles=Object.fromEntries(Object.entries(files).sort(([a],[b])=>a.localeCompare(b))),report={dateUtc:new Date().toISOString(),root,mode:mode??'real-metadata',entries:items.length,cities:manifest.cities.length,catalogs:manifest.catalogs.length,kinds,categories,policies,epochs:[...epochs].sort().map(JSON.parse),mapTeeCount:mapTees.length,mapTeeSampleCities:sample,flatMapCount:items.filter(i=>i.artRef.kind==='map').length,absentCategoryPairs:manifest.cities.length*ART_CATEGORIES.length-pairs.size,negativeControls:['schema-valid tee disguised as map','missing ArtRef','schema-valid wrong canonical country','missing credit'],stablePayloadSha256:createHash('sha256').update(JSON.stringify(items.map(payload).sort())).digest('hex'),publicationSha256:createHash('sha256').update(JSON.stringify(sortedFiles)).digest('hex'),files:sortedFiles,elapsedMs:Date.now()-started};
await mkdir(path.dirname(path.resolve(reportArg)),{recursive:true});await writeFile(reportArg,JSON.stringify(report,null,2)+'\n');process.stdout.write(JSON.stringify({entries:report.entries,cities:report.cities,catalogs:report.catalogs,kinds:report.kinds,mapTees:report.mapTeeCount,flatMaps:report.flatMapCount,absentCategoryPairs:report.absentCategoryPairs,publicationSha256:report.publicationSha256,elapsedMs:report.elapsedMs}));

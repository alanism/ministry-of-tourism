// Read-only MOT-78 consumer verification. Public FCC data only; no model or board writes.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdirSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {createFccAdapter,FCC_ORIGIN,MemoryCityCache} from '../packages/core/src/trip/city-source.ts';
const started=Date.now(),date=new Date(),out=process.env.MOT_EVIDENCE_DIR;
assert(out,'Set MOT_EVIDENCE_DIR to a writable evidence directory.');mkdirSync(out,{recursive:true});
const indexResponse=await fetch(`${FCC_ORIGIN}/feeds/cities/index.json`,{credentials:'omit',redirect:'error',signal:AbortSignal.timeout(20000)});
assert.equal(indexResponse.status,200);const index=await indexResponse.json();assert(Array.isArray(index.cities)&&index.cities.length>0);
const cache=new MemoryCityCache(),raw=new Map(),diagnostics=[],results=[],requests=[];
const adapter=createFccAdapter({feedUrl:id=>`${FCC_ORIGIN}/feeds/cities/${id}.json`,cache,now:()=>date,onDiagnostic:d=>diagnostics.push(d),fetcher:async(url,init)=>{
 assert.equal(init.credentials,'omit');assert.equal(init.redirect,'error');assert(init.signal instanceof AbortSignal);assert.equal(init.body,undefined);assert(!new Headers(init.headers).has('authorization'));
 const response=await fetch(url,init),feed=await response.clone().json();raw.set(feed.city.id,feed);requests.push({url,status:response.status});return response;
}});
let next=0;
await Promise.all(Array.from({length:8},async()=>{while(next<index.cities.length){const entry=index.cities[next++];assert.equal(entry.url,`/feeds/cities/${entry.id}.json`);
 const result=await adapter.getCity(entry.id);assert.notEqual(result.status,'unavailable',`${entry.id}: ${JSON.stringify(result)}`);assert.equal(result.status,'ready');
 const feed=raw.get(entry.id);assert.equal(result.value.city.id,entry.id);assert.equal(result.value.articles.length,entry.articles);assert.equal(result.value.places.length,entry.places);assert.equal(result.sourceVersion,entry.sourceVersion);
 for(const [i,article] of result.value.articles.entries()){
  const original=feed.articles[i];assert.equal(article.body,original.body);assert.equal(article.title,original.title);assert.equal(article.source.canonicalUrl,original.canonicalUrl);assert.equal(article.source.publishedAt,original.publishedAt);assert.equal(article.source.updatedAt,original.updatedAt);assert.equal(article.source.retrievedAt,date.toISOString());assert.equal(article.source.version,feed.sourceVersion);assert.equal(article.source.cityId,entry.id);assert.equal(article.source.provider,'fcc');assert.equal(article.source.contentHash,createHash('sha256').update(original.body).digest('hex'));
 }
 assert(result.value.places.every(place=>place.fixture===false&&place.city===entry.id&&place.source.cityId===entry.id));
 results.push({cityId:entry.id,articles:result.value.articles.length,places:result.value.places.length,bodyCharacters:result.value.articles.reduce((n,a)=>n+a.body.length,0),sourceVersion:result.sourceVersion});
}}));
assert.equal(requests.length,index.cities.length);assert.deepEqual(diagnostics,[]);
const offline=[];
for(const city of ['san-sebastian','bangkok','kyoto','lisbon']){const before=requests.length,result=await adapter.getCity(city,{offline:true});assert.equal(result.status,'cached');assert.equal(result.value.city.id,city);assert.equal(result.retrievedAt,date.toISOString());assert.equal(requests.length,before);offline.push(city);}
writeFileSync(path.join(out,'san-sebastian-live-feed.json'),JSON.stringify(raw.get('san-sebastian'),null,2));
const report={dateUtc:date.toISOString(),origin:FCC_ORIGIN,indexUrl:`${FCC_ORIGIN}/feeds/cities/index.json`,cityCount:results.length,articleCount:results.reduce((n,r)=>n+r.articles,0),placeCount:results.reduce((n,r)=>n+r.places,0),bodyCharacters:results.reduce((n,r)=>n+r.bodyCharacters,0),everyBodyAndSourceFieldMatchesFeed:true,independentNodeBodyHashesMatch:true,credentialsOmitted:true,noBoardOrModelRequests:true,offlineNoFetch:offline,requests,diagnostics,cities:results.sort((a,b)=>a.cityId.localeCompare(b.cityId)),elapsedMs:Date.now()-started};
writeFileSync(path.join(out,'live-adapter.json'),JSON.stringify(report,null,2));
process.stdout.write(JSON.stringify({cities:report.cityCount,articles:report.articleCount,places:report.placeCount,offline,elapsedMs:report.elapsedMs}));

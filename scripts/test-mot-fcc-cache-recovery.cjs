// Synthetic source data in fresh profiles. Successful writes/deletion use real browser IndexedDB.
const {chromium}=require(process.env.MOT_PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const origin=process.env.MOT_TEST_ORIGIN||'http://127.0.0.1:5197';
const evidence=process.env.MOT_EVIDENCE_DIR||path.join(require('node:os').tmpdir(),'mot-fcc-cache-recovery');
const feed={schema:'fcc.city.feed',version:1,city:{id:'san-sebastian',name:'San Sebastián',countryCode:'ES',timeZone:null},sourceVersion:'v1',articles:[{id:'11',title:'Synthetic source',body:'Original synthetic text',canonicalUrl:'https://foreignclubberscorespondence.web.app/magazine/san-sebastian/fixture.html'}],places:[],almanac:[]};
fs.mkdirSync(evidence,{recursive:true});
(async()=>{
  const browser=await chromium.launch({headless:true,chromiumSandbox:true}),results=[],errors=[];
  try{
    for(const scenario of ['open-failure','version-change','write-failure']){
      const context=await browser.newContext(),page=await context.newPage();
      page.on('pageerror',error=>errors.push(error.message));
      let requests=0;
      await page.route('https://foreignclubberscorespondence.web.app/feeds/cities/san-sebastian.json',route=>{requests++;return route.fulfill({contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify({...feed,sourceVersion:'v2',articles:[{...feed.articles[0],body:'New synthetic source text'}]})});});
      try{
        await page.goto(origin+'/?view=trip');
        const result=await page.evaluate(async({scenario,feed})=>{
          const {browserCityCache,browserFcc}=await import('/src/trip/FccBrowser.tsx'),city=feed.city.id;
          const entry={feed,retrievedAt:'2026-10-29T12:00:00Z',etag:'"v1"'};
          const unrelated=await new Promise((resolve,reject)=>{const r=indexedDB.open('mot-unrelated-cache-proof',1);r.onupgradeneeded=()=>r.result.createObjectStore('keep');r.onerror=()=>reject(r.error);r.onsuccess=()=>resolve(r.result)});
          const tx=unrelated.transaction('keep','readwrite');tx.objectStore('keep').put('fictional unrelated data','sentinel');await new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)});unrelated.close();
          let proof;
          if(scenario==='open-failure'){
            const open=indexedDB.open.bind(indexedDB);let rejected=false,recovered=false;
            indexedDB.open=(name,...args)=>{if(name==='mot-fcc-sources')throw new DOMException('Injected temporary storage denial','SecurityError');return open(name,...args)};
            try{await browserCityCache.read(city)}catch{rejected=true}finally{indexedDB.open=open}
            try{await browserCityCache.write(city,entry);recovered=JSON.stringify(await browserCityCache.read(city))===JSON.stringify(entry)}catch{}
            proof={rejected,recovered};
          }else if(scenario==='version-change'){
            await browserCityCache.write(city,entry);
            const deletion=await new Promise(resolve=>{const r=indexedDB.deleteDatabase('mot-fcc-sources');r.onsuccess=()=>resolve('deleted');r.onblocked=()=>resolve('blocked');r.onerror=()=>resolve('error')});
            let recreated=false;
            if(deletion==='deleted'){const missing=await browserCityCache.read(city);await browserCityCache.write(city,entry);recreated=missing===undefined&&JSON.stringify(await browserCityCache.read(city))===JSON.stringify(entry)}
            proof={deletion,recreated};
          }else{
            await browserCityCache.write(city,entry);
            const transaction=IDBDatabase.prototype.transaction;let injectedAborts=0;
            IDBDatabase.prototype.transaction=function(stores,mode,...args){const tx=transaction.call(this,stores,mode,...args);if(this.name==='mot-fcc-sources'&&mode==='readwrite'&&!injectedAborts++){tx.abort()}return tx};
            let fetched;
            try{fetched=await browserFcc.getCity(city)}finally{IDBDatabase.prototype.transaction=transaction}
            const kept=await browserCityCache.read(city),offline=await browserFcc.getCity(city,{offline:true}),retry=await browserFcc.getCity(city),saved=await browserCityCache.read(city);
            proof={injectedAborts,usableFetchedVersion:fetched.status!=='unavailable'&&fetched.sourceVersion,oldDatedCopyKept:JSON.stringify(kept)===JSON.stringify(entry),offlineVersion:offline.status!=='unavailable'&&offline.sourceVersion,offlineRetrievedAt:offline.status!=='unavailable'&&offline.retrievedAt,retryVersion:retry.status!=='unavailable'&&retry.sourceVersion,savedVersion:saved?.feed?.sourceVersion};
          }
          const unrelatedPreserved=await new Promise((resolve,reject)=>{const r=indexedDB.open('mot-unrelated-cache-proof');r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result,tx=db.transaction('keep','readonly'),read=tx.objectStore('keep').get('sentinel');tx.oncomplete=()=>{db.close();resolve(read.result==='fictional unrelated data')};tx.onerror=()=>reject(tx.error)}});
          return{scenario,...proof,unrelatedPreserved};
        },{scenario,feed});
        results.push({...result,requests});
      }finally{await context.close()}
    }
    fs.writeFileSync(path.join(evidence,'result.json'),JSON.stringify({results,errors,syntheticFeed:true,controlledFaults:['temporary open denial','real versionchange/delete','real transaction abort'],livePublicationClaimed:false},null,2));
    assert.deepEqual(errors,[]);
    assert(results.every(r=>r.unrelatedPreserved));
    const open=results.find(r=>r.scenario==='open-failure');assert(open.rejected&&open.recovered,'A temporary IndexedDB open failure poisoned subsequent attempts');
    const changed=results.find(r=>r.scenario==='version-change');assert.equal(changed.deletion,'deleted','The cached connection blocked a real versionchange/deletion');assert(changed.recreated);
    const write=results.find(r=>r.scenario==='write-failure');assert.equal(write.injectedAborts,1);assert.equal(write.usableFetchedVersion,'v2');assert(write.oldDatedCopyKept);assert.equal(write.offlineVersion,'v1');assert.equal(write.offlineRetrievedAt,'2026-10-29T12:00:00Z');assert.equal(write.retryVersion,'v2');assert.equal(write.savedVersion,'v2');assert.equal(write.requests,2);
    console.log('FCC cache initialization, versionchange and aborted-write recovery pass.');
  }finally{await browser.close()}
})().catch(error=>{console.error(error.stack);process.exitCode=1});

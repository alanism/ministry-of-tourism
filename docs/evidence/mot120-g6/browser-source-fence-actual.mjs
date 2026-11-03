import {createRequire} from 'node:module';
import {writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);const {chromium}=require('node_modules/playwright');
const browser=await chromium.launch({headless:true});const page=await browser.newPage();
await page.route('**/*',r=>/^https?:\/\/(127\.0\.0\.1|localhost):/.test(r.request().url())?r.continue():r.abort());
try{await page.goto('http://127.0.0.1:5195/');const result=await page.evaluate(async()=>{
 const c=await import('/@fs/C:/Users/alani/dev/mot120-wonder-g6-20261031/packages/core/src/index.ts');const s=await import('/src/trip/trip-store.ts');const id='source-fence-test',name='mot-trip:'+id+':v2';const d=c.createTrip({boardId:id,title:'Before',city:'Bangkok',timeZone:null});d.getMap('tripMeta').set('schemaVersion',2);const bytes=c.encodeTrip(d);d.getMap('tripMeta').set('title','Concurrent source edit');const changed=c.encodeTrip(d);d.destroy();
 const nativeOpen=indexedDB.open.bind(indexedDB);await new Promise(res=>{const r=nativeOpen(name);r.onupgradeneeded=()=>{r.result.createObjectStore('updates',{autoIncrement:true});r.result.createObjectStore('custom');};r.onsuccess=()=>{const db=r.result,tx=db.transaction('updates','readwrite');tx.objectStore('updates').add(bytes);tx.oncomplete=()=>{db.close();res();};};});
 const order=[];let writeOp;let injected=false;const desc=Object.getOwnPropertyDescriptor(IDBRequest.prototype,'onsuccess');const txNative=IDBDatabase.prototype.transaction;
 IDBDatabase.prototype.transaction=function(...args){const tx=txNative.apply(this,args);if(this.name==='mot-trip-pointers'&&args[1]==='readwrite')tx.addEventListener('complete',()=>order.push('pointer'));return tx;};
 indexedDB.open=function(...args){const req=nativeOpen(...args);if(args[0]==='mot-trip-pointers'&&!injected){injected=true;
  // This is the first registry creation: readAcceptedPointer does not create it.
  writeOp=new Promise((res,rej)=>{const r=nativeOpen(name);r.onsuccess=()=>{const db=r.result,tx=db.transaction('updates','readwrite');tx.objectStore('updates').add(changed);tx.oncomplete=()=>{order.push('source-write');db.close();res();};tx.onabort=()=>rej(tx.error);};});
  Object.defineProperty(req,'onsuccess',{configurable:true,set(fn){desc.set.call(req,event=>setTimeout(()=>fn.call(req,event),75));},get(){return desc.get.call(req);}});
 }return req;};
 try{const repaired=c.repairLegacyTrip(bytes,[]);const opened=await s.persistRepairedTrip(id,repaired,{bytes,storeName:name});opened.destroy();repaired.destroy();await writeOp;return {order};}finally{indexedDB.open=nativeOpen;IDBDatabase.prototype.transaction=txNative;}
});console.log(JSON.stringify(result));writeFileSync(new URL('./source-fence-result.json',import.meta.url),JSON.stringify(result));assert.deepEqual(result.order,['pointer','source-write']);}finally{await browser.close();}

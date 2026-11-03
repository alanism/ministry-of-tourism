import {afterEach,describe,expect,it,vi} from 'vitest';
import {createTrip,TripSession,writeAsset,captureBoardClipboard} from '@mot/core';
import * as Y from 'yjs';
const storage=vi.hoisted(()=>({blobs:new Map<string,Blob>(),full:false,writes:0}));
vi.mock('../state/blobs',()=>({hashBlob:async(blob:Blob)=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer()))].map(n=>n.toString(16).padStart(2,'0')).join(''),getBlob:async(hash:string)=>storage.blobs.get(hash)??null,putBlob:async(blob:Blob)=>{storage.writes++;if(storage.full)throw new DOMException('Full','QuotaExceededError');return 'stored';}}));
import {hashBlob} from '../state/blobs';
import {getTripBlob,storeTripBlob} from './trip-assets';
import {captureClipboardTransfer,pasteClipboardTransfer} from './board-clipboard-transfer';
const actor={kind:'human' as const,id:'owner',name:'Owner'};
let sequence=0;
const make=(newId?:()=>string)=>new TripSession(createTrip({title:'Trip',city:'London',timeZone:'Europe/London'}),{newId});
async function transfer(count:number){
 const source=make();const ids=[];
 for(let i=0;i<count;i++){const bytes=new Uint8Array(33);bytes.set([137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82]);const data=new DataView(bytes.buffer);data.setUint32(16,200+(++sequence));data.setUint32(20,100);const blob=new Blob([bytes],{type:'image/png'}),hash=await hashBlob(blob),id=`source-${sequence}`;storage.blobs.set(hash,blob);writeAsset(source.parts,{id,hash,mime:'image/png',role:'original'});ids.push(id);}
 const {id}=source.execute<{id:string}>(actor,'trip_card_create',{kind:'note',title:'Photo notes',assetIds:ids});
 return captureClipboardTransfer(captureBoardClipboard(source,{sourceCardId:id}),new AbortController().signal);
}
function decoder(failSecond=false){let n=0;const closed=vi.fn();vi.stubGlobal('createImageBitmap',vi.fn(async(blob:Blob)=>{if(failSecond&&++n===2)throw new DOMException('Bad original','InvalidStateError');const bytes=await blob.arrayBuffer(),d=new DataView(bytes);return{width:d.getUint32(16),height:d.getUint32(20),close:closed};}));return closed;}
afterEach(()=>{vi.unstubAllGlobals();storage.full=false;storage.writes=0;storage.blobs.clear();});
describe('real staged clipboard blob lifecycle',()=>{
 it('rolls RAM staging back when the preflighted graph rejects an injected second-ID collision',async()=>{
   decoder();const copy=await transfer(2);storage.blobs.clear();const target=make(()=> 'collision'),before=Y.encodeStateAsUpdate(target.doc);
   await expect(pasteClipboardTransfer(target,actor,copy,new AbortController().signal,{x:0,y:0,expectedRevision:target.boardRev})).rejects.toThrow(/collision/);
   expect(Y.encodeStateAsUpdate(target.doc)).toEqual(before);expect(target.undo(actor.id)).toBe(false);expect(storage.writes).toBe(0);
   for(const a of copy.graph.assets)expect(await getTripBlob(a.hash)).toBeNull();
 });
 it('a failed second native image leaves no metadata/history/storage writes and closes the first bitmap',async()=>{
   decoder();const copy=await transfer(2),closed=decoder(true),target=make(),before=Y.encodeStateAsUpdate(target.doc);
   await expect(pasteClipboardTransfer(target,actor,copy,new AbortController().signal,{x:0,y:0,expectedRevision:target.boardRev})).rejects.toThrow();
   expect(Y.encodeStateAsUpdate(target.doc)).toEqual(before);expect(storage.writes).toBe(0);expect(closed).toHaveBeenCalledTimes(1);
 });
 it('postcommit quota failure keeps complete private graph and real original bytes recoverable in this tab',async()=>{
   decoder();const copy=await transfer(1);storage.blobs.clear();storage.full=true;const target=make();
   await expect(pasteClipboardTransfer(target,actor,copy,new AbortController().signal,{x:0,y:0,expectedRevision:target.boardRev})).resolves.toEqual({persisted:false});
   expect(target.parts.cards.size).toBe(1);expect(target.parts.assets.size).toBe(1);expect(await (await getTripBlob(copy.graph.assets[0]!.hash))!.arrayBuffer()).toEqual(await copy.media[0]!.arrayBuffer());
   storage.full=false;await storeTripBlob(copy.media[0]!);
 });
});

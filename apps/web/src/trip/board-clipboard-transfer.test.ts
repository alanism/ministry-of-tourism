import {afterEach,describe,expect,it,vi} from 'vitest';
import {createTrip,TripSession,readAllCards,writeAsset,captureBoardClipboard} from '@mot/core';
import {captureClipboardTransfer,parseClipboardTransfer,pasteClipboardTransfer,CLIPBOARD_PREFIX} from './board-clipboard-transfer';
vi.mock('./trip-assets',()=>({getTripBlob:vi.fn(),commitTripBlobs:vi.fn()}));
import {getTripBlob,commitTripBlobs} from './trip-assets';
import {hashBlob} from '../state/blobs';
const human={kind:'human' as const,id:'you',name:'You'};
const make=()=>new TripSession(createTrip({title:'Trip',city:'London',timeZone:'Europe/London'}));
function png(w=200,h=100){const b=new Uint8Array(33);b.set([137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82]);const v=new DataView(b.buffer);v.setUint32(16,w);v.setUint32(20,h);return new Blob([b],{type:'image/png'});}
afterEach(()=>{vi.unstubAllGlobals();vi.clearAllMocks();});
async function image(){const source=make(),blob=png();writeAsset(source.parts,{id:'image',hash:await hashBlob(blob),mime:'image/png',role:'original',width:200,height:100});const {id}=source.execute<{id:string}>(human,'trip_presentation_create',{assetId:'image',surface:'board',x:.1,y:.1,width:.2,height:.1});vi.mocked(getTripBlob).mockResolvedValue(blob);vi.stubGlobal('createImageBitmap',vi.fn(async()=>({width:200,height:100,close:vi.fn()})));return{source,id,blob};}
describe('bounded clipboard originals transfer',()=>{
 it('roundtrips frozen originals, verifies SHA/header/dimensions and commits once on repeated callback',async()=>{
   const {source,id,blob}=await image();const transfer=await captureClipboardTransfer(captureBoardClipboard(source,{sourcePresentationId:id}),new AbortController().signal);
   const parsed=parseClipboardTransfer(transfer.text)!;expect(parsed.graph.assets).toHaveLength(1);
   const target=make(),revision=target.boardRev;
   vi.mocked(commitTripBlobs).mockImplementation(async(_blobs,apply)=>{const hashes=[await hashBlob(blob)];apply(hashes);apply(hashes);return{persisted:true};});
   const committed=vi.fn(()=>{throw new Error('Observer failed');});await pasteClipboardTransfer(target,human,parsed,new AbortController().signal,{x:120,y:120,expectedRevision:revision,onCommitted:committed});
   expect(target.parts.presentations.size).toBe(1);expect(committed).toHaveBeenCalledTimes(1);
 });
 it('rejects mismatched hashes and malformed/unknown recognized envelopes instead of text fallback',async()=>{
   const {source,id}=await image();const graph=captureBoardClipboard(source,{sourcePresentationId:id});graph.assets[0]!.hash='a'.repeat(64);
   await expect(captureClipboardTransfer(graph,new AbortController().signal)).rejects.toThrow(/checksum/);
   expect(parseClipboardTransfer('ordinary note')).toBeNull();
   for(const text of [CLIPBOARD_PREFIX+'2\n{}',CLIPBOARD_PREFIX+'1\n{}',CLIPBOARD_PREFIX+'1\n'+JSON.stringify({graph,media:[],authority:true})])expect(()=>parseClipboardTransfer(text)).toThrow();
 });
 it('accepts a multi-megabyte base64 transport within the cap without recursive-regex failure',async()=>{
   const {source,id}=await image(),graph=captureBoardClipboard(source,{sourcePresentationId:id});
   const text=CLIPBOARD_PREFIX+'1\n'+JSON.stringify({graph,media:[{id:'image',base64:btoa('a'.repeat(2*1024*1024))}]});
   expect(parseClipboardTransfer(text)!.media[0]!.size).toBe(2*1024*1024);
 });
 it('cancellation and stale target cannot stage or commit; a deliberate retry is independent',async()=>{
   const source=make();const {id}=source.execute<{id:string}>(human,'trip_card_create',{kind:'note',title:'A frozen note'});const graph=captureBoardClipboard(source,{sourceCardId:id});
   const transfer=await captureClipboardTransfer(graph,new AbortController().signal),target=make(),revision=target.boardRev;
   vi.mocked(commitTripBlobs).mockImplementation(async(_blobs,apply)=>{apply([]);return{persisted:false};});
   const cancelled=new AbortController();cancelled.abort();await expect(pasteClipboardTransfer(target,human,transfer,cancelled.signal,{x:0,y:0,expectedRevision:revision})).rejects.toThrow();expect(readAllCards(target.parts)).toHaveLength(0);
   target.execute(human,'trip_card_create',{kind:'note',title:'Changed'});
   await expect(pasteClipboardTransfer(target,human,transfer,new AbortController().signal,{x:0,y:0,expectedRevision:revision})).rejects.toThrow(/changed/);
   await pasteClipboardTransfer(target,human,transfer,new AbortController().signal,{x:0,y:0,expectedRevision:target.boardRev});expect(readAllCards(target.parts)).toHaveLength(2);
 });
});

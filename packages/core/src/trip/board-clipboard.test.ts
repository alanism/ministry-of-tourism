import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { createTrip, readAllCards, readAsset, readCard, readPresentations, writeAsset } from './model.ts';
import { TripSession } from './session.ts';
import { captureBoardClipboard, validateBoardClipboard, tripBoardPaste } from './board-clipboard.ts';
import { prevalidateProposal } from './proposals.ts';
import { encodeTrip, loadTrip } from './persist.ts';
import { exportTripPackage, sha256Hex } from './package.ts';
import { importTripPackage } from './import.ts';
const human = { kind: 'human' as const, id: 'owner', name: 'Owner' };
const make = (newId?: () => string) => new TripSession(createTrip({ title: 'Trip', city: 'London', timeZone: 'Europe/London' }), {newId});
function seed() {
  const source = make();
  const {id} = source.execute<{id:string}>(human, 'trip_card_create', {kind:'place',title:'Gallery',body:'Meet here',scope:'guide',sourceText:'Original source',travelerNote:'Take time',currentFacts:[{field:'hours',value:'FORGED HOURS',evidenceUrl:'https://venue.example/hours',observedAt:'2026-11-01'}],booking:{status:'confirmed',reference:'SECRET'},assetIds:['derivative'],x:800,y:600});
  writeAsset(source.parts,{id:'original',hash:'a'.repeat(64),mime:'image/png',role:'original',credit:'Artist'});
  writeAsset(source.parts,{id:'derivative',hash:'b'.repeat(64),mime:'image/png',role:'derivative',derivedFrom:'original',credit:'Artist'});
  return {source,id};
}
const args=(target:TripSession,graph:ReturnType<typeof captureBoardClipboard>)=>({graph,targetBoardId:target.boardId,expectedRevision:target.boardRev,x:120,y:160});
const state=(s:TripSession)=>Y.encodeStateAsUpdate(s.doc);
describe('bounded private cross-board graph',()=>{
  it('freezes source, remaps complete ancestry, strips authority, inserts one undo/redo on a populated target',()=>{
    const {source,id}=seed(), before=state(source), graph=captureBoardClipboard(source,{sourceCardId:id});
    expect(graph.cards[0]).not.toHaveProperty('currentFacts'); expect(graph.cards[0]).not.toHaveProperty('booking');
    expect(graph.cards[0]!.sourceText).toContain('Imported observations - unverified clipboard data');
    expect(graph.cards[0]!.sourceText).toContain('FORGED HOURS');
    const target=make();for(let i=0;i<50;i++)target.execute(human,'trip_card_create',{kind:'note',title:`Existing ${i}`});
    const result=target.execute<{cardIds:string[]}>(human,'trip_board_paste',args(target,graph));
    const copy=readCard(target.parts,result.cardIds[0]!)!;
    expect(copy).toMatchObject({title:'Gallery',scope:'private',provenance:'traveler',createdBy:'owner',x:120,y:160,travelerNote:'Take time'});
    expect(copy.currentFacts).toBeUndefined();expect(copy.booking).toBeUndefined();expect(copy.lineage).toBeUndefined();
    expect(copy.assetIds[0]).not.toBe('derivative');const asset=readAsset(target.parts,copy.assetIds[0]!)!;
    expect(asset.derivedFrom).not.toBe('original');expect(readAsset(target.parts,asset.derivedFrom!)!.credit).toBe('Artist');
    expect(state(source)).toEqual(before);expect(target.parts.assets.size).toBe(2);
    expect(target.undo(human.id)).toBe(true);expect(readAllCards(target.parts)).toHaveLength(50);expect(target.parts.assets.size).toBe(0);
    expect(target.redo(human.id)).toBe(true);expect(readAllCards(target.parts)).toHaveLength(51);
    const reloaded=loadTrip(encodeTrip(target.doc));expect(readCard(new TripSession(reloaded).parts,copy.id)!.currentFacts).toBeUndefined();
  });
  it('rejects agents, stale board/revision, unknown authority fields, cycles, unused media and missing ancestry with no writes',()=>{
    const {source,id}=seed(),graph=captureBoardClipboard(source,{sourceCardId:id});const target=make(), before=state(target);
    const cases=[{...args(target,graph),targetBoardId:'foreign'},{...args(target,graph),expectedRevision:10}, {...args(target,graph),graph:{...graph,cards:[{...graph.cards[0],currentFacts:[]}]}}, {...args(target,graph),graph:{...graph,assets:graph.assets.filter(a=>a.id!=='original')}}, {...args(target,graph),graph:{...graph,assets:graph.assets.map(a=>({...a,derivedFrom:'derivative'}))}}, {...args(target,graph),graph:{...graph,assets:[...graph.assets,{id:'unused',hash:'c'.repeat(64),mime:'image/png',role:'original'}]}}];
    for(const input of cases){expect(()=>target.execute(human,'trip_board_paste',input)).toThrow();expect(state(target)).toEqual(before);}
    expect(()=>target.execute({kind:'agent',id:'bot',name:'Bot'},'trip_board_paste',args(target,graph))).toThrow(/person/);
    expect(()=>tripBoardPaste.run({doc:target.doc,parts:target.parts,actor:{kind:'agent',id:'bot',name:'Bot'},newId:()=> 'x'},args(target,graph))).toThrow(/person/);
  });
  it('preflights injected collisions and out-of-board geometry before any asset/card/history writes',()=>{
    const {source,id}=seed(),graph=captureBoardClipboard(source,{sourceCardId:id});
    for(const newId of [()=> 'duplicate',()=> 'original',()=> '']){
      const target=make(newId), before=state(target);expect(()=>target.execute(human,'trip_board_paste',args(target,graph))).toThrow();expect(state(target)).toEqual(before);expect(target.undo(human.id)).toBe(false);
    }
    const target=make(),before=state(target);expect(()=>target.execute(human,'trip_board_paste',{...args(target,graph),x:9900})).toThrow();expect(state(target)).toEqual(before);
  });
  it('keeps cropped board geometry private, excludes magazine/locked images, and refuses oversized complete source text',()=>{
    const {source,id}=seed();const {id:p}=source.execute<{id:string}>(human,'trip_presentation_create',{assetId:'derivative',surface:'board',x:.1,y:.2,width:.3,height:.15,crop:[.1,.2,.7,.6],rotation:0,zIndex:9,scope:'stay'});
    const target=make();target.execute(human,'trip_board_paste',args(target,captureBoardClipboard(source,{sourcePresentationId:p})));
    expect(readPresentations(target.parts)[0]).toMatchObject({surface:'board',scope:'private',x:.012,y:.016,width:.3,height:.15,crop:[.1,.2,.7,.6],rotation:0});
    source.execute(human,'trip_presentation_update',{id:p,locked:true});expect(()=>captureBoardClipboard(source,{sourcePresentationId:p})).toThrow(/locked/);
    source.execute(human,'trip_card_update',{id,sourceText:'a'.repeat(100000)});expect(()=>captureBoardClipboard(source,{sourceCardId:id})).toThrow();
  });
  it('protects a pasted private original ancestor from agent re-reference or metadata replacement',()=>{
    const {source,id}=seed(),target=make();target.execute(human,'trip_board_paste',args(target,captureBoardClipboard(source,{sourceCardId:id})));
    const ancestor=[...target.parts.assets.keys()].find(id=>readAsset(target.parts,id)!.role==='original')!,before=state(target),agent={kind:'agent' as const,id:'bot',name:'Bot'};
    expect(()=>target.execute(agent,'trip_card_create',{kind:'photo',title:'Expose original',assetIds:[ancestor]})).toThrow(/private/);
    expect(()=>target.execute(agent,'trip_asset_register',{asset:readAsset(target.parts,ancestor)!})).toThrow(/private/);
    expect(state(target)).toEqual(before);
    const {id:publicCard}=target.execute<{id:string}>(human,'trip_card_create',{kind:'note',title:'Shared',scope:'guide'});
    const fresh={id:'fresh-derived',hash:'c'.repeat(64),mime:'image/png',role:'derivative',derivedFrom:ancestor};
    const guarded=state(target);
    for(const command of ['trip_asset_register','trip_asset_attach'])expect(()=>target.execute(agent,command,{asset:fresh,...(command==='trip_asset_attach'?{cardId:publicCard}:{})})).toThrow(/private/);
    expect(()=>prevalidateProposal(target,{id:'proposal',boardId:target.boardId,token:target.token([publicCard]),ops:[{command:'trip_asset_attach',input:{cardId:publicCard,asset:fresh}}],sources:[],reason:'test',author:'bot',status:'proposed'})).toThrow(/private/);
    expect(state(target)).toEqual(guarded);
    expect(()=>target.execute(agent,'trip_card_create',{kind:'note',title:'No media'})).not.toThrow();
    expect(()=>target.execute(agent,'trip_asset_register',{asset:{...fresh,id:'public-original',role:'original',derivedFrom:undefined}})).not.toThrow();
  });
  it('protects multi-hop ancestry owned by a private board image, including proposed fresh derivatives',()=>{
    const {source}=seed();writeAsset(source.parts,{id:'top',hash:'d'.repeat(64),mime:'image/png',role:'derivative',derivedFrom:'derivative'});
    const {id}=source.execute<{id:string}>(human,'trip_presentation_create',{assetId:'top',surface:'board',x:.1,y:.1,width:.2,height:.1});
    const target=make();target.execute(human,'trip_board_paste',args(target,captureBoardClipboard(source,{sourcePresentationId:id})));
    const ancestor=[...target.parts.assets.keys()].find(id=>readAsset(target.parts,id)!.role==='original')!,agent={kind:'agent' as const,id:'bot',name:'Bot'};
    const {id:publicCard}=target.execute<{id:string}>(human,'trip_card_create',{kind:'note',title:'Shared',scope:'guide'}),before=state(target);
    for(const input of [{cardId:publicCard,asset:readAsset(target.parts,ancestor)!},{cardId:publicCard,asset:{id:'new-derivative',hash:'e'.repeat(64),mime:'image/png',role:'derivative',derivedFrom:ancestor}}])expect(()=>target.execute(agent,'trip_asset_attach',input)).toThrow(/private/);
    expect(()=>target.execute(agent,'trip_presentation_create',{cardId:publicCard,assetId:ancestor,x:0,y:0,width:.1,height:.1})).toThrow(/private/);
    expect(state(target)).toEqual(before);
  });
  it('keeps an accepted snapshot frozen after source edits and refuses incomplete/over-budget source closure',()=>{
    const {source,id}=seed(),graph=captureBoardClipboard(source,{sourceCardId:id});source.execute(human,'trip_card_update',{id,title:'Changed after copy'});
    expect(graph.cards[0]!.title).toBe('Gallery');
    const bad=structuredClone(graph),target=make();bad.assets[0]!.derivedFrom='not-present';expect(()=>target.execute(human,'trip_board_paste',args(target,bad))).toThrow(/Missing media/);
    expect(()=>validateBoardClipboard({...graph,cards:Array.from({length:5},(_,i)=>({...graph.cards[0],id:`unicode-${i}`,sourceText:'漢'.repeat(100000)}))})).toThrow(/1 MiB/);
    let previous='original';for(let i=0;i<5;i++){const id=`extra-${i}`;writeAsset(source.parts,{id,hash:'f'.repeat(64),mime:'image/png',role:'derivative',derivedFrom:previous});previous=id;}
    const {id:large}=source.execute<{id:string}>(human,'trip_card_create',{kind:'photo',title:'Long ancestry',assetIds:[previous]});expect(()=>captureBoardClipboard(source,{sourceCardId:large})).toThrow();
  });
  it('roundtrips remapped ancestry, original bytes and unverified observations through real private ZIP',async()=>{
    const {source,id}=seed(),graph=captureBoardClipboard(source,{sourceCardId:id});
    const bytes=new Map<string,Uint8Array>();for(const a of graph.assets){const b=new Uint8Array([1,2,a.id.length]);a.hash=await sha256Hex(b);bytes.set(a.id,b);}
    const target=make();target.execute(human,'trip_board_paste',args(target,graph));
    const remapped=new Map([...target.parts.assets.keys()].map(id=>{const a=readAsset(target.parts,id)!;return [id,[...bytes.values()].find(b=>b[2]===(a.role==='original'?'original':'derivative').length)!] as const;}));
    const archive=await exportTripPackage(target.doc,remapped,{includePrivate:true});const imported=await importTripPackage(archive);
    const parts=new TripSession(imported.doc).parts;expect(parts.assets.size).toBe(2);const c=readAllCards(parts)[0]!;expect(c.currentFacts).toBeUndefined();expect(c.sourceText).toContain('FORGED HOURS');
    const derivative=readAsset(parts,c.assetIds[0]!)!;expect(readAsset(parts,derivative.derivedFrom!)).toBeDefined();expect(imported.assets.get(derivative.derivedFrom!)).toEqual(remapped.get(derivative.derivedFrom!));
  });
});

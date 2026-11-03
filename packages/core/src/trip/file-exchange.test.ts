import { expect, it, vi } from 'vitest';
import { createTrip, readAllCards, readCard } from './model.ts';
import { encodeTrip, loadTrip } from './persist.ts';
import { TripSession } from './session.ts';
import { FileExchange, type FileExchangeStore, type FileContextRecord, type FileProposalRecord, type ContextRequest, type ProposalEnvelope, type FileExchangeOptions } from './file-exchange.ts';
const actor = {kind:'human' as const,id:'owner',name:'Owner'};
const now = Date.parse('2026-11-02T07:00:00Z');
const json = (value:unknown) => new TextEncoder().encode(JSON.stringify(value));
class Store implements FileExchangeStore {
  private tail=Promise.resolve();
  async withBoardLock<T>(_board:string,work:()=>Promise<T>):Promise<T>{const prior=this.tail;let release!:()=>void;this.tail=new Promise(resolve=>{release=resolve;});await prior;try{return await work();}finally{release();}}
  contexts = new Map<string,FileContextRecord>(); proposals = new Map<string,FileProposalRecord>(); fail = false; afterWrite?: (record:FileProposalRecord)=>void;
  async getContext(_b:string,id:string) { return structuredClone(this.contexts.get(id)??null); }
  async getProposal(_b:string,id:string) { return structuredClone(this.proposals.get(id)??null); }
  async putContext(record:FileContextRecord,expected:number|null) { if(this.fail)throw Error('Storage full');if((this.contexts.get(record.contextRequestId)?.version??null)!==expected)throw Error('CAS conflict');this.contexts.set(record.contextRequestId,structuredClone(record)); }
  async putProposal(record:FileProposalRecord,expected:number|null) { if(this.fail)throw Error('Storage full');if((this.proposals.get(record.proposalId)?.version??null)!==expected)throw Error('CAS conflict');this.proposals.set(record.proposalId,structuredClone(record));this.afterWrite?.(record); }
  async list(_b:string) {return [...this.proposals.values()].map(record=>structuredClone(record));}
}
function fixture() {
  const session = new TripSession(createTrip({boardId:'trip',title:'Synthetic trip',city:'Aspen',cityId:'aspen',timeZone:'America/Denver'}));
  const card = session.execute<{id:string}>(actor,'trip_card_create',{kind:'note',title:'Selected',body:'Shared words',scope:'stay'}).id;
  const outside = session.execute<{id:string}>(actor,'trip_card_create',{kind:'note',title:'Not selected',scope:'stay'}).id;
  const privateId = session.execute<{id:string}>(actor,'trip_card_create',{kind:'note',title:'PRIVATE_CANARY',body:'door code',scope:'private'}).id;
  const store = new Store();
  const options:FileExchangeOptions = {documentIdentity:'native-store-one',readDocumentIdentity:async()=> 'native-store-one',now:()=>now,whenSaved:async()=>{},hasAssetBytes:async()=>false,hasPendingNativeProposalId:()=>false};
  const service = new FileExchange(session,actor,store,options);
  return {session,card,outside,privateId,store,options,service};
}
async function issue(f:ReturnType<typeof fixture>) {return (await f.service.issue({selectedCardIds:[f.card],guideVersion:'guide-1',catalogSnapshot:'snapshot-1'})).context;}
function envelope(context:ContextRequest,id='proposal',ops:ProposalEnvelope['proposal']['ops']=[{command:'trip_card_update',input:{id:context.selectedCardIds[0],title:'Changed'}}]):ProposalEnvelope {return {format:'mot.proposal',version:1,contextRequestId:context.contextRequestId,boardId:context.boardId,baseBoardRevision:context.baseBoardRevision,contextDigest:context.contextDigest,createdAt:context.createdAt,expiresAt:context.expiresAt,proposal:{id,boardId:context.boardId,token:context.nativeToken,ops,sources:[],reason:'Synthetic suggestion',author:'untrusted model',status:'proposed'}};}

it('durably issues an explicit field allowlist and refuses private/oversized selection and failed storage',async()=>{
  const f=fixture(),context=await issue(f),text=JSON.stringify(context);
  expect(text).toContain('Shared words');expect(text).not.toContain('PRIVATE_CANARY');expect(text).not.toContain('Not selected');expect(Object.keys(context.context.cards[0]!).sort()).toEqual(['assetIds','body','id','kind','scope','title']);expect(f.store.contexts.size).toBe(1);
  await expect(f.service.issue({selectedCardIds:[f.privateId],guideVersion:'1',catalogSnapshot:'1'})).rejects.toThrow();
  await expect(f.service.issue({selectedCardIds:Array(101).fill(f.card),guideVersion:'1',catalogSnapshot:'1'})).rejects.toThrow();
  f.store.fail=true;await expect(issue(f)).rejects.toThrow();
});
it('permits an unapplied request after same-profile native reopen, but refuses another profile/imported store identity',async()=>{
  const f=fixture(),context=await issue(f),bytes=json(envelope(context)),reopened=new TripSession(loadTrip(encodeTrip(f.session.doc)));
  const service=new FileExchange(reopened,actor,f.store,f.options);expect((await service.importProposal(bytes)).proposalId).toBe('proposal');
  await expect(new FileExchange(reopened,actor,new Store(),f.options).importProposal(bytes)).rejects.toThrow();
  await expect(new FileExchange(reopened,actor,f.store,{...f.options,documentIdentity:'imported',readDocumentIdentity:async()=> 'imported'}).importProposal(bytes)).rejects.toThrow();
});
it('checks exact outer/inner/token/digest/expiry bindings and schema before review',async()=>{
  const f=fixture(),context=await issue(f),good=envelope(context);
  for(const patch of [{boardId:'other'},{contextDigest:'a'.repeat(64)},{baseBoardRevision:999},{expiresAt:'2026-11-04T07:00:00Z'},{version:2},{owner:true}])await expect(f.service.importProposal(json({...good,...patch}))).rejects.toThrow();
  await expect(f.service.importProposal(json({...good,proposal:{...good.proposal,token:{...good.proposal.token,cardRevs:{}}}}))).rejects.toThrow();
  await expect(f.service.importProposal(json(envelope(context,'outside',[{command:'trip_card_update',input:{id:f.outside,title:'escape'}}])))).rejects.toThrow();
  await expect(f.service.importProposal(json(envelope(context,'grant',[{command:'trip_card_update',input:{id:f.card,scope:'guide'}}])))).rejects.toThrow();
});
it('reserves the whole envelope immutably, accepting formatting-equivalent retry but rejecting changed bodies including expiry',async()=>{
  const f=fixture(),context=await issue(f),body=envelope(context);const first=await f.service.importProposal(json(body));
  expect((await f.service.importProposal(new TextEncoder().encode(JSON.stringify(body,null,2)))).envelopeHash).toBe(first.envelopeHash);
  for(const changed of [{...body,expiresAt:'2026-11-02T08:00:00Z'},{...body,proposal:{...body.proposal,reason:'changed'}}])await expect(f.service.importProposal(json(changed))).rejects.toThrow(/conflict/i);
  await f.service.reject(first);await expect(f.service.apply(first)).rejects.toThrow();await expect(f.service.importProposal(json({...body,proposal:{...body.proposal,author:'other'}}))).rejects.toThrow(/conflict/i);
});
it('refuses unknown legacy full/partial/pending/Undo identities before adopting or mutating them',async()=>{
  for(const kind of ['full','partial','pending','undo']){
    const f=fixture(),context=await issue(f);if(kind==='full')f.session.parts.applied.set('proposal',true);if(kind==='partial')f.session.parts.applied.set('proposal',{ops:[0],revs:{}});if(kind==='pending')f.options.hasPendingNativeProposalId=()=>true;if(kind==='undo')vi.spyOn(f.session,'canUndo').mockReturnValue(true);
    await expect(f.service.importProposal(json(envelope(context)))).rejects.toThrow();expect(f.store.proposals.size).toBe(0);
  }
});
it('applies partial choices once, journals before mutation, persists receipts and preserves unrelated work on trusted Undo',async()=>{
  const f=fixture(),context=await issue(f),body=envelope(context,'proposal',[{command:'trip_card_update',input:{id:f.card,title:'Changed'}},{command:'trip_card_create',input:{kind:'note',title:'New idea'}}]);
  const review=await f.service.importProposal(json(body)),execute=f.session.executeAll.bind(f.session);vi.spyOn(f.session,'executeAll').mockImplementation((...args)=>{expect(f.store.proposals.get('proposal')?.state).toBe('applying');return execute(...args);});
  expect(await f.service.apply(review,[0])).toMatchObject({appliedOps:1,remainingOps:1,persisted:true});expect(await f.service.apply(review,[0])).toMatchObject({appliedOps:0,remainingOps:1});expect(await f.service.apply(review,[1])).toMatchObject({appliedOps:1,remainingOps:0,persisted:true});
  f.session.execute(actor,'trip_card_update',{id:f.outside,title:'Unrelated later edit'});expect(await f.service.undo(review)).toMatchObject({state:'undone',persisted:true});expect(readCard(f.session.parts,f.card)?.title).toBe('Selected');expect(readCard(f.session.parts,f.outside)?.title).toBe('Unrelated later edit');expect(readAllCards(f.session.parts).some(c=>c.title==='New idea')).toBe(false);await expect(f.service.apply(review)).rejects.toThrow();
});
it('preflights an invalid last selected operation without applying the first',async()=>{
  const f=fixture(),context=await issue(f),before=encodeTrip(f.session.doc);
  await expect(f.service.importProposal(json(envelope(context,'bad',[{command:'trip_card_update',input:{id:f.card,title:'Must not land'}},{command:'trip_task_set_status',input:{id:f.card,status:'done'}}])))).rejects.toThrow();expect(encodeTrip(f.session.doc)).toEqual(before);
});
it('fails closed at reservation, intent, cancellation and stale async boundaries',async()=>{
  const f=fixture(),context=await issue(f),before=encodeTrip(f.session.doc);f.store.fail=true;await expect(f.service.importProposal(json(envelope(context)))).rejects.toThrow();expect(encodeTrip(f.session.doc)).toEqual(before);f.store.fail=false;
  const review=await f.service.importProposal(json(envelope(context))),controller=new AbortController();f.store.afterWrite=record=>{if(record.state==='applying')controller.abort();};await expect(f.service.apply(review,null,controller.signal)).rejects.toThrow();expect(encodeTrip(f.session.doc)).toEqual(before);await expect(f.service.apply(review)).rejects.toThrow();
});
it('keeps save failures editable and allows persistence retry without executing twice',async()=>{
  const f=fixture(),context=await issue(f),review=await f.service.importProposal(json(envelope(context)));f.options.whenSaved=async()=>{throw Error('Quota full');};
  const receipt=await f.service.apply(review);expect(receipt).toMatchObject({persisted:false,state:'applied-in-memory'});expect(readCard(f.session.parts,f.card)?.title).toBe('Changed');const revision=f.session.boardRev;
  await expect(f.service.apply(review)).rejects.toThrow();f.options.whenSaved=async()=>{};expect(await f.service.retryPersistence(review)).toMatchObject({persisted:true});expect(f.session.boardRev).toBe(revision);
});
it('locks uncertain post-apply journal failures and never replays after a crash or partial reload',async()=>{
  const f=fixture(),context=await issue(f),review=await f.service.importProposal(json(envelope(context)));f.store.afterWrite=record=>{if(record.state==='applying')f.store.fail=true;};
  expect(await f.service.apply(review)).toMatchObject({persisted:false,state:'recovery-required'});const after=encodeTrip(f.session.doc);f.store.fail=false;const reopened=new TripSession(loadTrip(after)),beforeImport=encodeTrip(reopened.doc),next=new FileExchange(reopened,actor,f.store,f.options);await expect(next.importProposal(json(envelope(context)))).rejects.toThrow();expect(encodeTrip(reopened.doc)).toEqual(beforeImport);
});
it('rejects revoked/expired requests, forged handles, changed documents and cancelled sessions',async()=>{
  const f=fixture(),context=await issue(f),body=envelope(context),review=await f.service.importProposal(json(body));await expect(f.service.apply({...review})).rejects.toThrow();await f.service.revoke(context.contextRequestId);await expect(f.service.apply(review)).rejects.toThrow();
  const g=fixture(),request=await issue(g),handle=await g.service.importProposal(json(envelope(request)));g.session.execute(actor,'trip_card_update',{id:g.outside,title:'Revision changed'});await expect(g.service.apply(handle)).rejects.toThrow();g.service.cancel();await expect(issue(g)).rejects.toThrow();
});
it('cannot attach unselected/private/media metadata or accept more than fifty operations',async()=>{
  const f=fixture(),context=await issue(f),asset={id:'unselected',hash:'b'.repeat(64),mime:'image/png',role:'original'};
  await expect(f.service.importProposal(json(envelope(context,'media',[{command:'trip_asset_attach',input:{cardId:f.card,asset}}])))).rejects.toThrow();
  await expect(f.service.importProposal(json(envelope(context,'too-many',Array(51).fill({command:'trip_card_create',input:{kind:'note'}}))))).rejects.toThrow();
});
it('hashes the exact whole envelope without collapsing native defaults into one identity',async()=>{
 const f=fixture(),context=await issue(f),body=envelope(context,'defaults',[{command:'trip_card_create',input:{kind:'note'}}]);await f.service.importProposal(json(body));
 await expect(f.service.importProposal(json({...body,proposal:{...body.proposal,ops:[{command:'trip_card_create',input:{kind:'note',title:''}}]}}))).rejects.toThrow(/conflict/i);
});
it('refuses pending native identity collisions introduced after file reservation',async()=>{
 const f=fixture(),context=await issue(f),review=await f.service.importProposal(json(envelope(context))),before=encodeTrip(f.session.doc);f.options.hasPendingNativeProposalId=()=>true;await expect(f.service.apply(review)).rejects.toThrow();expect(encodeTrip(f.session.doc)).toEqual(before);
});
it('journals expiry without freeing the immutable reservation',async()=>{
 const f=fixture(),context=await issue(f),body=envelope(context),review=await f.service.importProposal(json(body));f.options.now=()=>now+86400001;await expect(f.service.apply(review)).rejects.toThrow();expect(f.store.proposals.get('proposal')?.state).toBe('expired');await expect(f.service.importProposal(json({...body,proposal:{...body.proposal,reason:'reuse'}}))).rejects.toThrow(/conflict/i);
});
it('keeps an edited but unapplied context usable through native GC on ordinary reload',async()=>{
 const f=fixture();f.session.execute(actor,'trip_card_update',{id:f.card,title:'Edited before issue'});const context=await issue(f),reopened=new TripSession(loadTrip(encodeTrip(f.session.doc))),service=new FileExchange(reopened,actor,f.store,f.options);const review=await service.importProposal(json(envelope(context)));expect(await service.apply(review)).toMatchObject({appliedOps:1,persisted:true});
});
it('preserves source evidence and only permits traveler-note updates on selected source cards',async()=>{
 const f=fixture();f.session.execute(actor,'trip_card_update',{id:f.card,source:{id:'published',retrievedAt:'2026-11-02'},sourceText:'Original published text'});const context=await issue(f);await expect(f.service.importProposal(json(envelope(context,'overwrite',[{command:'trip_card_update',input:{id:f.card,body:'Replacement source'}}])))).rejects.toThrow();expect((await f.service.importProposal(json(envelope(context,'note',[{command:'trip_card_update',input:{id:f.card,travelerNote:'My note'}}])))).proposalId).toBe('note');
});
it('holds the board-wide lock through native mutation and serializes revocation with Apply',async()=>{
 const f=fixture(),context=await issue(f),review=await f.service.importProposal(json(envelope(context)));let locked=false;const actual=f.store.withBoardLock.bind(f.store);vi.spyOn(f.store,'withBoardLock').mockImplementation((board,work)=>actual(board,async()=>{locked=true;try{return await work();}finally{locked=false;}}));const execute=f.session.executeAll.bind(f.session);vi.spyOn(f.session,'executeAll').mockImplementation((...args)=>{expect(locked).toBe(true);return execute(...args);});expect(await f.service.apply(review)).toMatchObject({persisted:true});await f.service.revoke(context.contextRequestId);expect(f.store.withBoardLock).toHaveBeenCalledTimes(2);
});

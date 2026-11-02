import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {expect,it,vi} from 'vitest';
import {createTrip,TripSession,type FileReview} from '@writers-board/core';
import {fileOperationDiff,importOwnProposalFile,OwnMuseFiles,type OwnMuseFilesProps} from './OwnMuseFiles';
import {MusePlan} from './MusePlan';
const actor={kind:'human' as const,id:'owner',name:'Owner'};
function fixture(){const session=new TripSession(createTrip({title:'Synthetic trip',city:'Aspen',cityId:'aspen',timeZone:'America/Denver'}));const {id}=session.execute<{id:string}>(actor,'trip_card_create',{kind:'note',title:'Public selected candidate',body:'Exact visible body\nSecond line',scope:'stay'});session.execute(actor,'trip_card_create',{kind:'note',title:'PRIVATE_UI_CANARY',body:'PRIVATE_BODY_CANARY',scope:'private'});const props:OwnMuseFilesProps={session,actor,open:{doc:session.doc} as OwnMuseFilesProps['open'],tick:session.boardRev,active:true,onClose:()=>{},onExport:()=>{},refresh:()=>{},whenSaved:async()=>{},hasPendingNativeProposalId:()=>false};return{session,id,props};}
it('shows explicit text selection, disclosure, local recovery and independent guide/schema paths without private card names',()=>{
 const {props,session}=fixture(),html=renderToStaticMarkup(createElement(OwnMuseFiles,props));for(const label of ['Use your own Muse with files','Public selected candidate','Exact visible body','Nothing is uploaded automatically','Download guide','Download schema','Import proposal file','Paste complete proposal JSON'])expect(html).toContain(label);expect(html).not.toContain('PRIVATE_UI_CANARY');expect(html).not.toContain('PRIVATE_BODY_CANARY');expect(html).not.toContain('type="checkbox" checked=""');session.destroy();
});
it('keeps a hidden file workflow absent from the rendered page',()=>{const {props,session}=fixture();expect(renderToStaticMarkup(createElement(OwnMuseFiles,{...props,active:false}))).toBe('');session.destroy();});
it('describes exact changed fields without replacing untouched content or collapsing authored empty',()=>{
 const {session,id}=fixture();expect(fileOperationDiff(session,{command:'trip_card_update',input:{id,title:'',travelerNote:'New personal note'}}).fields).toEqual([{name:'title',before:'Public selected candidate',after:''},{name:'travelerNote',before:undefined,after:'New personal note'}]);expect(fileOperationDiff(session,{command:'trip_card_move',input:{id,stage:'remember'}}).fields).toEqual([{name:'stage',before:'plan',after:'remember'}]);expect(fileOperationDiff(session,{command:'trip_asset_attach',input:{cardId:id,asset:{id:'permitted'}}}).fields).toEqual([{name:'assetIds',before:[],after:['permitted']}]);session.destroy();
});
it('rejects oversized file bytes before arrayBuffer and checks cancellation before local import',async()=>{
 const service={importProposal:vi.fn(async()=>({proposalId:'p'} as FileReview))},arrayBuffer=vi.fn(async()=>new ArrayBuffer(1));await expect(importOwnProposalFile({size:524289,arrayBuffer},service,new AbortController().signal)).rejects.toThrow(/512 KiB/);expect(arrayBuffer).not.toHaveBeenCalled();
 const controller=new AbortController();const pending=importOwnProposalFile({size:1,arrayBuffer:async()=>{controller.abort();return new ArrayBuffer(1);}},service,controller.signal);await expect(pending).rejects.toThrow();expect(service.importProposal).not.toHaveBeenCalled();
});
it('passes a bounded file only to the existing local validator and rejects a late cancelled result',async()=>{
 const controller=new AbortController(),service={importProposal:vi.fn(async(bytes:Uint8Array)=>{expect([...bytes]).toEqual([123,125]);controller.abort();return{proposalId:'p'} as FileReview;})};await expect(importOwnProposalFile({size:2,arrayBuffer:async()=>new Uint8Array([123,125]).buffer},service,controller.signal)).rejects.toThrow();expect(service.importProposal).toHaveBeenCalledOnce();
});
it('makes the independent file route available inside Ask Muse even before its server connection is ready',()=>{
 const {session}=fixture(),html=renderToStaticMarkup(createElement(MusePlan,{session,actor,onAvailability:()=>{},onState:()=>{},onGhosts:()=>{},refresh:()=>{},onClose:()=>{},notify:()=>{},onOwnFiles:()=>{}}));expect(html).toContain('Use your own Muse with files');session.destroy();
});

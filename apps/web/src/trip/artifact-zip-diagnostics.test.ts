import {describe,expect,it,vi} from 'vitest';
import {createTrip,diagnosticText,TripSession,type DiagnosticReceipt} from '@writers-board/core';
import {createTripArtifact} from './artifacts';
const blobState=vi.hoisted(()=>({blob:null as Blob|null}));
vi.mock('../state/blobs',()=>({
  getBlob:async()=>blobState.blob,
  putBlob:async()=>{},
  hashBlob:async(blob:Blob)=>{const digest=await crypto.subtle.digest('SHA-256',await blob.arrayBuffer());return [...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,'0')).join('');},
}));
const session=()=>new TripSession(createTrip({title:'Private ZIP title',city:'Bilbao',timeZone:null}));
const sha256=async(value:string)=>{const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));return [...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,'0')).join('');};
async function classifiedLayoutFailure(blob:Blob|null,hash:string){
  blobState.blob=blob;
  const value=session();
  const actor={id:'zip-diagnostics-test'} as never;
  value.execute(actor,'trip_asset_register',{asset:{id:'selected-image',hash,mime:'image/png',role:'original',width:1,height:1}});
  value.execute(actor,'trip_presentation_create',{assetId:'selected-image',x:0,y:0,width:.2,height:.2,crop:[0,0,1,1],scope:'private'});
  const receipts:DiagnosticReceipt[]=[];const phases:string[]=[];
  await expect(createTripArtifact(value,'zip',undefined,{includePrivate:true,onDiagnostic:receipt=>receipts.push(receipt),onState:state=>phases.push(state.phase)})).rejects.toThrow();
  return {receipt:receipts.at(-1)!,phases};
}
describe('actual ZIP artifact failure diagnostics',()=>{
  it('publishes an enriched cancelled diagnostic with no raw or private context',async()=>{
    blobState.blob=null;
    const controller=new AbortController();controller.abort();const receipts:DiagnosticReceipt[]=[];const phases:string[]=[];
    await expect(createTripArtifact(session(),'zip',controller.signal,{includePrivate:false,onDiagnostic:receipt=>receipts.push(receipt),onState:state=>phases.push(state.phase)})).rejects.toThrow();
    expect(phases.at(-1)).toBe('cancelled');
    expect(phases).not.toContain('exported');
    const receipt=receipts.at(-1)!;
    expect(receipt.errorClass).toBe('cancelled');
    expect(receipt.step).toBe('collect');
    const text=diagnosticText(receipt);
    expect(text).not.toContain('Private ZIP title');
    expect(text).not.toContain('AbortError');
    expect(JSON.parse(text)).not.toHaveProperty('message');
    expect(JSON.parse(text)).not.toHaveProperty('error');
  });
  it('classifies an actual missing selected image at the layout step',async()=>{
    const {receipt,phases}=await classifiedLayoutFailure(null,await sha256('expected image bytes'));
    expect(phases.at(-1)).toBe('failed');
    expect(phases).not.toContain('exported');
    expect(receipt.errorClass).toBe('unavailable');
    expect(receipt.step).toBe('layout');
    const text=diagnosticText(receipt);
    expect(text).toContain('"step": "layout"');
    expect(text).not.toContain('Private ZIP title');
    expect(JSON.parse(text)).not.toHaveProperty('message');
    expect(JSON.parse(text)).not.toHaveProperty('error');
  });
  it('classifies an actual checksum mismatch at the layout step',async()=>{
    const {receipt,phases}=await classifiedLayoutFailure(new Blob(['corrupt image bytes'],{type:'image/png'}),await sha256('expected image bytes'));
    expect(phases.at(-1)).toBe('failed');
    expect(phases).not.toContain('exported');
    expect(receipt.errorClass).toBe('invalid_input');
    expect(receipt.step).toBe('layout');
    const text=diagnosticText(receipt);
    expect(text).toContain('"step": "layout"');
    expect(text).not.toContain('Private ZIP title');
    expect(text).not.toContain('corrupt image bytes');
    expect(JSON.parse(text)).not.toHaveProperty('message');
    expect(JSON.parse(text)).not.toHaveProperty('error');
  });
  it('enriches the persistence fallback diagnostic before exposing it on a tab-only ZIP',async()=>{
    blobState.blob=null;
    const artifact=await createTripArtifact(session(),'zip',undefined,{includePrivate:false});
    expect(artifact.kept).toBe(false);
    expect(artifact.storageDiagnostic).toBeDefined();
    expect(artifact.storageDiagnostic?.errorClass).toBe('storage');
    expect(artifact.storageDiagnostic?.step).toBe('persist');
    const text=diagnosticText(artifact.storageDiagnostic!);
    expect(text).toContain('"step": "persist"');
    expect(text).not.toContain('Private ZIP title');
    expect(JSON.parse(text)).not.toHaveProperty('error');
    URL.revokeObjectURL(artifact.url);
  });
});

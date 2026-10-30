import {expect,it} from 'vitest';
import {createDiagnostic,diagnosticText} from './diagnostics';
import {OperationTracker} from './jobs';
const base={requestId:'request',operation:'export',boardId:'board',revision:1,appVersion:'test'};
it('keeps an allowlisted export step and specific decode/empty classes without the error text',()=>{
 for(const code of ['decode','empty'] as const){
  const receipt=createDiagnostic(Object.assign({},base,{step:'write' as const,error:Object.assign(Error('PRIVATE ERROR CANARY'),{code})}));
  expect(receipt).toMatchObject({step:'write',errorClass:code});expect(diagnosticText(receipt)).not.toContain('PRIVATE ERROR CANARY');
 }
});
it('reprojects steps and error classes so appended private context cannot enter copied receipts',()=>{
 const receipt=createDiagnostic(base),text=diagnosticText(Object.assign({},receipt,{step:'PRIVATE STEP CANARY',cardText:'PRIVATE CARD CANARY'}));
 expect(text).not.toContain('PRIVATE');expect(JSON.parse(text)).not.toHaveProperty('step');
});
it('captures the export step for failure and cancellation without changing prior operation fields',async()=>{
 for(const cancelled of [false,true]){
  const tracker=new OperationTracker(Object.assign({},base,{id:base.requestId,operation:'export' as const,step:()=> 'write' as const}));
  if(cancelled)tracker.cancel();else await expect(tracker.run('exporting','exported',async()=>{throw Object.assign(Error('PRIVATE DECODE CANARY'),{code:'decode'});})).rejects.toThrow();
  expect(tracker.state.diagnostic).toMatchObject({step:'write',errorClass:cancelled?'cancelled':'decode',boardId:'board',revision:1});expect(diagnosticText(tracker.state.diagnostic!)).not.toContain('PRIVATE');
 }
});

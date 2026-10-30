import {describe,expect,it} from 'vitest';
import {createDiagnostic,diagnosticText,type DiagnosticReceipt} from './diagnostics';
const base={requestId:'req-1',operation:'export',boardId:'board-1',revision:3,appVersion:'test'};
describe('allowlisted diagnostic steps',()=>{
  it('keeps only an allowlisted step and drops malicious extras and raw errors',()=>{
    const receipt=createDiagnostic({...base,step:'persist',error:new Error('private board title and token'),...({privateContext:'secret-value',step2:'verify'} as Record<string,unknown>)} as never);
    expect(receipt.step).toBe('persist');
    expect(receipt.errorClass).toBe('failed');
    const text=diagnosticText(receipt);
    expect(text).toContain('"step": "persist"');
    expect(text).not.toContain('private board title');
    expect(text).not.toContain('secret-value');
    expect(text).not.toContain('privateContext');
    expect(Object.keys(JSON.parse(text)).sort()).toEqual(['appVersion','boardId','errorClass','finishedAt','operation','requestId','revision','startedAt','step'].sort());
  });
  it('drops a malicious step again at serialization',()=>{
    const clean=createDiagnostic({...base,step:'verify'});
    const malicious={...clean,step:'verify; private-title',boardSecret:'do-not-print',error:new Error('raw failure')} as unknown as DiagnosticReceipt;
    const text=diagnosticText(malicious);
    expect(JSON.parse(text).step).toBeUndefined();
    expect(text).not.toContain('private-title');
    expect(text).not.toContain('do-not-print');
    expect(text).not.toContain('raw failure');
  });
  it('rejects prototype-property steps at creation and serialization',()=>{
    for(const step of ['constructor','toString','hasOwnProperty','__proto__']){
      expect(createDiagnostic({...base,step} as never).step).toBeUndefined();
      const clean=createDiagnostic({...base,step:'verify'});
      const malicious={...clean,step} as unknown as DiagnosticReceipt;
      expect(JSON.parse(diagnosticText(malicious)).step).toBeUndefined();
    }
  });
  it('accepts each ZIP diagnostic step without inventing one for other receipts',()=>{
    for(const step of ['collect','layout','write','verify','persist'] as const) expect(createDiagnostic({...base,step}).step).toBe(step);
    expect(createDiagnostic(base).step).toBeUndefined();
  });
});

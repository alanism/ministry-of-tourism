import {describe,expect,it} from 'vitest';
import {zipFeedback,zipStepFromProgress} from './zip-feedback';
import type {ArtifactProgress} from './artifacts';
const progress=(stage:ArtifactProgress['stage'],done:boolean):ArtifactProgress=>({stage,completed:done?1:0,total:1,unit:'assets',done});
describe('ZIP feedback helper',()=>{
  it('identifies the actual incomplete step instead of defaulting to the first step',()=>{
    expect(zipStepFromProgress({collect:progress('collect',true),layout:progress('layout',false),write:progress('write',false)})).toBe('write');
    expect(zipFeedback({errorClass:'unavailable',progress:{collect:progress('collect',true),layout:progress('layout',false)}}).step).toBe('layout');
  });
  it('uses safe class-specific copy and unchanged-board assurance without raw errors',()=>{
    const missing=zipFeedback({errorClass:'unavailable',step:'layout',...({message:'C:/private/photo.jpg token=secret'} as Record<string,unknown>)} as never);
    expect(missing.message).toContain('unavailable');
    expect(missing.message).toContain('Your board is unchanged');
    expect(missing.message).not.toContain('secret');
    expect(missing.message).not.toContain('photo.jpg');
    const checksum=zipFeedback({errorClass:'invalid_input',step:'layout'});
    expect(checksum.message).toContain('checksum');
    expect(checksum.message).toContain('Your board is unchanged');
    const generic=zipFeedback({errorClass:'failed',step:'write',...({message:'raw stack'} as Record<string,unknown>)} as never);
    expect(generic.message).toContain('No ZIP was marked ready');
    expect(generic.message).not.toContain('raw stack');
  });
  it('sanitizes malicious steps and describes cancellation at the actual step',()=>{
    const cancelled=zipFeedback({aborted:true,step:'verify; private-title',progress:{verify:progress('verify',false)},...({message:'cancelled by person with private title'} as Record<string,unknown>)} as never);
    expect(cancelled.status).toBe('cancelled');
    expect(cancelled.step).toBe('verify');
    expect(cancelled.message).toContain('Your board is unchanged');
    expect(cancelled.message).not.toContain('private');
    expect(zipFeedback({step:'persist',errorClass:'storage'}).step).toBe('persist');
  });
  it('rejects prototype-property steps instead of treating them as allowlisted',()=>{
    for(const step of ['constructor','toString','hasOwnProperty','__proto__']){
      expect(zipFeedback({step,progress:{write:progress('write',false)}}).step).toBe('write');
      expect(zipFeedback({step}).step).toBe('collect');
      expect(zipFeedback({step,errorClass:'failed'}).message).not.toContain(step);
    }
  });
});

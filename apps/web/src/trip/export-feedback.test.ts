import {expect,it} from 'vitest';
import type {DiagnosticErrorClass} from '@writers-board/core';
import {exportFailureText} from './export-feedback';
it('uses written explanations and reassures without accepting exception messages or arbitrary step text',()=>{
 for(const code of ['decode','empty','network','storage','failed'] as const){
  const text=exportFailureText('pdf','write',code);expect(text).toContain('Write the PDF');expect(text).toContain('Nothing was written. Your board is unchanged.');
 }
 expect(exportFailureText('pdf','write','decode')).toContain('picture could not be rendered');
 expect(exportFailureText('pdf','layout','empty')).toContain('Add a card or artwork');
 const text=exportFailureText('pdf','PRIVATE STEP CANARY' as 'write','PRIVATE ERROR CANARY' as DiagnosticErrorClass);expect(text).not.toContain('PRIVATE');expect(text).toContain('Gather the art');
});
it('names the same PDF and package steps when cancellation settles',()=>{
 expect(exportFailureText('pdf','collect','cancelled')).toContain('Cancelled at “Gather the art”');
 expect(exportFailureText('zip','write','cancelled')).toContain('Cancelled at “Write the ZIP”');
 expect(exportFailureText('pdf','write','cancelled')).toContain('Your board is unchanged.');
});

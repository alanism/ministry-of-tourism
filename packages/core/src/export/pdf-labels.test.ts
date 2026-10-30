import { describe, expect, it } from 'vitest';
import { buildPdf, type PdfImagePage } from './pdf.ts';

const jpeg=new Uint8Array([255,216,255,217]);
const page=(label?:string)=>({kind:'image',jpeg,width:1184,height:1680,pageSize:[419.53,595.28],fullBleed:true,label} as PdfImagePage);
const text=(pages:Parameters<typeof buildPdf>[0])=>new TextDecoder('latin1').decode(buildPdf(pages));
describe('magazine PDF page labels',()=>{
  it('retains distinct front and calm-back pattern metadata with physical page numbers',()=>{
    const output=text([page('personal-cover'),page('city-feature'),page('back-cover')]);
    expect(output).toContain('/PageLabels << /Nums [');
    expect(output).toContain('0 << /P (personal-cover ) /S /D /St 1 >>');
    expect(output).toContain('2 << /P (back-cover ) /S /D /St 3 >>');
    expect(output).toContain('/MediaBox [0 0 419.53 595.28]');
  });
  it('keeps legacy unlabeled PDFs unchanged and resets numbering for an unlabeled page in a labeled file',()=>{
    expect(text([page(),{kind:'text',lines:['Legacy']}])).not.toContain('/PageLabels');
    const output=text([page('front'),{kind:'text',lines:['Manuscript']},page('back (calm)')]);
    expect(output).toContain('1 << /S /D /St 2 >>');
    expect(output).toContain('/P (back \\(calm\\) )');
  });
});

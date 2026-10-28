import { describe, expect, it } from 'vitest';
import { buildPdf, type PdfImagePage } from './pdf.ts';

const page=(patch:Record<string,unknown>={}):PdfImagePage=>({kind:'image',jpeg:new Uint8Array([255,216,255,217]),width:100,height:200,pageSize:[200,400],fullBleed:true,textLayer:[{text:'San Sebastián · 京都 🧳',x:10,y:30,width:80,height:12}],...patch} as PdfImagePage);
const syntax=(bytes:Uint8Array)=>new TextDecoder('latin1').decode(bytes);

describe('searchable magazine PDF text',()=>{
  it('writes invisible, positioned Unicode text with a self-contained blank font and explicit reading structure',()=>{
    const output=syntax(buildPdf([page()]));
    expect(output).toContain('/ToUnicode');
    expect(output).toContain('/Subtype /Type3');
    expect(output).toContain('3 Tr');
    expect(output).toContain('4eac');
    expect(output).toContain('d83eddf3');
    expect(output).toContain('/StructTreeRoot');
    expect(output).toContain('/StructParents 0');
    expect(output).toContain('/MCID 0');
    expect(output).toContain('20.000 340.000 Tm');
  });
  it('has deterministic bytes and valid offsets even when Unicode needs multiple font banks',()=>{
    const text=Array.from({length:310},(_,i)=>String.fromCodePoint(0x400+i)).join('');
    const pages=[page({textLayer:[{text,x:5,y:20,width:90,height:10,rotation:9}]})];
    const bytes=buildPdf(pages),output=syntax(bytes);
    expect(bytes).toEqual(buildPdf(pages));
    expect((output.match(/\/Subtype \/Type3/g)||[]).length).toBe(2);
    const xref=Number(/startxref\n(\d+)/.exec(output)![1]);
    expect(output.slice(xref,xref+4)).toBe('xref');
    [...output.slice(xref).matchAll(/^(\d{10}) 00000 n $/gm)].forEach((m,i)=>expect(output.slice(Number(m[1]))).toMatch(new RegExp('^'+(i+1)+' 0 obj')));
  });
  it('refuses invalid or unbounded text geometry instead of exporting a broken selection layer',()=>{
    for(const patch of [{x:NaN},{y:Infinity},{width:-1},{height:0},{rotation:NaN},{text:'bad\u0000text'},{text:'x'.repeat(10001)}]){
      expect(()=>buildPdf([page({textLayer:[{text:'visible',x:1,y:20,width:30,height:10,...patch}]})])).toThrow(/text/i);
    }
  });
  it('keeps image-only callers unchanged and never sources invisible text from captions or unrendered metadata',()=>{
    const output=syntax(buildPdf([page({textLayer:undefined})]));
    expect(output).not.toContain('/ToUnicode');
    expect(output).not.toContain('/StructTreeRoot');
    expect(output).toContain("/Producer (Writer's Board)");
  });
  it('allows the MoT caller to set its producer and preserves the Unicode trip title in metadata',()=>{
    const output=syntax(buildPdf([page()], 'San Sebastián — 私の旅', {producer:'Ministry of Tourism'}));
    expect(output).toContain('/Producer (Ministry of Tourism)');
    expect(output).toContain('/Title <feff00530061006e0020005300650062006100730074006900e1006e00202014002079c1306e65c5>');
  });
});

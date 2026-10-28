import { describe, expect, it } from 'vitest';
import { buildPdf, type PdfPage } from './pdf.ts';

const jpeg=new Uint8Array([0xff,0xd8,0xff,0xd9]);
const decode=(bytes:Uint8Array)=>new TextDecoder('latin1').decode(bytes);
const page=(links:unknown):PdfPage=>({kind:'image',jpeg,width:600,height:800,pageSize:[600,800],fullBleed:true,links} as PdfPage);
const link={url:'https://foreignclubberscorespondence.web.app/shop?item=city-map',x:.1,y:.2,width:.3,height:.1};

describe('clickable PDF image-page links',()=>{
  it('writes an actual URI annotation with top-left normalized coordinates converted to PDF coordinates',()=>{
    const pdf=decode(buildPdf([page([link]),{kind:'text',lines:['Other page']} ]));
    expect(pdf).toContain('/Subtype /Link');expect(pdf).toContain('/Rect [60.00 560.00 240.00 640.00]');
    expect(pdf).toContain('/S /URI /URI (https://foreignclubberscorespondence.web.app/shop?item=city-map)');
    expect(pdf.match(/\/Annots \[/g)).toHaveLength(1);
    const xref=Number(/startxref\n(\d+)/.exec(pdf)![1]);
    [...pdf.slice(xref).matchAll(/^(\d{10}) 00000 n $/gm)].forEach((match,index)=>expect(pdf.slice(Number(match[1]))).toMatch(new RegExp(`^${index+1} 0 obj`)));
  });
  it('rejects executable, credentialed, non-HTTPS and private-host links',()=>{
    for(const url of ['javascript:alert(1)','data:text/html,x','http://example.com','https://name:secret@example.com','https://localhost/shop','https://127.0.0.1/shop','https://192.168.1.2/shop','https://[::1]/shop'])expect(()=>buildPdf([page([{...link,url}])])).toThrow(/HTTPS|public|link/i);
  });
  it('rejects nonfinite, negative, empty, overflowing or excessive rectangles',()=>{
    for(const change of [{x:NaN},{y:Infinity},{width:0},{height:-1},{x:.9,width:.2},{y:.9,height:.2}])expect(()=>buildPdf([page([{...link,...change}])])).toThrow(/link|bounds|rectangle/i);
    expect(()=>buildPdf([page(Array.from({length:21},()=>link))])).toThrow(/20|link/i);
  });
  it('leaves legacy image and manuscript pages free of annotations',()=>{
    const pdf=decode(buildPdf([{kind:'image',jpeg,width:1,height:1},{kind:'text',lines:['Legacy manuscript']} ]));
    expect(pdf).not.toContain('/Annots');expect(pdf).not.toContain('/Subtype /Link');expect(pdf).toContain('/Count 2');
  });
});

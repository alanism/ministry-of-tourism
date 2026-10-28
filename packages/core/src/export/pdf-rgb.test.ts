import { describe, expect, it } from 'vitest';
import { unzlibSync } from 'fflate';
import * as pdf from './pdf.ts';

const image=pdf.rgbPdfImage;
const rgba=new Uint8ClampedArray([0,7,249,255,250,128,3,255,12,33,44,255,255,255,255,255]);
describe('lossless PDF page encoding',()=>{
  it('preserves every opaque canvas RGB channel through the compressed PDF image stream',()=>{
    const page=image(rgba,2,2),original=rgba.slice();
    expect(unzlibSync(page.deflatedRgb)).toEqual(new Uint8Array([0,7,249,250,128,3,12,33,44,255,255,255]));
    expect(rgba).toEqual(original);
    const bytes=pdf.buildPdf([{...page,pageSize:[148,210],fullBleed:true,links:[{url:'https://foreignclubberscorespondence.web.app/shop/?city=lisbon',x:.1,y:.2,width:.3,height:.1}]}]);
    const text=new TextDecoder('latin1').decode(bytes);
    expect(text).toContain('/Filter /FlateDecode');expect(text).not.toContain('/DCTDecode');
    expect(text).toContain('/Width 2 /Height 2 /ColorSpace /DeviceRGB /BitsPerComponent 8');
    expect(text).toContain('/Rect [14.80 147.00 59.20 168.00]');
    const offset=text.indexOf('stream\n',text.indexOf('/Filter /FlateDecode'))+7;
    expect(unzlibSync(bytes.slice(offset,offset+page.deflatedRgb.length))).toEqual(unzlibSync(page.deflatedRgb));
  });
  it('refuses incomplete, invalid-size or transparent pixels instead of silently changing the image',()=>{
    const dimensions:[number,number][]=[[0,2],[-1,2],[2.1,2],[Infinity,2],[2,3]];
    for(const [width,height] of dimensions)expect(()=>image(rgba,width,height)).toThrow(/dimensions|pixels|RGBA/i);
    const transparent=rgba.slice();transparent[3]=254;expect(()=>image(transparent,2,2)).toThrow(/opaque|alpha|background/i);
  });
});

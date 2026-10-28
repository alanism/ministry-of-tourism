import {describe,expect,it} from 'vitest';
import {postcardPreviewSvg} from './magazine-view';

const source='<svg><g data-postcard-face="front" transform="rotate(-4 570 500)"><image href="data:image/png;base64,AA=="/></g><g data-postcard-face="back" transform="rotate(2.5 590 1220)"><text>Our own words &amp; source credit</text></g><g transform="rotate(9)"><text>Other page content</text></g></svg>';
describe('postcard reader interaction',()=>{
  it('keeps the canonical PDF composition unchanged until the reader turns the card',()=>{expect(postcardPreviewSvg(source,false)).toBe(source);});
  it('raises the back and lowers the front while preserving the artwork, words and unrelated groups',()=>{
    const turned=postcardPreviewSvg(source,true);
    expect(turned).toContain('translate(47.36 592)');expect(turned).toContain('translate(-35.52 -568.32)');
    expect(turned).toContain('href="data:image/png;base64,AA=="');expect(turned).toContain('Our own words &amp; source credit');expect(turned).toContain('<g transform="rotate(9)">');
    expect((turned.match(/data-postcard-face=/g)??[]).length).toBe(2);expect(source).not.toContain('translate');
  });
  it('does not accumulate movement on repeated renders or alter an ordinary page',()=>{
    const turned=postcardPreviewSvg(source,true);expect(postcardPreviewSvg(turned,true)).toBe(turned);expect(postcardPreviewSvg('<svg><text>A trip note</text></svg>',true)).toBe('<svg><text>A trip note</text></svg>');
  });
});

import {describe,expect,it} from 'vitest';
import {readableMagazineSvg,wrapReadingText} from './magazine-reading';
describe('phone magazine text',()=>{
  const measure=(s:string)=>Array.from(s).length;
  it('keeps a whole headline and wraps contents at words instead of dropping the tail',()=>{
    const value='Bangkok: choose a district, then a reason to linger';
    const lines=wrapReadingText(value,17,measure);
    expect(lines.join(' ')).toBe(value);expect(lines.at(-1)).toBe('reason to linger');expect(lines.every(line=>line.length<=17)).toBe(true);
  });
  it('preserves paragraph breaks and unspaced source URLs without losing characters',()=>{
    const lines=wrapReadingText('A note\n\nhttps://fcc.example/source',9,measure);
    expect(lines[1]).toBe('');expect(lines.slice(2).join('')).toBe('https://fcc.example/source');
  });
  it('leaves the canonical desktop and A5 SVG byte-for-byte unchanged',async()=>{
    const svg='<svg><text>Original page and source credit</text></svg>';
    expect(await readableMagazineSvg(svg,440,new AbortController().signal)).toBe(svg);
  });
});

import type {MagazineDocument} from '@writers-board/core';
import {PLEX_CSS} from '../../../../packages/core/src/trip/fonts/plex';
import plexLicense from '../../../../packages/core/src/trip/fonts/OFL.txt?raw';
import {readableMagazineSvg} from './magazine-reading';
import {HTML_LIMITS} from './standalone-media';
import fontCoverage from './standalone-fonts.json';

const NS='http://www.w3.org/2000/svg';
const elements=new Set(['svg','defs','style','filter','feTurbulence','feColorMatrix','g','rect','text','tspan','image','clipPath','ellipse','path','circle','linearGradient','stop','mask','pattern','a']);
const attributes=new Set(('xmlns width height viewBox role aria-label id type baseFrequency numOctaves stitchTiles values d x y x1 y1 x2 y2 dx dy cx cy r rx ry fill fill-opacity opacity stroke stroke-width stroke-linejoin stroke-linecap stroke-dasharray paint-order filter clip-path transform preserveAspectRatio overflow font-family font-size font-weight font-style text-anchor letter-spacing pointer-events patternUnits patternContentUnits gradientUnits offset stop-color stop-opacity maskUnits maskContentUnits').split(' '));
const escape=(value:string)=>value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const byteLength=(value:string)=>new TextEncoder().encode(value).length;
function checkGlyphs(value:string,family:string,weight:string){
  const face=(fontCoverage.fonts as Record<string,{ranges:number[][]}>)[`${family}|${weight}`];
  if(!face)throw new Error(`HTML export has no embedded font for ${family} ${weight}.`);
  for(const character of value){const point=character.codePointAt(0)!;if([9,10,13].includes(point))continue;if(!face.ranges.some(([start,end])=>point>=start!&&point<=end!))throw new Error(`The embedded ${family} font does not contain U+${point.toString(16).toUpperCase()}. Keep this text in an editable ZIP; HTML cannot silently substitute a font.`);}
}
function publicLink(value:string):string{
  const url=new URL(value);if(!['https:','http:'].includes(url.protocol)||url.username||url.password)throw new Error('A magazine link is unsafe. Correct its source and retry.');return url.href;
}
function checkPng(value:string){
  if(!/^data:image\/png;base64,[a-z\d+/]+={0,2}$/i.test(value))throw new Error('The magazine contains an unsupported embedded image.');
  const binary=atob(value.slice(value.indexOf(',')+1)),b=Uint8Array.from(binary,c=>c.charCodeAt(0)),v=new DataView(b.buffer);
  if(b.length<33||![137,80,78,71,13,10,26,10].every((n,i)=>b[i]===n))throw new Error('The embedded PNG is invalid.');
  let at=8,end=false;
  while(at+12<=b.length){const length=v.getUint32(at),kind=String.fromCharCode(...b.subarray(at+4,at+8));if(!['IHDR','IDAT','IEND'].includes(kind)||at+length+12>b.length)throw new Error('An embedded PNG contains unsupported metadata or invalid chunks.');at+=length+12;if(kind==='IEND'){end=true;break;}}
  if(!end||at!==b.length)throw new Error('An embedded PNG has unexpected trailing bytes.');
}
/** Reject unknown active/resource surfaces, then discard editor-only metadata. */
export function checkedMagazineSvg(source:string,prefix:string):string{
  if(source.includes('<!')||source.includes('<?'))throw new Error('The magazine contains an unsupported XML declaration.');
  const parsed=new DOMParser().parseFromString(source,'image/svg+xml'),root=parsed.documentElement;
  if(parsed.querySelector('parsererror')||root.localName!=='svg')throw new Error('The magazine SVG is invalid.');
  const ids=new Set([...root.querySelectorAll('[id]')].map(node=>node.id));
  for(const text of root.querySelectorAll('text'))checkGlyphs(text.textContent??'',text.getAttribute('font-family')??'IBM Plex Sans',text.getAttribute('font-weight')??'400');
  for(const node of [root,...root.querySelectorAll('*')]){
    if(node.namespaceURI!==NS||!elements.has(node.localName))throw new Error(`Unsupported magazine element: ${node.localName}.`);
    if(node.localName==='style'){if(node.attributes.length||node.textContent!==PLEX_CSS)throw new Error('Unexpected magazine font or stylesheet attributes.');node.remove();continue;}
    for(const attribute of [...node.attributes]){
      const name=attribute.name,value=attribute.value;
      if(name.startsWith('data-')){node.removeAttribute(name);continue;}
      if(name==='href'){
        if(node.localName==='image')checkPng(value);
        else if(node.localName==='a'){node.setAttribute('href',publicLink(value));node.setAttribute('target','_blank');node.setAttribute('rel','noopener noreferrer');node.setAttribute('referrerpolicy','no-referrer');}
        else throw new Error('Unexpected magazine resource.');continue;
      }
      if(name==='style'){
        if(!/^mix-blend-mode:\s*multiply\s*;?$/.test(value))throw new Error('Unexpected inline magazine style.');continue;
      }
      if(!attributes.has(name))throw new Error(`Unsupported magazine attribute: ${name}.`);
      if(name==='xmlns'&&value!==NS)throw new Error('Unsupported magazine namespace.');
      // Presentation attributes accept CSS escapes/comments; reject them before the fitter mounts XML.
      if(name!=='aria-label'&&(/[\\]/.test(value)||value.includes('/*')||value.includes('*/')))throw new Error('Escaped or commented magazine attributes are unsupported.');
      if(['fill','stroke'].includes(name)&&! /^(?:none|transparent|#[a-f\d]{3,8}|url\(#[\w-]+\))$/i.test(value))throw new Error('Unsupported magazine paint value.');
      if(['filter','clip-path'].includes(name)&&! /^(?:none|url\(#[\w-]+\))$/.test(value))throw new Error('Unsupported magazine resource value.');
      if(/url\s*\(/i.test(value)){
        const match=/^url\(#([\w-]+)\)$/.exec(value);if(!match||!ids.has(match[1]!))throw new Error('The magazine references an external or missing resource.');node.setAttribute(name,`url(#${prefix}-${match[1]})`);
      }
      if(name==='id'){if(!/^[\w-]+$/.test(value))throw new Error('Invalid magazine resource ID.');node.setAttribute(name,`${prefix}-${value}`);}
    }
  }
  return new XMLSerializer().serializeToString(root);
}

/** Script-free, selectable canonical pages plus the accepted precomputed narrow reading layout. */
export async function standaloneMagazineHtml(magazine:MagazineDocument,signal?:AbortSignal,onPage?:(completed:number,total:number)=>void):Promise<Uint8Array>{
  const cssHash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(PLEX_CSS)))].map(byte=>byte.toString(16).padStart(2,'0')).join('');
  if(cssHash!==fontCoverage.cssSha256)throw new Error('Embedded fonts changed. Refresh the glyph and license audit before HTML export.');
  checkGlyphs(magazine.title,'IBM Plex Serif','600');
  for(const page of magazine.pages){checkGlyphs(page.title??`Page ${page.folio}`,'IBM Plex Sans','400');for(const credit of page.credits)checkGlyphs(credit,'IBM Plex Sans','400');}
  if(!magazine.pages.length)throw new Error('Add a card or artwork before exporting a magazine.');
  if(magazine.pages.length>HTML_LIMITS.pages)throw new Error('The magazine exceeds the experimental HTML page limit.');
  // Source growth is bounded before XML parsing and narrow-layout work, as well as after serialization.
  let size=byteLength(PLEX_CSS)+byteLength(plexLicense)+4096;
  for(const page of magazine.pages){size+=byteLength(page.svg)*2;if(size>HTML_LIMITS.outputBytes)throw new Error('The magazine exceeds the experimental 128 MiB HTML limit. Keep the full trip in an editable ZIP.');}
  const parts=[`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; font-src data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>${escape(magazine.title)}</title><style>${PLEX_CSS}
body{margin:0;background:#FAF7F2;color:#000000;font:16px 'IBM Plex Sans',sans-serif}main,header,footer{max-width:1184px;margin:24px auto;padding:0 16px}h1{font:600 30px 'IBM Plex Serif',serif}nav{display:flex;gap:12px;flex-wrap:wrap}a{color:inherit}figure{margin:24px 0;background:white}svg{display:block;width:100%;height:auto}figcaption{padding:12px}.narrow{display:none}pre{white-space:pre-wrap;overflow-wrap:anywhere}footer{font-size:12px}@media(max-width:600px){.wide{display:none}.narrow{display:block}}@media print{header,footer{display:none}.wide{display:block}.narrow{display:none}figure{break-after:page;margin:0}}</style></head><body><header><h1>${escape(magazine.title)}</h1><p>${magazine.pages.length} pages · revision ${magazine.revision}</p><p>Saved trip material, with metadata-free PNG image representations. Your editable ZIP keeps the originals. Live catalogue previews are not added to this file.</p><nav aria-label="Magazine pages">${magazine.pages.map((page,i)=>`<a href="#page-${i+1}">${escape(page.title??`Page ${page.folio}`)}</a>`).join('')}</nav></header><main>`];
  size=byteLength(parts[0]!);
  const controller=signal??new AbortController().signal;
  for(const [index,page] of magazine.pages.entries()){
    signal?.throwIfAborted();
    // Validate before mounting the existing fitter; never mount untrusted XML.
    checkedMagazineSvg(page.svg,`check-${index}`);
    const narrow=await readableMagazineSvg(page.svg,248,controller);signal?.throwIfAborted();
    const wideSvg=checkedMagazineSvg(page.svg,`wide-${index}`),narrowSvg=checkedMagazineSvg(narrow,`narrow-${index}`);
    const part=`<figure id="page-${index+1}" aria-label="${escape(page.title??`Page ${page.folio}`)}"><div class="wide">${wideSvg}</div><div class="narrow">${narrowSvg}</div><figcaption>Page ${page.folio}${page.credits.length?` · ${page.credits.map(escape).join(' · ')}`:''}</figcaption></figure>`;
    size+=byteLength(part);if(size>HTML_LIMITS.outputBytes)throw new Error('The magazine exceeds the experimental 128 MiB HTML limit. Keep the complete trip in an editable ZIP.');
    parts.push(part);onPage?.(index+1,magazine.pages.length);
  }
  parts.push(`</main><footer><details><summary>Embedded font license · IBM Plex</summary><pre>${escape(plexLicense)}</pre></details></footer></body></html>`);
  const result=new TextEncoder().encode(parts.join(''));if(result.length>HTML_LIMITS.outputBytes)throw new Error('The HTML exceeds its output limit. Nothing was exported.');return result;
}

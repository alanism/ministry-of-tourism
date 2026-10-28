import { PLEX_CSS } from './fonts/plex.ts';

export const MAGAZINE = { widthPx:1184,heightPx:1680,widthMm:148,heightMm:210,pageSize:[419.53,595.28] as [number,number] } as const;
export const PAPER='#FAF7F2', INK='#000000', RED='#CC0000', BLUSH='#F9EDEB', BLUE='#BBD0DC', TAUPE='#CBB9B0';
export const PU=11.84, M=7*PU, L=4*PU, G=2.4*PU, COL=(1184-2*M-5*G)/6;
export const column=(n:number)=>M+(n-1)*(COL+G);
export const escapeXml=(s:string)=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');

/** Presentation-only aliases. Original labels and source evidence are never rewritten. */
export function magazineLabel(value:string):string {
  const repaired=value.replace(/Â·/g,'·').replace(/â€™/g,'’').replace(/â€“/g,'–').replace(/â€”/g,'—').replace(/\s*[·|—–-]\s*Version\s*\d+\s*$/i,'').replace(/_/g,' ').trim();
  const aliases:Record<string,string>={
    'Hotel Maria Cristina A Luxury Collection Hotel Hotel Exterio':'Hotel María Cristina',
    'Flight luggage tag V2':'Luggage tag','Fu Fu No Yu Onsen':'Fu Fu no Yu onsen','La Cuchara De San Telmo':'La Cuchara de San Telmo',
  };
  return aliases[repaired]??repaired;
}
export function wrap(text:string,columns:number):string[]{
  const lines:string[]=[];
  for(const paragraph of text.replace(/\r/g,'').split('\n')){
    if(!paragraph.trim()){lines.push('');continue;}
    let line='';
    for(let word of paragraph.trim().split(/\s+/)){
      while(Array.from(word).length>columns){if(line){lines.push(line);line='';}lines.push(Array.from(word).slice(0,columns).join(''));word=Array.from(word).slice(columns).join('');}
      if(line&&Array.from(`${line} ${word}`).length>columns){lines.push(line);line=word;}else line=line?`${line} ${word}`:word;
    }
    if(line)lines.push(line);
  }
  return lines;
}
/** Consume only the words that fit. The unprinted tail stays available to the next editorial region. */
export function flowText(value:string,columns:number,capacity:number):{lines:string[];rest:string}{
  if(capacity<=0)return {lines:[],rest:value};
  const lines:string[]=[];let line='',consumed=0;
  for(const token of value.matchAll(/[^\S\n]*\n|\S+/gu)){
    const word=token[0],start=token.index;
    if(word.endsWith('\n')){lines.push(line);line='';consumed=start+word.length;if(lines.length>=capacity)return {lines,rest:value.slice(consumed).trimStart()};continue;}
    if(line&&Array.from(line+' '+word).length>columns){lines.push(line);line='';if(lines.length>=capacity)return {lines,rest:value.slice(start).trimStart()};}
    let remaining=word,offset=0;
    while(Array.from(remaining).length>columns){const chunk=Array.from(remaining).slice(0,columns).join('');lines.push(chunk);offset+=chunk.length;remaining=remaining.slice(chunk.length);if(lines.length>=capacity)return {lines,rest:value.slice(start+offset).trimStart()};}
    line=line?line+' '+remaining:remaining;consumed=start+word.length;
  }
  if(line)lines.push(line);return {lines,rest:value.slice(consumed).trimStart()};
}
export function rows(lines:readonly string[],x:number,y:number,size=2.5*PU,leading=L,family='IBM Plex Sans',weight:400|600=400,color=INK,italic=false):string{
  return `<text x="${x}" y="${y}" font-family="${family}" font-size="${size}" font-weight="${weight}" fill="${color}"${italic?' font-style="italic"':''}>${lines.map((line,i)=>`<tspan x="${x}" dy="${i?leading:0}">${escapeXml(line)}</tspan>`).join('')}</text>`;
}
export const kicker=(text:string,x=M,y=2*L,color=INK)=>`<text x="${x}" y="${y}" font-family="IBM Plex Mono" font-size="${2.1*PU}" font-weight="600" letter-spacing="${.08*2.1*PU}" fill="${color}">${escapeXml(text.toUpperCase())}</text>`;
export function shell(content:string,title:string,folio:number|undefined,side:'left'|'right'|'single'='single',paper=PAPER):string{
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1184" height="1680" viewBox="0 0 1184 1680" role="img" aria-label="${escapeXml(title)}"><defs><style>${PLEX_CSS}</style><filter id="paper-grain"><feTurbulence type="fractalNoise" baseFrequency=".7" numOctaves="3" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/></filter></defs><rect width="1184" height="1680" fill="${paper}"/>${content}<rect width="1184" height="1680" filter="url(#paper-grain)" opacity=".035" style="mix-blend-mode:multiply" pointer-events="none"/>${folio===undefined?'':rows([String(folio)],side==='right'?1080:M,1680-3.2*PU,1.9*PU,L,'IBM Plex Mono')}</svg>`;
}

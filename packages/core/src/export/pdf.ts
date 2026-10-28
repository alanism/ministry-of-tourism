// A small PDF writer: the board as a picture on a landscape page, and the
// draft in standard manuscript form (Courier 12, one-inch margins, double
// spaced). JPEGs pass through; magazine canvas pixels use lossless RGB/Flate.
import { zlibSync } from 'fflate';

export interface PdfLink {url:string;x:number;y:number;width:number;height:number;}
export type PdfImagePage = {kind:'image';width:number;height:number;caption?:string;pageSize?:[number,number];fullBleed?:boolean;links?:PdfLink[]}
  & ({jpeg:Uint8Array;deflatedRgb?:never}|{jpeg?:never;deflatedRgb:Uint8Array});
export type PdfPage = PdfImagePage | { kind: 'text'; lines: string[]; header?: string; pageNumber?: number };

/** Compress each opaque canvas page immediately; retain neither alpha nor a lossy intermediate. */
export function rgbPdfImage(rgba:Uint8Array|Uint8ClampedArray,width:number,height:number):PdfImagePage&{deflatedRgb:Uint8Array}{
  const count=width*height;
  if(!Number.isSafeInteger(width)||width<=0||!Number.isSafeInteger(height)||height<=0||!Number.isSafeInteger(count*4)||rgba.length!==count*4)throw new Error('PDF RGBA pixels do not match their dimensions.');
  const rgb=new Uint8Array(count*3);
  for(let i=0,j=0;i<rgba.length;i+=4){
    if(rgba[i+3]!==255)throw new Error('PDF RGB pages need an opaque background.');
    rgb[j++]=rgba[i]!;rgb[j++]=rgba[i+1]!;rgb[j++]=rgba[i+2]!;
  }
  return {kind:'image',deflatedRgb:zlibSync(rgb),width,height};
}

const LETTER: [number, number] = [612, 792];
const MARGIN = 72;
const FONT_SIZE = 12;
const LEADING = 24; // double spaced
const CHAR_WIDTH = 0.6 * FONT_SIZE; // Courier is monospaced: 600 units per glyph
export const MANUSCRIPT_COLUMNS = Math.floor((LETTER[0] - 2 * MARGIN) / CHAR_WIDTH);
export const MANUSCRIPT_LINES = Math.floor((LETTER[1] - 2 * MARGIN) / LEADING);

/** Characters outside Latin-1 that WinAnsi has codes for (quotes, dashes, ellipsis…). */
const WIN_ANSI: Record<string, number> = {
  '€': 0x80, '‚': 0x82, 'ƒ': 0x83, '„': 0x84, '…': 0x85, '†': 0x86, '‡': 0x87, 'ˆ': 0x88, '‰': 0x89, 'Š': 0x8a, '‹': 0x8b, 'Œ': 0x8c,
  'Ž': 0x8e, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97, '˜': 0x98, '™': 0x99, 'š': 0x9a, '›': 0x9b,
  'œ': 0x9c, 'ž': 0x9e, 'Ÿ': 0x9f,
};

/** Encodes a line for a PDF string in WinAnsi, escaping what PDF strings need. */
function pdfString(text: string): string {
  let out = '';
  for (const ch of text) {
    const code = WIN_ANSI[ch] ?? ch.codePointAt(0)!;
    const byte = code < 32 ? 32 : code > 255 ? 63 : code; // '?' for what Courier can't show
    if (byte === 0x28 || byte === 0x29 || byte === 0x5c) out += `\\${String.fromCharCode(byte)}`;
    else if (byte < 128) out += String.fromCharCode(byte);
    else out += `\\${byte.toString(8).padStart(3, '0')}`;
  }
  return `(${out})`;
}

function publicLinkUrl(value:string):string{
  let url:URL;try{url=new URL(value);}catch{throw new Error('PDF link must use a public HTTPS URL');}
  const host=url.hostname.toLowerCase().replace(/\.$/,'');
  const ip=host.split('.').map(Number),ipv4=ip.length===4&&ip.every(part=>Number.isInteger(part)&&part>=0&&part<=255);
  const first=ip[0]??0,second=ip[1]??0;
  const privateIp=ipv4&&(first===0||first===10||first===127||first>=224||(first===169&&second===254)||(first===172&&second>=16&&second<=31)||(first===192&&second===168)||(first===100&&second>=64&&second<=127));
  if(typeof value!=='string'||value.length>2000||url.protocol!=='https:'||url.username||url.password||!host.includes('.')||/[\[\]:]/.test(host)||/(?:^|\.)(?:localhost|local|internal)$/.test(host)||privateIp)throw new Error('PDF link must use public HTTPS without credentials');
  return url.href;
}

function pageLinks(links:PdfLink[]|undefined,pw:number,ph:number):{url:string;rect:string}[]{
  if(links===undefined)return[];
  if(!Array.isArray(links)||links.length>20)throw new Error('A PDF image page supports at most 20 links');
  if(![pw,ph].every(value=>Number.isFinite(value)&&value>0))throw new Error('PDF link page bounds are invalid');
  return links.map(link=>{
    if(!link||![link.x,link.y,link.width,link.height].every(value=>typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=1)||link.width<=0||link.height<=0||link.x+link.width>1||link.y+link.height>1)throw new Error('PDF link rectangle must remain inside normalized page bounds');
    return {url:publicLinkUrl(link.url),rect:[link.x*pw,(1-link.y-link.height)*ph,(link.x+link.width)*pw,(1-link.y)*ph].map(value=>value.toFixed(2)).join(' ')};
  });
}

/** Wraps text into manuscript lines: paragraphs indented, words kept whole where they fit. */
export function wrapManuscript(text: string, columns = MANUSCRIPT_COLUMNS): string[] {
  const lines: string[] = [];
  for (const paragraph of text.replace(/\r/g, '').split('\n')) {
    if (!paragraph.trim()) {
      lines.push('');
      continue;
    }
    let line = '     '; // first-line indent, as in manuscript format
    for (const word of paragraph.trim().split(/\s+/)) {
      let rest = word;
      while (rest.length > columns) {
        if (line.trim()) lines.push(line.trimEnd());
        lines.push(rest.slice(0, columns));
        rest = rest.slice(columns);
        line = '';
      }
      const candidate = line.trim() ? `${line} ${rest}` : `${line}${rest}`;
      if ([...candidate].length > columns) {
        lines.push(line.trimEnd());
        line = rest;
      } else line = candidate;
    }
    if (line.trim()) lines.push(line.trimEnd());
  }
  return lines;
}

/** Splits manuscript lines into text pages, with a running header and page numbers. */
export function manuscriptPages(text: string, header: string): PdfPage[] {
  const lines = wrapManuscript(text);
  const pages: PdfPage[] = [];
  for (let i = 0; i < lines.length; i += MANUSCRIPT_LINES) {
    pages.push({ kind: 'text', lines: lines.slice(i, i + MANUSCRIPT_LINES), header, pageNumber: pages.length + 1 });
  }
  return pages;
}

export function buildPdf(pages: PdfPage[], title = 'Writer’s Board'): Uint8Array {
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [];
  let length = 0;
  const write = (data: string | Uint8Array) => {
    const bytes = typeof data === 'string' ? latin1(data) : data;
    chunks.push(bytes);
    length += bytes.length;
  };
  // Object numbers: 1 catalog, 2 pages, 3 font, 4 info, then per page: page, content, [image].
  const objects: (() => void)[] = [];
  const object = (n: number, body: () => void) => {
    objects[n] = () => {
      offsets[n] = length;
      write(`${n} 0 obj\n`);
      body();
      write('\nendobj\n');
    };
  };

  const pageIds: number[] = [];
  let next = 5;
  for (const page of pages) {
    const pageId = next++;
    const contentId = next++;
    const imageId = page.kind === 'image' ? next++ : 0;
    pageIds.push(pageId);
    const [pw, ph] = page.kind === 'image' ? page.pageSize ?? [LETTER[1], LETTER[0]] : LETTER;
    const links=page.kind==='image'?pageLinks(page.links,pw,ph):[];
    const linkIds=links.map(()=>next++);
    let content: string;
    if (page.kind === 'image') {
      // Fit the picture inside the margins, centered, with an optional caption under it.
      const margin = page.fullBleed ? 0 : 36;
      const room = { w: pw - 2 * margin, h: ph - 2 * margin - (page.caption ? 18 : 0) };
      const scale = Math.min(room.w / page.width, room.h / page.height);
      const w = page.width * scale;
      const h = page.height * scale;
      const x = (pw - w) / 2;
      const y = (ph - h) / 2 + (page.caption ? 9 : 0);
      content = `q ${w.toFixed(2)} 0 0 ${h.toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)} cm /Im0 Do Q`;
      if (page.caption) content += `\nBT /F1 10 Tf ${x.toFixed(2)} ${(y - 16).toFixed(2)} Td ${pdfString(page.caption)} Tj ET`;
    } else {
      const parts = ['BT', `/F1 ${FONT_SIZE} Tf`, `${LEADING} TL`, `${MARGIN} ${ph - MARGIN - FONT_SIZE} Td`];
      for (const line of page.lines) parts.push(`${pdfString(line)} Tj T*`);
      parts.push('ET');
      if (page.header) parts.push(`BT /F1 10 Tf ${MARGIN} ${ph - 40} Td ${pdfString(page.header)} Tj ET`);
      if (page.pageNumber) parts.push(`BT /F1 10 Tf ${pw - MARGIN - 30} ${ph - 40} Td ${pdfString(String(page.pageNumber))} Tj ET`);
      content = parts.join('\n');
    }
    object(pageId, () =>
      write(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pw} ${ph}] /Contents ${contentId} 0 R /Resources << /Font << /F1 3 0 R >>${
          imageId ? ` /XObject << /Im0 ${imageId} 0 R >>` : ''
        } >>${linkIds.length?` /Annots [${linkIds.map(id=>`${id} 0 R`).join(' ')}]`:''} >>`,
      ),
    );
    object(contentId, () => {
      write(`<< /Length ${latin1(content).length} >>\nstream\n`);
      write(content);
      write('\nendstream');
    });
    if (page.kind === 'image') {
      object(imageId, () => {
        const data=page.jpeg??page.deflatedRgb,filter=page.jpeg?'DCTDecode':'FlateDecode';
        write(
          `<< /Type /XObject /Subtype /Image /Width ${page.width} /Height ${page.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /${filter} /Length ${data.length} >>\nstream\n`,
        );
        write(data);
        write('\nendstream');
      });
      links.forEach((link,index)=>object(linkIds[index]!,()=>write(`<< /Type /Annot /Subtype /Link /Rect [${link.rect}] /Border [0 0 0] /A << /S /URI /URI ${pdfString(link.url)} >> >>`)));
    }
  }
  object(1, () => write('<< /Type /Catalog /Pages 2 0 R >>'));
  object(2, () => write(`<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`));
  object(3, () => write('<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>'));
  object(4, () => write(`<< /Title ${pdfString(title)} /Producer (Writer's Board) >>`));

  write('%PDF-1.4\n%âãÏÓ\n');
  for (let n = 1; n < next; n++) objects[n]!();
  const xref = length;
  write(`xref\n0 ${next}\n0000000000 65535 f \n`);
  for (let n = 1; n < next; n++) write(`${String(offsets[n]).padStart(10, '0')} 00000 n \n`);
  write(`trailer\n<< /Size ${next} /Root 1 0 R /Info 4 0 R >>\nstartxref\n${xref}\n%%EOF\n`);

  const out = new Uint8Array(length);
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.length;
  }
  return out;
}

/** PDF syntax is bytes; every string written here is already 8-bit. */
function latin1(text: string): Uint8Array {
  const bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i) & 0xff;
  return bytes;
}

/** Width and height from a JPEG's start-of-frame marker. */
export function jpegSize(jpeg: Uint8Array): { width: number; height: number } | null {
  let i = 2;
  while (i + 9 < jpeg.length) {
    if (jpeg[i] !== 0xff) return null;
    const marker = jpeg[i + 1]!;
    const size = (jpeg[i + 2]! << 8) | jpeg[i + 3]!;
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { height: (jpeg[i + 5]! << 8) | jpeg[i + 6]!, width: (jpeg[i + 7]! << 8) | jpeg[i + 8]! };
    }
    i += 2 + size;
  }
  return null;
}

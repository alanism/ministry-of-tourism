import type { PdfTextRun } from '@writers-board/core';

/** Measure only the text actually printed by the canonical SVG, never its unprinted data-flow-source. */
export async function svgPdfTextLayer(source:string,signal?:AbortSignal):Promise<PdfTextRun[]> {
  signal?.throwIfAborted();
  const parsed=new DOMParser().parseFromString(source,'image/svg+xml');
  if(parsed.querySelector('parsererror')||parsed.documentElement.localName!=='svg')throw new Error('The magazine text could not be read.');
  const svg=document.importNode(parsed.documentElement,true) as unknown as SVGSVGElement;
  const host=document.createElement('div');host.setAttribute('aria-hidden','true');
  host.style.cssText='position:fixed;left:-100000px;top:0;pointer-events:none;width:0;height:0;overflow:hidden';
  host.append(svg);document.body.append(host);
  try {
    await document.fonts.ready;signal?.throwIfAborted();
    const bounds=svg.viewBox.baseVal,runs:PdfTextRun[]=[];
    for(const element of svg.querySelectorAll<SVGTextElement>('text')){
      if(element.closest('defs'))continue;
      const lines=element.querySelectorAll<SVGTSpanElement>('tspan');
      for(const line of lines.length?lines:[element]){
        const text=(line.textContent??'').replace(/[\r\n\t]/g,' ');
        if(!text.trim()||!line.getNumberOfChars())continue;
        const style=getComputedStyle(line),matrix=line.getCTM();
        let hidden=false;
        for(let ancestor:Element|null=line;ancestor;ancestor=ancestor.parentElement){
          const paint=getComputedStyle(ancestor);
          if(paint.display==='none'||paint.visibility!=='visible'||paint.opacity==='0'){hidden=true;break;}
          if(ancestor===svg)break;
        }
        if(!matrix||hidden||((style.fill==='none'||style.fillOpacity==='0')&&(style.stroke==='none'||style.strokeOpacity==='0')))continue;
        const rect=line.getBBox(),corners=[[rect.x,rect.y],[rect.x+rect.width,rect.y],[rect.x,rect.y+rect.height],[rect.x+rect.width,rect.y+rect.height]].map(([x,y])=>new DOMPoint(x,y).matrixTransform(matrix));
        if(Math.max(...corners.map(p=>p.x))<=bounds.x||Math.min(...corners.map(p=>p.x))>=bounds.x+bounds.width||Math.max(...corners.map(p=>p.y))<=bounds.y||Math.min(...corners.map(p=>p.y))>=bounds.y+bounds.height)continue;
        const start=line.getStartPositionOfChar(0).matrixTransform(matrix);
        const width=line.getComputedTextLength()*Math.hypot(matrix.a,matrix.b),height=parseFloat(style.fontSize)*Math.hypot(matrix.c,matrix.d);
        if(width>0&&height>0)runs.push({text,x:start.x,y:start.y,width,height,rotation:Math.atan2(matrix.b,matrix.a)*180/Math.PI});
      }
    }
    return runs;
  }finally{host.remove();}
}

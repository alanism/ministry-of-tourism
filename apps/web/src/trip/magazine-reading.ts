// Reflow the canonical page's own text for a narrow reader; the A5 export stays untouched.
const NS='http://www.w3.org/2000/svg';
type Box={x:number;y:number;width:number;height:number};
const bottom=(b:Box)=>b.y+b.height;
const intersects=(a:Box,b:Box)=>a.x<b.x+b.width-1&&b.x<a.x+a.width-1;
let measuring:CanvasRenderingContext2D|null;
function bounds(node:SVGGraphicsElement):Box {
  let b:Box=node.getBBox();
  if(node.tagName==='text'){
    measuring??=document.createElement('canvas').getContext('2d');
    const text=node as SVGTextElement,parts=[...text.querySelectorAll('tspan')].filter(span=>span.textContent?.trim());
    measuring!.font=`${text.getAttribute('font-style')??'normal'} ${text.getAttribute('font-weight')??400} ${text.getAttribute('font-size')}px "${text.getAttribute('font-family')}"`;
    const boxes=parts.map(span=>{const value=span.textContent!,at=span.getStartPositionOfChar(0),ink=measuring!.measureText(value),spacing=Number(text.getAttribute('letter-spacing')??0);return {x:at.x-ink.actualBoundingBoxLeft,y:at.y-ink.actualBoundingBoxAscent,width:ink.actualBoundingBoxLeft+ink.actualBoundingBoxRight+Math.max(0,[...value].length-1)*spacing,height:ink.actualBoundingBoxAscent+ink.actualBoundingBoxDescent};});
    if(boxes.length)b=union(boxes);
  }else if(node.tagName==='g'&&!node.hasAttribute('data-art')){
    const boxes=[...node.children].filter((n):n is SVGGraphicsElement=>n instanceof SVGGraphicsElement&&n.tagName!=='defs').map(bounds).filter(box=>box.width&&box.height);
    if(boxes.length)b=union(boxes);
  }
  let m=new DOMMatrix();const transforms=node.transform?.baseVal;
  for(let i=0;i<(transforms?.numberOfItems??0);i++){const t=transforms!.getItem(i).matrix;m=m.multiply(new DOMMatrix([t.a,t.b,t.c,t.d,t.e,t.f]));}
  const points=[[b.x,b.y],[b.x+b.width,b.y],[b.x,b.y+b.height],[b.x+b.width,b.y+b.height]].map(([x,y])=>new DOMPoint(x,y).matrixTransform(m));
  const x=Math.min(...points.map(p=>p.x)),y=Math.min(...points.map(p=>p.y));
  return {x,y,width:Math.max(...points.map(p=>p.x))-x,height:Math.max(...points.map(p=>p.y))-y};
}
function union(boxes:Box[]):Box{const x=Math.min(...boxes.map(b=>b.x)),y=Math.min(...boxes.map(b=>b.y));return {x,y,width:Math.max(...boxes.map(b=>b.x+b.width))-x,height:Math.max(...boxes.map(bottom))-y};}
export function wrapReadingText(value:string,width:number,measure:(value:string)=>number):string[]{
  const lines:string[]=[];
  for(const paragraph of value.split('\n')){
    if(!paragraph.trim()){lines.push('');continue;}
    let line='';
    for(const word of paragraph.trim().split(/\s+/)){
      if(line&&measure(line+' '+word)>width){lines.push(line);line='';}
      if(measure(word)>width){
        for(const {segment} of new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(word)){
          if(line&&measure(line+segment)>width){lines.push(line);line='';}line+=segment;
        }
      }else line=line?line+' '+word:word;
    }
    if(line)lines.push(line);
  }
  return lines;
}
export async function readableMagazineSvg(source:string,width:number,signal:AbortSignal):Promise<string>{
  if(width>=440)return source;
  const parsed=new DOMParser().parseFromString(source,'image/svg+xml');
  if(parsed.querySelector('parsererror'))throw new Error('This magazine page could not be fitted.');
  const svg=document.importNode(parsed.documentElement,true) as unknown as SVGSVGElement;
  const mount=document.createElement('div');mount.style.cssText='position:fixed;left:-100000px;top:0;width:1184px;visibility:hidden;pointer-events:none';
  mount.append(svg);document.body.append(mount);
  try{
    // The SVG carries its own Plex subsets. Measure these actual faces before wrapping.
    svg.getBBox();await document.fonts.ready;signal.throwIfAborted();
    const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');if(!ctx)throw new Error('Text fitting is unavailable.');
    const scale=width/1184;
    function layout(scope:SVGGraphicsElement){
      const nodes=[...scope.children].filter((n):n is SVGGraphicsElement=>n instanceof SVGGraphicsElement&&!['defs','style','rect','path','circle','mask'].includes(n.tagName)&&!n.hasAttribute('data-jacket-spine'));
      const items=nodes.map(node=>({node,old:bounds(node),next:bounds(node)}));
      for(const item of items){
        const node=item.node;
        if(node.tagName==='text'){
          const size=Number(node.getAttribute('font-size')),family=node.getAttribute('font-family')??'IBM Plex Sans';
          const body=family==='IBM Plex Sans'&&size>=29.5&&size<48;
          const minimum=body?11:family==='IBM Plex Serif'&&size>=77?18:family==='IBM Plex Serif'&&size>=29?11:7;
          const fontSize=Math.max(size,minimum/scale),leading=Number(node.getAttribute('data-flow-leading')??size*1.6)*fontSize/size;
          let x=Number(node.getAttribute('x')),available=Number(node.getAttribute('data-flow-width')??1018);
          const anchor=node.getAttribute('text-anchor')??'start';
          if(anchor==='end')available=x-83;
          for(const other of items.filter(other=>other!==item&&other.node.tagName==='text'&&other.old.y<bottom(item.old)&&item.old.y<bottom(other.old))){
            if(item.old.x+item.old.width<=other.old.x+1)available=Math.min(available,(item.old.x+item.old.width+other.old.x)/2-14-x);
            if(other.old.x+other.old.width<=item.old.x+1&&anchor==='end')available=Math.min(available,x-(other.old.x+other.old.width+item.old.x)/2-14);
          }
          available=Math.max(24,Math.min(available,anchor==='end'?x-24:1160-x));
          const spans=[...node.querySelectorAll('tspan')];
          const value=node.getAttribute('data-flow-source')??(spans.length?spans.map(s=>s.textContent??'').join('\n'):node.textContent??'');
          ctx!.font=`${node.getAttribute('font-style')??'normal'} ${node.getAttribute('font-weight')??400} ${fontSize}px "${family}"`;
          const tracking=Number(node.getAttribute('letter-spacing')??0);
          const lines=wrapReadingText(value,available,text=>ctx!.measureText(text).width+Math.max(0,[...text].length-1)*tracking);
          node.setAttribute('font-size',String(fontSize));node.setAttribute('data-reader-text','true');node.setAttribute('data-reader-body',String(body));
          node.replaceChildren(...lines.map((line,index)=>{const span=document.createElementNS(NS,'tspan');span.setAttribute('x',String(x));span.setAttribute('dy',String(index?leading:0));span.textContent=line;return span;}));
        }else if(!node.hasAttribute('data-art')&&!node.hasAttribute('data-specimen-note')&&(node.hasAttribute('data-postcard-face')||!node.getAttribute('transform')?.includes('rotate(')))layout(node);
        item.next=bounds(node);
      }
      const placed:typeof items=[];
      for(const item of items.sort((a,b)=>a.old.y-b.old.y)){
        // Preserve the existing gap and columns, allowing only later content to move down.
        const viewport=item.node.hasAttribute('data-art')?item.node.querySelector('svg'):null;
        const bleed=viewport&&(Number(viewport.getAttribute('width'))>=1000||Number(viewport.getAttribute('height'))>=1000);
        const delta=bleed?0:Math.max(0,item.old.y-item.next.y)+Math.max(0,...placed.filter(p=>bottom(p.old)<=item.old.y+1&&intersects(union([p.old,p.next]),union([item.old,item.next]))).map(p=>bottom(p.next)-bottom(p.old)));
        if(delta){item.node.setAttribute('transform',`translate(0 ${delta}) ${item.node.getAttribute('transform')??''}`);item.next=bounds(item.node);}
        placed.push(item);
      }
      // A postcard or caption panel grows with its own words rather than clipping them.
      for(const rect of [...scope.children].filter(n=>n.tagName==='rect'&&!n.hasAttribute('filter'))){
        const b=bounds(rect as SVGGraphicsElement);if(b.width>=1184&&b.height>=1680)continue;
        const contained=items.filter(p=>p.node.tagName==='text'&&p.old.x>=b.x-1&&p.old.x+p.old.width<=b.x+b.width+1&&p.old.y>=b.y&&bottom(p.old)<=bottom(b));
        const growth=Math.max(0,...contained.map(p=>bottom(p.next)-bottom(p.old)));
        if(growth)rect.setAttribute('height',String(b.height+growth));
        // These paper knockouts follow the larger phone type, including its full font bounds.
        if(rect.hasAttribute('data-route-label-knockout')||rect.hasAttribute('data-credit-zone')){
          const label=scope.querySelector<SVGGraphicsElement>('text[data-route-label],text[data-credits]');
          if(label){const box=label.getBBox(),shift=label.transform.baseVal.consolidate()?.matrix,fit=union([bounds(rect as SVGGraphicsElement),{x:box.x+(shift?.e??0)-12,y:box.y+(shift?.f??0)-12,width:box.width+24,height:box.height+24}]);for(const name of ['x','y','width','height'] as const)rect.setAttribute(name,String(fit[name]));}
        }
      }
      if(scope.hasAttribute('data-route-diagram')){
        const points=[...scope.querySelectorAll<SVGGraphicsElement>('[data-route-node]')].map(node=>{const y=Number(node.getAttribute('data-route-y')),x=Number(node.getAttribute('data-route-x'));return new DOMPoint(x,y).matrixTransform(node.transform.baseVal.consolidate()?.matrix??new DOMMatrix());});
        scope.querySelector('[data-route-line]')?.setAttribute('d',points.map((p,i)=>`${i?'L':'M'}${p.x} ${p.y}`).join(' '));
      }
    }
    layout(svg);signal.throwIfAborted();
    const inverse=svg.getCTM()!.inverse();
    const wordsBottom=Math.max(0,...[...svg.querySelectorAll<SVGGraphicsElement>('text[data-reader-text]:not([data-credits]):not([data-folio])')].map(text=>{
      const b=bounds(text),parent=(text.parentElement as unknown as SVGGraphicsElement).getCTM()!;
      return Math.max(...[[b.x,b.y],[b.x+b.width,b.y],[b.x,b.y+b.height],[b.x+b.width,b.y+b.height]].map(([x,y])=>new DOMPoint(x,y).matrixTransform(parent).matrixTransform(inverse).y));
    }));
    for(const credit of svg.querySelectorAll<SVGGraphicsElement>('[data-credits]')){
      const block=credit.closest<SVGGraphicsElement>('[data-credit-block]')??credit;
      const delta=wordsBottom+48-bounds(block).y;
      if(delta>0)block.setAttribute('transform',`translate(0 ${delta}) ${block.getAttribute('transform')??''}`);
    }
    const content=[...svg.children].filter((n):n is SVGGraphicsElement=>n instanceof SVGGraphicsElement&&!['defs','rect'].includes(n.tagName)&&!n.hasAttribute('data-jacket-spine')&&!n.hasAttribute('data-folio')&&!(n.hasAttribute('data-art')&&Number(n.querySelector('svg')?.getAttribute('width'))>=1000));
    const folio=svg.querySelector('[data-folio]');
    const height=Math.max(1680,...content.map(n=>bottom(bounds(n))+38+(folio?Number(folio.getAttribute('font-size'))+24:0)));
    svg.setAttribute('height',String(height));svg.setAttribute('viewBox',`0 0 1184 ${height}`);svg.setAttribute('data-reading-width',String(width));
    if(folio){folio.removeAttribute('transform');folio.setAttribute('y',String(height-38));}
    for(const rect of [...svg.children].filter(n=>n.tagName==='rect'&&n.getAttribute('width')==='1184'))rect.setAttribute('height',String(height));
    return new XMLSerializer().serializeToString(svg);
  }finally{mount.remove();}
}

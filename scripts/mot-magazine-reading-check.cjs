const assert=require('node:assert/strict');
const path=require('node:path');

async function checkMagazineReading(page,width,directory){
 await page.waitForFunction(()=>[...document.querySelectorAll('.mot-issue-paper img')].every(image=>{
  if(image.dataset.readingReady!=='true')return false;
  const displayed=Math.floor(image.getBoundingClientRect().width);
  if(displayed>=440)return true;
  const svg=new DOMParser().parseFromString(decodeURIComponent(image.src.split(',').slice(1).join(',')),'image/svg+xml');
  return Number(svg.documentElement.getAttribute('data-reading-width'))===displayed;
 }));
 const result=await page.locator('.mot-issue-paper').evaluateAll(async(papers)=>{
  const failures=[],pages=[];
  for(const paper of papers){
   const p=paper.getBoundingClientRect(),style=getComputedStyle(paper),left=p.left+parseFloat(style.paddingLeft),right=p.right-parseFloat(style.paddingRight);
   for(const image of paper.querySelectorAll('img')){
    const displayed=image.getBoundingClientRect();
    if(displayed.left<left-1||displayed.right>right+1)failures.push({page:image.alt,reason:'page extends beyond visible reader'});
    const parsed=new DOMParser().parseFromString(decodeURIComponent(image.src.split(',').slice(1).join(',')),'image/svg+xml');
    const svg=document.importNode(parsed.documentElement,true),height=Number(svg.getAttribute('height')),box=document.createElement('div');
    box.style.cssText='position:fixed;left:-100000px;top:0;visibility:hidden;width:1184px';svg.style.width='1184px';svg.style.height=height+'px';box.append(svg);document.body.append(box);
    try{
     svg.getBBox();await document.fonts.ready;
     const inverse=svg.getCTM().inverse(),texts=[],ctx=document.createElement('canvas').getContext('2d');let minimum=Infinity;
     for(const text of svg.querySelectorAll('text')){
      if(text.closest('[data-jacket-spine],[data-shared-postmark]'))continue;
      const lines=[...text.querySelectorAll('tspan')];if(!lines.length)lines.push(text);
      const source=text.getAttribute('data-flow-source');
      if(source!==null&&source.replace(/\s/g,'')!==lines.map(line=>line.textContent).join('').replace(/\s/g,''))failures.push({page:image.alt,reason:'source words lost during wrapping'});
      const marked=text.getAttribute('data-reader-body'),isBody=marked===null?text.getAttribute('font-family')==='IBM Plex Sans'&&Math.abs(Number(text.getAttribute('font-size'))-29.6)<.1:marked==='true';
      if(isBody)minimum=Math.min(minimum,Number(text.getAttribute('font-size'))*displayed.width/1184);
      for(const line of lines){
       if(!line.textContent.trim())continue;
       ctx.font=`${text.getAttribute('font-style')??'normal'} ${text.getAttribute('font-weight')??400} ${text.getAttribute('font-size')}px "${text.getAttribute('font-family')}"`;
       const ink=ctx.measureText(line.textContent),at=line.getStartPositionOfChar(0),spacing=Number(text.getAttribute('letter-spacing')??0),b={x:at.x-ink.actualBoundingBoxLeft,y:at.y-ink.actualBoundingBoxAscent,width:ink.actualBoundingBoxLeft+ink.actualBoundingBoxRight+Math.max(0,[...line.textContent].length-1)*spacing,height:ink.actualBoundingBoxAscent+ink.actualBoundingBoxDescent};
       const m=line.getCTM(),points=[[b.x,b.y],[b.x+b.width,b.y],[b.x,b.y+b.height],[b.x+b.width,b.y+b.height]].map(([x,y])=>new DOMPoint(x,y).matrixTransform(m).matrixTransform(inverse));
       const rect={x:Math.min(...points.map(p=>p.x)),y:Math.min(...points.map(p=>p.y)),right:Math.max(...points.map(p=>p.x)),bottom:Math.max(...points.map(p=>p.y))};
       if(rect.x<1||rect.right>1183||rect.y<0||rect.bottom>height)failures.push({page:image.alt,reason:'text crosses page edge',text:line.textContent,rect});
       texts.push({text:line.textContent,owner:text,rect});
      }
     }
     if(minimum<10.99)failures.push({page:image.alt,reason:'body below 11px',minimum});
     for(const panel of svg.querySelectorAll('rect')){
      if(panel.closest('defs'))continue;
      const style=getComputedStyle(panel);if(['none','transparent'].includes(style.fill)||style.fill.startsWith('url(')||Number(style.opacity)<.95||Number(style.fillOpacity)<.95)continue;
      const b=panel.getBBox(),m=panel.getCTM(),points=[[b.x,b.y],[b.x+b.width,b.y],[b.x,b.y+b.height],[b.x+b.width,b.y+b.height]].map(([x,y])=>new DOMPoint(x,y).matrixTransform(m).matrixTransform(inverse));
      const rect={x:Math.min(...points.map(p=>p.x)),y:Math.min(...points.map(p=>p.y)),right:Math.max(...points.map(p=>p.x)),bottom:Math.max(...points.map(p=>p.y))};
      for(const text of texts)if(text.owner.compareDocumentPosition(panel)&Node.DOCUMENT_POSITION_FOLLOWING){
       const w=Math.min(rect.right,text.rect.right)-Math.max(rect.x,text.rect.x),h=Math.min(rect.bottom,text.rect.bottom)-Math.max(rect.y,text.rect.y);
       if(w>2&&h>2)failures.push({page:image.alt,reason:'text covered by later panel',text:text.text,rect});
      }
     }
     for(let i=0;i<texts.length;i++)for(let j=i+1;j<texts.length;j++){
      const a=texts[i],b=texts[j];
      const w=Math.min(a.rect.right,b.rect.right)-Math.max(a.rect.x,b.rect.x),h=Math.min(a.rect.bottom,b.rect.bottom)-Math.max(a.rect.y,b.rect.y);
      if(w>2&&h>2)failures.push({page:image.alt,reason:'text collision',a:a.text,b:b.text,aRect:a.rect,bRect:b.rect});
     }
     pages.push({page:image.alt,bodyMinimum:Number.isFinite(minimum)?minimum:null,textLines:texts.length,height});
    }finally{box.remove();}
   }
  }
  return {pages,failures};
 });
 require('node:fs').writeFileSync(path.join(directory,`reading-${width}.json`),JSON.stringify(result,null,2));
 assert.deepEqual(result.failures,[],`R6-1/G8 text fit at ${width}px`);
 return result;
}
async function captureMagazineSpreads(page,width,directory){
 const main=page.locator('main.mot'),before=await page.locator('.mot-issue-paper img').evaluateAll(nodes=>nodes.map(n=>n.getBoundingClientRect().width));
 const saved=await main.evaluate(el=>{const old=el.getAttribute('style');el.style.width=el.clientWidth+'px';el.style.height='auto';el.style.overflow='visible';return old;});
 const style=await page.addStyleTag({content:'html,body,#root{height:auto!important;overflow:visible!important}'});
 try{
  const after=await page.locator('.mot-issue-paper img').evaluateAll(nodes=>nodes.map(n=>n.getBoundingClientRect().width));
  assert(before.every((w,i)=>Math.abs(w-after[i])<.5),'Full-height capture must retain real reader widths');
  for(const spread of await page.locator('.mot-issue-spread').all())await spread.screenshot({path:path.join(directory,`${await spread.getAttribute('id')}-${width}.png`)});
 }finally{await style.evaluate(el=>el.remove());await main.evaluate((el,saved)=>saved===null?el.removeAttribute('style'):el.setAttribute('style',saved),saved);}
}
async function checkReadingNegativeControls(page,width,directory){
 for(const kind of ['same-element-overlap','unmarked-overflow','opaque-panel-cover']){
  const original=await page.evaluate(kind=>{
   const images=[...document.querySelectorAll('.mot-issue-paper img')];
   for(const [index,image] of images.entries()){
    const svg=new DOMParser().parseFromString(decodeURIComponent(image.src.split(',').slice(1).join(',')),'image/svg+xml');
    const multiline=[...svg.querySelectorAll('text[data-reader-body="true"]')].find(t=>[...t.querySelectorAll('tspan')].filter(s=>s.textContent.trim()).length>1);
    if(!multiline)continue;
    if(kind==='same-element-overlap'){
     const spans=[...multiline.querySelectorAll('tspan')],ink=spans.filter(span=>span.textContent.trim());
     const y=Number(multiline.getAttribute('y'))+spans.slice(0,spans.indexOf(ink[0])+1).reduce((sum,span)=>sum+Number(span.getAttribute('dy')??0),0);
     ink[1].setAttribute('y',String(y));ink[1].setAttribute('dy','0');
    }
    else if(kind==='opaque-panel-cover'){const panel=svg.createElementNS('http://www.w3.org/2000/svg','rect');panel.setAttribute('width','1184');panel.setAttribute('height',svg.documentElement.getAttribute('height'));panel.setAttribute('fill','#fff');svg.documentElement.append(panel);}
    else{const text=svg.createElementNS('http://www.w3.org/2000/svg','text');text.setAttribute('x','1180');text.setAttribute('y','400');text.setAttribute('font-family','IBM Plex Sans');text.setAttribute('font-size','60');text.textContent='EDGE_FAULT';svg.documentElement.append(text);}
    const before=image.src;image.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(new XMLSerializer().serializeToString(svg));return {index,before};
   }
   throw new Error('No multiline page available for the negative control');
  },kind);
  const evidence=path.join(directory,'negative-'+kind);require('node:fs').mkdirSync(evidence,{recursive:true});
  try{
   await assert.rejects(checkMagazineReading(page,width,evidence),/R6-1\/G8/);
   const failures=JSON.parse(require('node:fs').readFileSync(path.join(evidence,`reading-${width}.json`))).failures;
   assert(failures.some(f=>f.reason===(kind==='same-element-overlap'?'text collision':kind==='opaque-panel-cover'?'text covered by later panel':'text crosses page edge')));
  }finally{await page.locator('.mot-issue-paper img').nth(original.index).evaluate((image,src)=>{image.src=src;},original.before);}
 }
 await checkMagazineReading(page,width,directory);
}
module.exports={checkMagazineReading,captureMagazineSpreads,checkReadingNegativeControls};

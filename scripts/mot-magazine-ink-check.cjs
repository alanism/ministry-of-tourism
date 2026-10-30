// Additional shared-reader collision guard. Existing G8 checks and budgets are unchanged.
async function checkMagazineInk(page,pages){
 return page.evaluate(async pages=>{
  const failures=[];let routeLabels=0,protectedIntersections=0,creditBlocks=0;
  for(const {id,svg:source} of pages){
   const svg=document.importNode(new DOMParser().parseFromString(source,'image/svg+xml').documentElement,true),mount=document.createElement('div');
   mount.style.cssText='position:fixed;left:-100000px;top:0;visibility:hidden';mount.append(svg);document.body.append(mount);
   try{
    svg.getBBox();await document.fonts.ready;
    const inverse=svg.getCTM().inverse(),rect=node=>{
     const b=node.getBBox(),matrix=node.getCTM(),points=[[b.x,b.y],[b.x+b.width,b.y],[b.x,b.y+b.height],[b.x+b.width,b.y+b.height]].map(([x,y])=>new DOMPoint(x,y).matrixTransform(matrix).matrixTransform(inverse));
     return{x:Math.min(...points.map(p=>p.x)),y:Math.min(...points.map(p=>p.y)),right:Math.max(...points.map(p=>p.x)),bottom:Math.max(...points.map(p=>p.y))};
    },contains=(outer,inner)=>outer.x<=inner.x&&outer.y<=inner.y&&outer.right>=inner.right&&outer.bottom>=inner.bottom;
    for(const text of svg.querySelectorAll('[data-route-label]')){
     routeLabels++;const label=rect(text),panel=text.parentElement.querySelector('[data-route-label-knockout]');
     const protectedLabel=panel&&panel.getAttribute('fill')==='#FAF7F2'&&contains(rect(panel),label)&&(panel.compareDocumentPosition(text)&Node.DOCUMENT_POSITION_FOLLOWING);
     if(!protectedLabel)failures.push({id,reason:'route label lacks a complete paper knockout',text:text.textContent,label,panel:panel?rect(panel):null});
     for(const path of svg.querySelectorAll('[data-route-diagram] > path')){
      const radius=Number(path.getAttribute('stroke-width'))/2,length=path.getTotalLength(),matrix=path.getCTM();let hit=false;
      for(let at=0;at<=length;at+=4){const p=path.getPointAtLength(at),point=new DOMPoint(p.x,p.y).matrixTransform(matrix).matrixTransform(inverse);if(point.x>=label.x-radius&&point.x<=label.right+radius&&point.y>=label.y-radius&&point.y<=label.bottom+radius){hit=true;break;}}
      if(hit){if(protectedLabel&&(path.compareDocumentPosition(panel)&Node.DOCUMENT_POSITION_FOLLOWING))protectedIntersections++;else failures.push({id,reason:'visible route connector or river crosses label',text:text.textContent});}
     }
    }
    for(const block of svg.querySelectorAll('[data-credit-block]')){
     creditBlocks++;const text=block.querySelector('[data-credits]'),panel=block.querySelector('[data-credit-zone]');
     if(!text||!panel||panel.getAttribute('fill')!=='#FAF7F2'||!contains(rect(panel),rect(text))||!(panel.compareDocumentPosition(text)&Node.DOCUMENT_POSITION_FOLLOWING))failures.push({id,reason:'credit leaves its paper zone'});
    }
   }finally{mount.remove();}
  }
  return{routeLabels,protectedIntersections,creditBlocks,failures};
 },pages);
}
module.exports={checkMagazineInk};

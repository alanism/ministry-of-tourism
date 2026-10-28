import {readAsset,readAllCards,readPresentation,type MagazinePage,type Presentation,type TripSession} from '@writers-board/core';
import type {EditBox} from './composition-geometry';
export const DEFAULT_LAYOUT={dx:0,dy:0,scaleX:1,scaleY:1};
export type SceneObject={key:string;paintGroup:string;pageId:string;pageIndex:number;presentation:Presentation;box:EditBox;local:EditBox;parent:DOMMatrix;label:string;origin?:string;credit?:string;fit:string;sourceWidth:number;sourceHeight:number};
export function compositionPages(pages:MagazinePage[],session:TripSession){
 const objects:SceneObject[]=[];
 const markup=pages.map((page,pageIndex)=>{
  const doc=new DOMParser().parseFromString(page.svg,'image/svg+xml');
  for(const node of doc.querySelectorAll<SVGGraphicsElement>('[data-placement][data-editor-box]')){
   const p=readPresentation(session.parts,node.getAttribute('data-placement')!);if(!p)continue;
   const [x,y,width,height]=node.getAttribute('data-editor-box')!.split(',').map(Number) as [number,number,number,number];
   const local={x,y,width,height,rotation:Number(node.getAttribute('data-editor-angle'))};
   let parent=new DOMMatrix();const ancestors:Element[]=[];for(let a=node.parentElement;a&&a!==doc.documentElement;a=a.parentElement)ancestors.unshift(a);
   for(const a of ancestors){const list=(a as unknown as SVGGraphicsElement).transform?.baseVal;for(let i=0;i<(list?.numberOfItems??0);i++){const t=list!.getItem(i).matrix;parent=parent.multiply(new DOMMatrix([t.a,t.b,t.c,t.d,t.e,t.f]));}}
   const centre=new DOMPoint(x+width/2,y+height/2).matrixTransform(parent),asset=p.assetId?readAsset(session.parts,p.assetId):undefined,card=p.cardId?readAllCards(session.parts).find(c=>c.id===p.cardId):undefined;
   const key=`${page.id}:${p.id}`,label=card?.title??asset?.caption??page.artworkLabels?.find(a=>a.assetId===p.assetId)?.label??'Artwork';
   const box={x:centre.x-width/2+pageIndex*1184,y:centre.y-height/2,width,height,rotation:local.rotation+Math.atan2(parent.b,parent.a)*180/Math.PI};
   const paintGroup=page.id+':'+ancestors.map(a=>Array.from(a.parentElement!.children).indexOf(a)).join('/');
   objects.push({key,paintGroup,pageId:page.id,pageIndex,presentation:p,local,parent,box,label,origin:asset?.source?.cityId,credit:asset?.credit,fit:node.getAttribute('data-fit')??'meet',sourceWidth:asset?.width??0,sourceHeight:asset?.height??0});
   node.setAttribute('data-edit-id',key);node.setAttribute('class','mot-composition-object');node.setAttribute('tabindex','0');node.setAttribute('role','button');node.setAttribute('aria-label',`Select ${label}${p.locked?' (locked)':''}`);
  }
  return new XMLSerializer().serializeToString(doc.documentElement);
 });return {objects,markup};
}
export function patchForBox(object:SceneObject,box:EditBox):Partial<Presentation>{
 const p=object.presentation,old=p.magazineLayout??DEFAULT_LAYOUT,dx=box.x+box.width/2-(object.box.x+object.box.width/2),dy=box.y+box.height/2-(object.box.y+object.box.height/2),inverse=object.parent.inverse();
 const delta=new DOMPoint(dx,dy).matrixTransform(new DOMMatrix([inverse.a,inverse.b,inverse.c,inverse.d,0,0]));
 const w=box.width/object.box.width,h=box.height/object.box.height;
 if(!p.assetId)return{x:p.x+(delta.x+(object.box.width-box.width)/2)/1184,y:p.y+(delta.y+(object.box.height-box.height)/2)/1680,width:p.width*w,height:p.height*h,rotation:p.rotation+box.rotation-object.box.rotation};
 return {magazineLayout:{...old,dx:old.dx+(delta.x+(object.box.width-box.width)/2)/1184,dy:old.dy+(delta.y+(object.box.height-box.height)/2)/1680,scaleX:old.scaleX*w,scaleY:old.scaleY*h},rotation:p.rotation+box.rotation-object.box.rotation};
}
/** Keyboard input can continue while the immutable image bytes are being prepared. */
export function liveCompositionObject(object:SceneObject,p:Presentation):SceneObject{
 const before=object.presentation.magazineLayout??DEFAULT_LAYOUT,after=p.magazineLayout??DEFAULT_LAYOUT;
 const local=p.assetId?{x:object.local.x+(after.dx-before.dx)*1184,y:object.local.y+(after.dy-before.dy)*1680,width:object.local.width*after.scaleX/before.scaleX,height:object.local.height*after.scaleY/before.scaleY,rotation:object.local.rotation+p.rotation-object.presentation.rotation}:{x:p.x*1184,y:p.y*1680,width:p.width*1184,height:p.height*1680,rotation:p.rotation};
 const centre=new DOMPoint(local.x+local.width/2,local.y+local.height/2).matrixTransform(object.parent);
 return {...object,presentation:p,local,box:{x:centre.x-local.width/2+object.pageIndex*1184,y:centre.y-local.height/2,width:local.width,height:local.height,rotation:local.rotation+Math.atan2(object.parent.b,object.parent.a)*180/Math.PI}};
}
/** The generated, escaped SVG is the editor too. Restore each temporary gesture on cleanup. */
export function paintCompositionDraft(root:Element,object:SceneObject,patch:Partial<Presentation>){
 const restores:(()=>void)[]=[];
 for(const node of root.querySelectorAll<SVGGraphicsElement>('[data-placement][data-editor-box]')){
  if(node.getAttribute('data-placement')!==object.presentation.id)continue;
  const viewport=node.querySelector<SVGSVGElement>('svg'),before=node.getAttribute('transform'),attrs=viewport?['x','y','width','height','viewBox'].map(k=>[k,viewport.getAttribute(k)] as const):[];
  restores.push(()=>{if(before===null)node.removeAttribute('transform');else node.setAttribute('transform',before);for(const [k,v] of attrs)if(v!==null)viewport!.setAttribute(k,v);});
  const [x,y,w,h]=node.getAttribute('data-editor-box')!.split(',').map(Number) as [number,number,number,number],base=object.presentation.magazineLayout??DEFAULT_LAYOUT,next=patch.magazineLayout??base;
  const bx=x+(next.dx-base.dx)*1184,by=y+(next.dy-base.dy)*1680,bw=w*next.scaleX/base.scaleX,bh=h*next.scaleY/base.scaleY,angle=Number(node.getAttribute('data-editor-angle'))+(patch.rotation??object.presentation.rotation)-object.presentation.rotation;
  if(viewport){for(const [k,v] of Object.entries({x:bx,y:by,width:bw,height:bh}))viewport.setAttribute(k,String(v));node.setAttribute('transform',`rotate(${angle} ${bx+bw/2} ${by+bh/2})`);if(patch.crop)viewport.setAttribute('viewBox',`${patch.crop[0]*object.sourceWidth} ${patch.crop[1]*object.sourceHeight} ${patch.crop[2]*object.sourceWidth} ${patch.crop[3]*object.sourceHeight}`);}
  else node.setAttribute('transform',`translate(${((patch.x??object.presentation.x)-object.presentation.x)*1184} ${((patch.y??object.presentation.y)-object.presentation.y)*1680}) rotate(${angle} ${x+w/2} ${y+h/2})`);
 }
 return()=>restores.forEach(f=>f());
}
export function printDpi(object:SceneObject,box:EditBox,crop:readonly number[]){if(!object.sourceWidth||!object.sourceHeight)return null;const x=object.sourceWidth*crop[2]!/(box.width/1184*148/25.4),y=object.sourceHeight*crop[3]!/(box.height/1680*210/25.4);return Math.round(object.fit==='slice'?Math.min(x,y):Math.max(x,y));}

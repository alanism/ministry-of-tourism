export type EditBox={x:number;y:number;width:number;height:number;rotation:number};
export type Guides={x?:number;y?:number};
export type Corner='nw'|'ne'|'sw'|'se';
const clamp=(v:number,a:number,b:number)=>Math.max(a,Math.min(b,v));
export function gridLines(){
 const m=82.88,g=28.416,col=(1184-2*m-5*g)/6,row=(1680-2*m-11*g)/12;
 const x=[0,592,1184,1776,2368],y=[0,840,1680];
 for(const offset of [0,1184])for(let i=0;i<6;i++)x.push(offset+m+i*(col+g),offset+m+i*(col+g)+col);
 for(let i=0;i<12;i++)y.push(m+i*(row+g),m+i*(row+g)+row);
 return {x,y};
}
function snap(values:number[],lines:number[]){let best:{delta:number;line:number}|undefined;for(const v of values)for(const line of lines){const delta=line-v;if(Math.abs(delta)<14&&(!best||Math.abs(delta)<Math.abs(best.delta)))best={delta,line};}return best;}
export function moveBox(original:EditBox,dx:number,dy:number,free:boolean){
 const box={...original,x:original.x+dx,y:original.y+dy},g=gridLines();
 const sx=free?undefined:snap([box.x,box.x+box.width/2,box.x+box.width],g.x),sy=free?undefined:snap([box.y,box.y+box.height/2,box.y+box.height],g.y);
 box.x+=sx?.delta??0;box.y+=sy?.delta??0;
 return {box,guides:{x:sx?.line,y:sy?.line} as Guides};
}
export function resizeBox(original:EditBox,corner:Corner,dx:number,dy:number,freeAspect:boolean,freeSnap:boolean){
 const r=original.rotation*Math.PI/180,c=Math.cos(r),s=Math.sin(r),localX=dx*c+dy*s,localY=-dx*s+dy*c,h=corner.includes('w')?-1:1,v=corner.includes('n')?-1:1;
 let width=Math.max(24,original.width+h*localX),height=Math.max(24,original.height+v*localY);
 if(!freeAspect){const scale=Math.max(24/Math.min(original.width,original.height),Math.abs(width/original.width-1)>Math.abs(height/original.height-1)?width/original.width:height/original.height);width=original.width*scale;height=original.height*scale;}
 const centreX=original.x+original.width/2,centreY=original.y+original.height/2;
 const ox=h*(width-original.width)/2,oy=v*(height-original.height)/2;
 let box={...original,x:centreX+ox*c-oy*s-width/2,y:centreY+ox*s+oy*c-height/2,width,height};
 const guides:Guides={};
 if(!freeSnap&&Math.abs(original.rotation%360)<.01){
  const g=gridLines(),sx=snap([h>0?box.x+width:box.x],g.x),sy=snap([v>0?box.y+height:box.y],g.y);
  if(sx||sy){const useX=sx&&(!sy||Math.abs(sx.delta)<=Math.abs(sy.delta));let w=width+(useX?h*sx!.delta:0),ht=height+(!useX?v*sy!.delta:0);if(!freeAspect){if(useX)ht=w*original.height/original.width;else w=ht*original.width/original.height;}box=resizeBox(original,corner,(w-original.width)/h,(ht-original.height)/v,freeAspect,true).box;if(useX)guides.x=sx!.line;else guides.y=sy!.line;}
 }
 return {box,guides};
}
export function rotateTo(angle:number,free:boolean){const a=((angle+180)%360+360)%360-180;if(free)return a;const near=[-90,-45,-9,0,9,45,90].find(v=>Math.abs(a-v)<4);return near??a;}
export function panCrop(crop:readonly number[],dx:number,dy:number):[number,number,number,number]{return [clamp(crop[0]!+dx,0,1-crop[2]!),clamp(crop[1]!+dy,0,1-crop[3]!),crop[2]!,crop[3]!];}
export function zoomCrop(crop:readonly number[],zoom:number):[number,number,number,number]{const ratio=crop[3]!/crop[2]!;const w=Math.min(1/clamp(zoom,1,3),1/ratio);const h=w*ratio;return [clamp(crop[0]!+crop[2]!/2-w/2,0,1-w),clamp(crop[1]!+crop[3]!/2-h/2,0,1-h),w,h];}

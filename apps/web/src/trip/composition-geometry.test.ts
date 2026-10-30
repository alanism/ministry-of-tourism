import {describe,expect,it} from 'vitest';
import {moveBox,resizeBox,rotateTo,panCrop,zoomCrop,gridLines} from './composition-geometry';
const box={x:83,y:118,width:440,height:500,rotation:0};
describe('MOT-103 gesture geometry',()=>{
 it('snaps a moving edge to trim without shrinking the object',()=>{const r=moveBox(box,-80,0,false);expect(r.box.x).toBe(0);expect(r.box.width).toBe(440);expect(r.guides.x).toBe(0);});
 it('retains aspect at every corner and anchors the opposite corner',()=>{for(const corner of ['nw','ne','sw','se'] as const){const r=resizeBox(box,corner,60,40,false,true).box;expect(r.width/r.height).toBeCloseTo(440/500);if(corner.includes('w'))expect(r.x+r.width).toBeCloseTo(box.x+box.width);if(corner.includes('n'))expect(r.y+r.height).toBeCloseTo(box.y+box.height);}});
 it('allows a free resize and retains positive dimensions when crossing the anchor',()=>{const r=resizeBox(box,'nw',900,900,true,true).box;expect(r.width).toBeGreaterThanOrEqual(24);expect(r.height).toBeGreaterThanOrEqual(24);});
 it('uses the exact six-column and twelve-row magazine grid',()=>{const g=gridLines();expect(g.x).toContain(1184);expect(g.x).toContain(82.88);expect(g.y).toContain(0);expect(g.y).toContain(1680);expect(g.x.length).toBe(29);});
 it('snaps rotation to the five required angles and permits free rotation',()=>{for(const angle of [-45,-9,0,9,45])expect(rotateTo(angle+2,false)).toBe(angle);expect(rotateTo(11,true)).toBe(11);});
 it('pans within source bounds and keeps the crop centre while zooming',()=>{expect(panCrop([.2,.2,.5,.5],1,-1)).toEqual([.5,0,.5,.5]);expect(zoomCrop([.25,.25,.5,.5],1)).toEqual([0,0,1,1]);expect(zoomCrop([0,0,1,1],2)).toEqual([.25,.25,.5,.5]);});
 it('only shows a resize guide when the resized edge actually reaches it',()=>{for(const [dx,dy] of [[60,40],[18,30],[-25,-35],[100,55],[661,100]]){const r=resizeBox(box,'se',dx!,dy!,false,false);if(r.guides.x!==undefined)expect(r.box.x+r.box.width).toBeCloseTo(r.guides.x);if(r.guides.y!==undefined)expect(r.box.y+r.box.height).toBeCloseTo(r.guides.y);}});
});

import {isValidElement,type ReactElement} from 'react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {type CatalogueIndexItem} from '@mot/core';
import {CatalogueResults} from './PublicCatalogueBrowser';
const hooks=vi.hoisted(()=>({cursor:0,slots:[] as unknown[],effects:[] as {deps:unknown[];cleanup?:()=>void}[],pending:[] as (()=>void)[]}));
vi.mock('react',async original=>({...await original<typeof import('react')>(),
 useState(initial:unknown){const slot=hooks.cursor++;if(!(slot in hooks.slots))hooks.slots[slot]=initial;return[hooks.slots[slot],(value:unknown)=>{hooks.slots[slot]=value;}];},
 useRef(initial:unknown){const slot=hooks.cursor++;if(!(slot in hooks.slots))hooks.slots[slot]={current:initial};return hooks.slots[slot];},
 useEffect(effect:()=>void|(()=>void),deps:unknown[]){const slot=hooks.cursor++,old=hooks.effects[slot];if(old&&deps.every((x,i)=>Object.is(x,old.deps[i])))return;hooks.effects[slot]={deps};hooks.pending.push(()=>{old?.cleanup?.();const cleanup=effect();if(cleanup)hooks.effects[slot]!.cleanup=cleanup;});},
}));
const item={id:'shirt',title:'Tokyo shirt',type:'shirt',thumbnailUrl:'https://foreignclubberscorespondence.web.app/shirt.png',thumbnailRole:'apparel-mockup',eligibility:{preview:{allowed:true}},rights:{credit:'FCC'}} as CatalogueIndexItem;
function nodes(value:unknown):ReactElement<Record<string,unknown>>[]{if(Array.isArray(value))return value.flatMap(nodes);if(!isValidElement(value))return[];const node=value as ReactElement<Record<string,unknown>>;return[node,...nodes(node.props.children)];}
const thumbnail=nodes(CatalogueResults({items:[item],busy:false,selectedId:null,onSelect(){}})).find(node=>typeof node.type==='function')!;
const Component=thumbnail.type as (props:{item:CatalogueIndexItem})=>ReactElement<Record<string,unknown>>;
let image:{complete:boolean;naturalWidth:number};
function render(selected=item){hooks.cursor=0;const tree=Component({item:selected});const frame=tree.props.ref as {current:unknown};if(frame)frame.current={querySelector:()=>nodes(tree).some(node=>node.type==='img')?image:null};return tree;}
function flush(){for(const effect of hooks.pending.splice(0))effect();}
function hasImage(tree:unknown){return nodes(tree).some(node=>node.type==='img');}
beforeEach(()=>{hooks.cursor=0;hooks.slots=[];hooks.effects=[];hooks.pending=[];image={complete:false,naturalWidth:0};vi.useFakeTimers();vi.stubGlobal('IntersectionObserver',class{callback:(entries:{isIntersecting:boolean}[])=>void;constructor(callback:(entries:{isIntersecting:boolean}[])=>void){this.callback=callback;}observe(){this.callback([{isIntersecting:true}]);}disconnect(){}});});
afterEach(()=>{for(const effect of hooks.effects)effect?.cleanup?.();vi.useRealTimers();vi.unstubAllGlobals();});
it('keeps a cached image whose load event arrived before the passive effect, beyond the timeout',()=>{const tree=render();image={complete:true,naturalWidth:240};(nodes(tree).find(node=>node.type==='img')!.props.onLoad as ()=>void)();flush();vi.advanceTimersByTime(20001);expect(hasImage(render())).toBe(true);});
it('checks the actual decoded image again at the deadline when the load event was missed',()=>{render();flush();image={complete:true,naturalWidth:240};vi.advanceTimersByTime(20001);expect(hasImage(render())).toBe(true);});
it('still times out an undecoded replacement image and never treats complete with zero width as success',()=>{render();image={complete:true,naturalWidth:240};flush();expect(hasImage(render())).toBe(true);image={complete:true,naturalWidth:0};render({...item,thumbnailUrl:item.thumbnailUrl+'?replacement'});flush();vi.advanceTimersByTime(20001);expect(hasImage(render({...item,thumbnailUrl:item.thumbnailUrl+'?replacement'}))).toBe(false);});

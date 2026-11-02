import {isValidElement,type ReactElement} from 'react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
const state=vi.hoisted(()=>({cursor:0,slots:[] as unknown[],pending:[] as (()=>void)[],events:new Map<string,()=>void>()}));
vi.mock('react',async original=>({...await original<typeof import('react')>(),useRef(initial:unknown){return{current:initial};},useEffect(effect:()=>void){const index=state.cursor++;if(index in state.slots)return;state.slots[index]=true;state.pending.push(effect);},useState(initial:unknown){const index=state.cursor++;if(!(index in state.slots))state.slots[index]=typeof initial==='function'?initial():initial;return[state.slots[index],(next:unknown)=>{state.slots[index]=typeof next==='function'?next(state.slots[index]):next;}];}}));
import {TripApp} from './TripApp';
import {createTrip,TripSession} from '@writers-board/core';
function children(tree:unknown):ReactElement<Record<string,unknown>>[]{if(Array.isArray(tree))return tree.flatMap(children);if(!isValidElement(tree))return[];const node=tree as ReactElement<Record<string,unknown>>;return[node,...children(node.props.children)];}
function render(){state.cursor=0;const tree=children(TripApp());for(const effect of state.pending.splice(0))effect();return tree;}
beforeEach(()=>{state.cursor=0;state.slots=[];state.pending=[];state.events.clear();vi.stubEnv('DEV',true);vi.stubGlobal('window',{location:{href:'http://127.0.0.1:5199/?view=trip'},history:{replaceState:vi.fn()},addEventListener:(name:string,callback:()=>void)=>state.events.set(name,callback),removeEventListener:(name:string)=>state.events.delete(name)});});
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();});
it('keeps one independent room host mounted when hidden and through private-workspace transitions',()=>{
 const first=render(),workspace=first.find(node=>typeof node.props.onOpenSharedRoom==='function');expect(workspace).toBeDefined();
 (workspace!.props.onOpenSharedRoom as ()=>void)();let current=render();const room=current.find(node=>node.props.configuration!==undefined)!;expect(room.props.active).toBe(true);expect(room.props.localSession).toBeUndefined();expect(room.key).toBeNull();
 (room.props.onClose as ()=>void)();current=render();const hidden=current.find(node=>node.type===room.type)!;expect(hidden.props.active).toBe(false);expect(hidden.key).toBeNull();
 (current.find(node=>typeof node.props.onOpenSharedRoom==='function')!.props.onOpenSharedRoom as ()=>void)();expect(render().find(node=>node.type===room.type)!.props.active).toBe(true);
});
it('consumes and clears a valid invitation before creating the workspace without redeeming it',()=>{
 const secret='a'.repeat(64);window.location.href='http://127.0.0.1:5199/?view=trip#room=synthetic-room&room-invite='+secret+'&expires=1900000000000';
 const current=render(),room=current.find(node=>node.props.configuration!==undefined)!;expect(window.history.replaceState).toHaveBeenCalledExactlyOnceWith(null,'','http://127.0.0.1:5199/?view=trip');expect(room.props.active).toBe(true);expect(room.props.initialInvite).toEqual({roomId:'synthetic-room',inviteSecret:secret,expiresAt:1900000000000});
 (room.props.onInviteConsumed as (invite:unknown)=>void)(room.props.initialInvite);expect(render().find(node=>node.type===room.type)!.props.initialInvite).toBeUndefined();
});
it('fences a previously rendered development opener and preserves unusable invitations in production',()=>{
 const opener=render().find(node=>typeof node.props.onOpenSharedRoom==='function')!.props.onOpenSharedRoom as ()=>void;vi.stubEnv('DEV',false);opener();expect(render().some(node=>node.props.configuration!==undefined)).toBe(false);
 state.slots=[];window.location.href='http://127.0.0.1:5199/#room=synthetic-room&room-invite='+'a'.repeat(64)+'&expires=1900000000000';expect(render().some(node=>node.props.configuration!==undefined)).toBe(false);expect(window.history.replaceState).not.toHaveBeenCalled();
});
it('attaches a local publication source only through the deliberate board action, retaining it without rebinding',()=>{
 const source=new TripSession(createTrip({title:'Private local source',city:'Aspen',timeZone:null}));try{let tree=render();(tree.find(node=>typeof node.props.onOpenSharedRoom==='function')!.props.onOpenSharedRoom as (source:TripSession)=>void)(source);tree=render();const room=tree.find(node=>node.props.configuration!==undefined)!;expect(room.props.localSession).toBe(source);(room.props.onClose as ()=>void)();expect(render().find(node=>node.type===room.type)!.props.localSession).toBe(source);}finally{source.destroy();}
});
it('consumes a newly received same-document invitation without replacing the independent room host or auto-claiming',()=>{
 const first=render();(first.find(node=>typeof node.props.onOpenSharedRoom==='function')!.props.onOpenSharedRoom as ()=>void)();const room=render().find(node=>node.props.configuration!==undefined)!;
 window.location.href='http://127.0.0.1:5199/?view=trip#room=next-room&room-invite='+'b'.repeat(64)+'&expires=1900000000000';expect(state.events.has('hashchange')).toBe(true);state.events.get('hashchange')!();const next=render().find(node=>node.type===room.type)!;expect(next.props.active).toBe(true);expect((next.props.initialInvite as {roomId:string}).roomId).toBe('next-room');expect(window.history.replaceState).toHaveBeenCalledOnce();expect(next.key).toBeNull();
});
it('does not let an older claim completion clear a newly received invitation',()=>{
 window.location.href='http://127.0.0.1:5199/#room=first-room&room-invite='+'a'.repeat(64)+'&expires=1900000000000';const first=render().find(node=>node.props.configuration!==undefined)!;
 window.location.href='http://127.0.0.1:5199/#room=second-room&room-invite='+'b'.repeat(64)+'&expires=1900000000000';state.events.get('hashchange')!();(first.props.onInviteConsumed as (invite:unknown)=>void)(first.props.initialInvite);expect((render().find(node=>node.type===first.type)!.props.initialInvite as {roomId:string}|undefined)?.roomId).toBe('second-room');
});

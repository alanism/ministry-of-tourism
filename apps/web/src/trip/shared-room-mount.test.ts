import {isValidElement,type ReactElement} from 'react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
const state=vi.hoisted(()=>({cursor:0,slots:[] as unknown[]}));
vi.mock('react',async original=>({...await original<typeof import('react')>(),useRef(initial:unknown){return{current:initial};},useEffect(){},useState(initial:unknown){const index=state.cursor++;if(!(index in state.slots))state.slots[index]=typeof initial==='function'?initial():initial;return[state.slots[index],(next:unknown)=>{state.slots[index]=typeof next==='function'?next(state.slots[index]):next;}];}}));
import {TripApp} from './TripApp';
import {createTrip,TripSession} from '@writers-board/core';
function children(tree:unknown):ReactElement<Record<string,unknown>>[]{if(Array.isArray(tree))return tree.flatMap(children);if(!isValidElement(tree))return[];const node=tree as ReactElement<Record<string,unknown>>;return[node,...children(node.props.children)];}
function render(){state.cursor=0;return children(TripApp());}
beforeEach(()=>{state.cursor=0;state.slots=[];vi.stubEnv('DEV',true);vi.stubGlobal('window',{location:{href:'http://127.0.0.1:5199/?view=trip'},history:{replaceState:vi.fn()}});});
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
 (room.props.onInviteConsumed as ()=>void)();expect(render().find(node=>node.type===room.type)!.props.initialInvite).toBeUndefined();
});
it('fences a previously rendered development opener and preserves unusable invitations in production',()=>{
 const opener=render().find(node=>typeof node.props.onOpenSharedRoom==='function')!.props.onOpenSharedRoom as ()=>void;vi.stubEnv('DEV',false);opener();expect(render().some(node=>node.props.configuration!==undefined)).toBe(false);
 state.slots=[];window.location.href='http://127.0.0.1:5199/#room=synthetic-room&room-invite='+'a'.repeat(64)+'&expires=1900000000000';expect(render().some(node=>node.props.configuration!==undefined)).toBe(false);expect(window.history.replaceState).not.toHaveBeenCalled();
});
it('attaches a local publication source only through the deliberate board action, retaining it without rebinding',()=>{
 const source=new TripSession(createTrip({title:'Private local source',city:'Aspen',timeZone:null}));try{let tree=render();(tree.find(node=>typeof node.props.onOpenSharedRoom==='function')!.props.onOpenSharedRoom as (source:TripSession)=>void)(source);tree=render();const room=tree.find(node=>node.props.configuration!==undefined)!;expect(room.props.localSession).toBe(source);(room.props.onClose as ()=>void)();expect(render().find(node=>node.type===room.type)!.props.localSession).toBe(source);}finally{source.destroy();}
});

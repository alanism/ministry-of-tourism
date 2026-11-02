import{isValidElement,type ReactElement}from'react';import{afterEach,beforeEach,expect,it,vi}from'vitest';
const hooks=vi.hoisted(()=>({cursor:0,slots:[] as unknown[],effects:[] as {deps:unknown[];setup:()=>void|(()=>void);cleanup?:()=>void}[]}));
vi.mock('react',async original=>({...await original<typeof import('react')>(),useState(initial:unknown){const slot=hooks.cursor++;if(!(slot in hooks.slots))hooks.slots[slot]=typeof initial==='function'?initial():initial;return[hooks.slots[slot],(next:unknown)=>{hooks.slots[slot]=typeof next==='function'?next(hooks.slots[slot]):next;}];},useRef(initial:unknown){const slot=hooks.cursor++;if(!(slot in hooks.slots))hooks.slots[slot]={current:initial};return hooks.slots[slot];},useEffect(setup:()=>void|(()=>void),deps:unknown[]){const slot=hooks.cursor++,old=hooks.effects[slot];if(old&&deps.every((value,i)=>Object.is(value,old.deps[i])))return;hooks.effects[slot]={deps,setup};}}));
import{SharedRoomAdmissionPanel}from'./shared-room-admission-panel';import{createSharedRoomClient}from'./shared-room-client';
import*as admission from'../../../../packages/core/src/trip/shared-room-admission';
function nodes(value:unknown):ReactElement<Record<string,unknown>>[]{if(Array.isArray(value))return value.flatMap(nodes);if(!isValidElement(value))return[];const element=value as ReactElement<Record<string,unknown>>;return[element,...nodes(element.props.children)];}
function setup(){for(const effect of hooks.effects){if(!effect)continue;const cleanup=effect.setup();if(cleanup)effect.cleanup=cleanup;}}
function cleanup(){for(const effect of hooks.effects)effect?.cleanup?.();}
beforeEach(()=>{hooks.cursor=0;hooks.slots=[];hooks.effects=[];});afterEach(()=>{cleanup();vi.restoreAllMocks();});
it('can prepare an explicit room publication after StrictMode cleanup and effect setup repeat',async()=>{
 const client=createSharedRoomClient({baseUrl:'http://127.0.0.1:48125',projectId:'demo-mot-rooms',auth:{uid:'owner',getIdToken:async()=>{throw Error('No implicit request');}}}),props={client,onOpenRoom(){}};
 const render=()=>{hooks.cursor=0;return SharedRoomAdmissionPanel(props);};let tree=render();setup();cleanup();setup();tree=render();const button=nodes(tree).find(node=>node.type==='button'&&node.props.children==='Prepare publication preview')!;(button.props.onClick as()=>void)();
 await vi.waitFor(()=>expect(nodes(render()).some(node=>node.type==='h4'&&node.props.children==='Exact publication')).toBe(true),{timeout:500,interval:5});
});
it('does not start a claim after its hash preparation finishes in a disposed account context',async()=>{
 let release!:(id:string)=>void;vi.spyOn(admission,'roomAdminOperationId').mockImplementation(()=>new Promise(resolve=>{release=resolve;}));
 const client=createSharedRoomClient({baseUrl:'http://127.0.0.1:48125',projectId:'demo-mot-rooms',auth:{uid:'guest',getIdToken:async()=>{throw Error('No implicit request');}}}),claim=vi.spyOn(client,'claim').mockRejectedValue(new Error('Late claim must not start'));
 hooks.cursor=0;const tree=SharedRoomAdmissionPanel({client,onOpenRoom(){},initialInvite:{roomId:'room',inviteSecret:'a'.repeat(64),expiresAt:1800000000000}});setup();const button=nodes(tree).find(node=>node.type==='button'&&node.props.children==='Request admission')!;(button.props.onClick as()=>void)();cleanup();release('b'.repeat(64));await Promise.resolve();await Promise.resolve();expect(claim).not.toHaveBeenCalled();
});

import {expect,it,vi} from 'vitest';
import {strFromU8,unzipSync} from 'fflate';
import {guidanceMarkdown} from '../../../../packages/core/src/trip/guidance';
vi.mock('@mot/core',()=>{throw new Error('Room publication and downloads must not initialize the full core barrel');});
it('loads selected-card publication without initializing unrelated core exports',async()=>{
 const module=await import('./shared-room-admission-panel');
 expect(module.prepareRoomPublication).toBeTypeOf('function');
 expect(module.roomPublicationMatches).toBeTypeOf('function');
});
it('builds the exact portable handoff using the leaf guidance implementation',async()=>{
 const {fileHandoffBundle}=await import('./file-handoff');
 const context=new TextEncoder().encode('{"synthetic":"unchanged"}');
 const files=unzipSync(fileHandoffBundle(context));
 expect(files['mot-context.json']).toEqual(context);
 expect(strFromU8(files['TRIP-GUIDE.md']!)).toBe(guidanceMarkdown());
 expect(JSON.parse(strFromU8(files['mot-proposal.schema.json']!))).toHaveProperty('$defs');
});

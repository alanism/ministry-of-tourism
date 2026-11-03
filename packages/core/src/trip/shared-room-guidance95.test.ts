import{expect,it}from'vitest';
import{agentGuidance,guidanceMarkdown,GUIDE_VERSION,startHereMarkdown}from'./guidance';
it('distinguishes implemented local room recovery from unavailable production and external-agent authority',()=>{
 const text=guidanceMarkdown();expect(GUIDE_VERSION).toBe('0.3.3');
 for(const phrase of ['local development','Production sharing remains unavailable','same operation','assigned household','prior PNG','protected household replies'])expect(text).toContain(phrase);
 expect(text).toContain('Files do not grant room membership');expect(text).not.toContain('Authenticated shared rooms and live sync are unavailable here.');
});
it('keeps room receipt and recipient boundaries available in offline JSON and native essentials',()=>{
 const essentials=agentGuidance().essentials.join('\n'),start=startHereMarkdown(['trip.json','guidance.json']);
 expect(essentials).toContain('service acceptance');expect(essentials).toContain('Room card/media backup');expect(start).toContain('Room card/media backup');
});
it('keeps open reply revisions, photo inverse requirements and unconfirmed logout distinct',()=>{
 const text=guidanceMarkdown();expect(text).toContain('A household may revise its own reply while the round remains open');expect(text).toContain('Revising a closed result requires a fresh round');expect(text).toContain('Undo of an added photo removes its reference');expect(text).toContain('Confirmed server session termination');expect(text).toContain('remote termination unconfirmed');
});

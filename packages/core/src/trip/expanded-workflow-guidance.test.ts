import {expect,it} from 'vitest';
import {agentGuidance,guidanceMarkdown,GUIDE_SECTIONS} from './guidance.ts';
it('keeps recipient-purpose restrictions available offline in the same compact guide',()=>{
 const compact=agentGuidance().essentials.join('\n'),markdown=guidanceMarkdown();
 for(const value of ['Owner full backup','Guest copy','Muse selected context','Shareable HTML','Revocation cannot recall downloaded copies']){expect(compact).toContain(value);expect(markdown).toContain(value);}
 expect(compact).toContain('no live-room membership');
});
it('explains actual board, catalogue, voting and portable HTML workflows without inventing live sync',()=>{
 const shown=GUIDE_SECTIONS.flatMap(section=>section.points).join('\n');
 for(const value of ['free board','Browse full FCC collection','mot-household-sticker-points@1','K + 1 - r','standalone HTML','live sync are unavailable'])expect(shown).toContain(value);
 expect(guidanceMarkdown()).toContain('city shop');
});

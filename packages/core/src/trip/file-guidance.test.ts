import {expect,it} from 'vitest';
import {guidanceMarkdown,agentGuidance,GUIDE_VERSION} from './guidance.ts';
it('gives the actual local file route, immutable return bindings and human review in the maintained guide',()=>{
 const guide=guidanceMarkdown();
 expect(guide).toContain('## Use your own Muse with files');
 expect(guide).toContain('contextRequestId');expect(guide).toContain('contextDigest');expect(guide).toContain('mot.proposal');
 expect(guide).toContain('No live trip access');expect(guide).toContain('same browser profile');expect(guide).toContain('Undo');
 expect(agentGuidance().essentials.join(' ')).toContain('deliberately shared context');expect(GUIDE_VERSION).not.toBe('0.2.0');
});

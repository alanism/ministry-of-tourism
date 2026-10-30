import {expect,it} from 'vitest';
import {cardProvenanceLabel} from './sample';
it('labels durable test creations without calling them Muse and keeps real/host labels distinct',()=>{
 expect(cardProvenanceLabel({provenance:'agent',createdBy:'test-adapter:owner'})).toBe('Test adapter');
 expect(cardProvenanceLabel({provenance:'agent',createdBy:'owner'})).toBe('Muse suggestion');
 expect(cardProvenanceLabel({provenance:'host',createdBy:'test-adapter:owner'})).toBe('Host guide');
});

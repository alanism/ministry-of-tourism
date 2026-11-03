import {unzipSync,strFromU8} from 'fflate';
import {expect,it} from 'vitest';
import {guidanceMarkdown} from '@mot/core';
import contract from '../../../../docs/mcp-public-file.schema.json';
import {fileHandoffBundle} from './file-handoff';
it('bundles exactly the issued bytes plus the same maintained guide/schema, without a whole native document',()=>{
 const bytes=new TextEncoder().encode('{"format":"mot.context","contextRequestId":"exact-unchanged"}');
 const files=unzipSync(fileHandoffBundle(bytes));
 expect(Object.keys(files).sort()).toEqual(['START-HERE.txt','TRIP-GUIDE.md','mot-context.json','mot-proposal.schema.json']);
 expect(files['mot-context.json']).toEqual(bytes);
 expect(strFromU8(files['TRIP-GUIDE.md']!)).toBe(guidanceMarkdown());
 expect(JSON.parse(strFromU8(files['mot-proposal.schema.json']!))).toEqual(contract);
 expect(strFromU8(files['START-HERE.txt']!)).toContain('Nothing is applied by this file');
 expect(strFromU8(files['START-HERE.txt']!)).toContain('contextDigest');
});

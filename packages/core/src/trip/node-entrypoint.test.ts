import {execFileSync} from 'node:child_process';
import {expect,it} from 'vitest';

it('loads the public core entrypoint in the supported native Node runtime',()=>{
  const entry=new URL('../index.ts',import.meta.url).href;
  const result=execFileSync(process.execPath,['--input-type=module','-e',`const core=await import(${JSON.stringify(entry)});process.stdout.write(typeof core.importTripPackage);`],{encoding:'utf8',timeout:10000});
  expect(result).toBe('function');
});

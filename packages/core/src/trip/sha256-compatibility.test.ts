import {expect,it} from 'vitest';
import {sha256Hex as legacy} from './package.ts';
import {sha256Hex} from './sha256.ts';

it('preserves the existing package hash export as the same function',()=>{
  expect(legacy).toBe(sha256Hex);
});

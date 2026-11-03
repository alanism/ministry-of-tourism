import {expect,it,vi} from 'vitest';

vi.mock('./package.ts',()=>{throw new Error('Public catalogue must not load private trip packaging');});

it('loads catalogue helpers without evaluating trip packaging',async()=>{
  const {normalizeCatalogueQuery}=await import('./public-catalogue.ts');
  expect(normalizeCatalogueQuery('  ASPEN  ')).toBe('aspen');
});

it('hashes standard vectors and only the visible bytes of a typed-array view',async()=>{
  const {sha256Hex}=await import('./sha256.ts');
  expect(await sha256Hex(new Uint8Array())).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  const bytes=new TextEncoder().encode('xabcx');
  expect(await sha256Hex(bytes.subarray(1,4))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});

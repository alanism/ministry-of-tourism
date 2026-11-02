import { expect, it } from 'vitest';
import { canonicalFileJson, parseFileJson } from './file-exchange-json.ts';
const bytes = (text: string) => new TextEncoder().encode(text);
it('uses RFC 8785 property ordering, escaping and ECMAScript number serialization', () => {
  expect(canonicalFileJson({ z: -0, a: [333333333.33333329, 1e-7, 0.002, '\n', '€'], '😀': 2, '\r': 1 })).toBe('{"\\r":1,"a":[333333333.3333333,1e-7,0.002,"\\n","€"],"z":0,"😀":2}');
  expect(canonicalFileJson({ '\ufffd': 1, '😀': 2 })).toBe('{"😀":2,"�":1}');
});
it('rejects duplicate keys after escape decoding, invalid UTF-8, Unicode, unsafe numbers and trailing data', () => {
  for (const text of ['{"a":1,"\\u0061":2}', '{"x":{"id":1,"id":2}}', '"\\ud800"', '1e999', '9007199254740992', '{} false']) expect(() => parseFileJson(bytes(text))).toThrow();
  expect(() => parseFileJson(new Uint8Array([0x22, 0xff, 0x22]))).toThrow();
  for (const value of [NaN, Infinity, 9007199254740992, '\ud800', { x: undefined }]) expect(() => canonicalFileJson(value)).toThrow();
});
it('enforces the exact 512 KiB byte boundary and depth 16 before parsing untrusted files', () => {
  expect(parseFileJson(bytes(' '.repeat(524286) + '{}'))).toEqual({});
  expect(() => parseFileJson(bytes(' '.repeat(524287) + '{}'))).toThrow();
  expect(parseFileJson(bytes('['.repeat(16) + '0' + ']'.repeat(16)))).toBeDefined();
  expect(() => parseFileJson(bytes('['.repeat(17) + '0' + ']'.repeat(17)))).toThrow();
});

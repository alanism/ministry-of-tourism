export const FILE_BYTES = 512 * 1024;
const unicode = (text: string) => { if (/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(text)) throw new Error('Invalid file Unicode.'); };
const number = (value: number) => { if (!Number.isFinite(value) || (Number.isInteger(value) && !Number.isSafeInteger(value))) throw new Error('Invalid file number.'); };
/** RFC 8785: ECMAScript primitives, UTF-16 code-unit key ordering, no Unicode normalization. */
export function canonicalFileJson(value: unknown, depth = 0): string {
  if (value === null) return 'null';
  if (typeof value === 'string') { unicode(value); return JSON.stringify(value); }
  if (typeof value === 'number') { number(value); return JSON.stringify(value); }
  if (typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value !== 'object' || depth >= 16) throw new Error('Invalid file JSON value or depth.');
  if (Array.isArray(value)) return '[' + value.map(item => canonicalFileJson(item, depth + 1)).join(',') + ']';
  return '{' + Object.keys(value).sort().map(key => { unicode(key); return JSON.stringify(key) + ':' + canonicalFileJson((value as Record<string, unknown>)[key], depth + 1); }).join(',') + '}';
}
/** Scan all JSON tokens first so JSON.parse cannot silently erase duplicate keys. */
export function parseFileJson(bytes: Uint8Array): unknown {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength > FILE_BYTES) throw new Error('File exceeds the 512 KiB limit.');
  const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  const token = /[\x20\t\r\n]+|"(?:\\(?:["\\/bfnrt]|u[0-9a-fA-F]{4})|[^"\\\u0000-\u001f])*"|[{}\[\]:,]|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null/y;
  const stack: { kind: string; keys: Set<string> }[] = [];
  let at = 0;
  while (at < text.length) {
    token.lastIndex = at;
    const found = token.exec(text); if (!found) throw new Error('Invalid file JSON.');
    const value = found[0]; at = token.lastIndex;
    if (/^[\x20\t\r\n]+$/.test(value)) continue;
    if (value === '{' || value === '[') { stack.push({ kind: value, keys: new Set() }); if (stack.length > 16) throw new Error('File JSON exceeds depth 16.'); }
    else if (value === '}' || value === ']') { if (stack.pop()?.kind !== (value === '}' ? '{' : '[')) throw new Error('Invalid file JSON.'); }
    else if (value.startsWith('"')) {
      const decoded = JSON.parse(value) as string; unicode(decoded);
      if (/^[\x20\t\r\n]*:/.test(text.slice(at))) { const frame = stack.at(-1); if (!frame || frame.kind !== '{' || frame.keys.has(decoded)) throw new Error('Duplicate file JSON key.'); frame.keys.add(decoded); }
    } else if (/^-?\d/.test(value)) number(Number(value));
  }
  const parsed: unknown = JSON.parse(text);
  canonicalFileJson(parsed);
  return parsed;
}

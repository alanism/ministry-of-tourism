import { describe, expect, it } from 'vitest';
import { decodePcm, encodePcm } from './pcm';

describe('Gemini PCM audio', () => {
  it('uses signed 16-bit little-endian samples with clipping and finite silence', () => {
    const encoded = encodePcm(new Float32Array([-2, -1, -0.5, 0, 0.5, 1, 2, NaN]));
    const bytes = Buffer.from(encoded, 'base64');
    expect([...bytes.subarray(0, 4)]).toEqual([0, 128, 0, 128]);
    expect([...decodePcm(encoded)]).toEqual([-1, -1, -0.5, 0, 0.5, 32767 / 32768, 32767 / 32768, 0]);
  });
  it('rejects truncated samples rather than playing corrupted audio', () => {
    expect(() => decodePcm('AA==')).toThrow(/audio/i);
  });
});

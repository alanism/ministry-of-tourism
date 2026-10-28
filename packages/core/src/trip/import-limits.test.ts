// Review #9: size limits are checked from the archive's directory, before anything is inflated.
import { describe, expect, it, vi } from 'vitest';
import * as fflate from 'fflate';
import { importTripPackage } from './import.ts';

vi.mock('fflate', async (original) => {
  const real = await original<typeof import('fflate')>();
  return { ...real, unzipSync: vi.fn(real.unzipSync) };
});

describe('#9 decompression bomb', () => {
  it('refuses an oversized entry without inflating it', async () => {
    const big = new Uint8Array(11 * 1024 * 1024); // zeros: a few KB compressed, 11 MB inflated
    const zip = fflate.zipSync({ 'manifest.json': new TextEncoder().encode('{}'), 'assets/big': big });
    expect(zip.length).toBeLessThan(200 * 1024);
    await expect(importTripPackage(zip)).rejects.toThrow(/too large/);
    const inflated = vi.mocked(fflate.unzipSync).mock.results.map((r) => r.value as Record<string, Uint8Array>);
    expect(inflated.some((files) => 'assets/big' in files)).toBe(false);
  });
  it('refuses entries that together expand past the total limit', async () => {
    const files: Record<string, Uint8Array> = { 'manifest.json': new TextEncoder().encode('{}') };
    for (let i = 0; i < 6; i++) files[`assets/p${i}`] = new Uint8Array(9 * 1024 * 1024);
    await expect(importTripPackage(fflate.zipSync(files))).rejects.toThrow(/too much data/);
  });
});

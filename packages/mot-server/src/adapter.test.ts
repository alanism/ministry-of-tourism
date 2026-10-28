import { describe, expect, it } from 'vitest';
import { createMuseAdapter } from './index.ts';

describe('MOT-23 server adapter (not deployed)', () => {
  it('says unavailable without a server key and never fakes a call with one', async () => {
    expect(createMuseAdapter({}).status().available).toBe(false);
    await expect(createMuseAdapter({}).propose({ boardId: 'b', prompt: 'hi' })).resolves.toMatchObject({ status: 'unavailable' });
    await expect(createMuseAdapter({ META_API_KEY: 'test' }).propose({ boardId: 'b', prompt: 'hi' })).resolves.toMatchObject({ status: 'unavailable' });
  });
});

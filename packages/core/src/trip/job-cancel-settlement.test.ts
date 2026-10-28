import { expect, it, vi } from 'vitest';
import { JobRunner } from './jobs.ts';

it('Stop settles a hung job immediately and never commits its late result', async () => {
  const runner = new JobRunner();
  const commit = vi.fn();
  const pending = runner.start('hung', () => new Promise<never>(() => {}), { onDone: commit, timeoutMs: 30 });
  expect(runner.stop('hung')).toBe(true);
  const result = await Promise.race([pending.then(job => job.status), new Promise(resolve => setTimeout(() => resolve('still-running'), 10))]);
  expect(result).toBe('cancelled');
  expect(commit).not.toHaveBeenCalled();
});

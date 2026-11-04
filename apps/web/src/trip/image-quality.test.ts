import { expect, it, vi } from 'vitest';
import { qualityRubric, parseQualityScore, judgeImageQuality, runQualityLoop, type QualityScore } from './image-quality';
import type { MuseImageResult } from './muse-image';

const image: MuseImageResult = { blob: new Blob(['fixture'], { type: 'image/png' }), mime: 'image/png', width: 800, height: 1200, elapsedMs: 1, createdAt: '2026-11-05', model: 'fixture' };
function raw(style: 'fashion' | 'city' = 'fashion', score = 4, pass: boolean | null = true) {
  return { criteria: Array.from({ length: 20 }, (_, i) => ({ id: i + 1, score, evidence: `Visible evidence ${i + 1}`, fix: score < 5 ? 'Correct the visible defect.' : '' })), gates: qualityRubric(style).gates.map((_, i) => ({ id: i + 1, pass, evidence: 'Visible gate evidence', fix: pass ? '' : 'Fix the critical defect.' })), preserve: ['Keep the source crop'], defects: score < 4 ? ['Correct the visible defect'] : [] };
}
const score = (points = 4, pass: boolean | null = true): QualityScore => parseQualityScore(raw('fashion', points, pass), 'fashion', image);
it('uses two distinct exact 20-row, five-anchor rubrics and computes acceptance without invented thresholds', () => {
  for (const style of ['fashion', 'city'] as const) {
    const rubric = qualityRubric(style);expect(rubric.criteria).toHaveLength(20);
    expect(rubric.text).toContain('at least 80/100');expect(rubric.criteria.every(row => row.anchors.length === 5)).toBe(true);
    const result = parseQualityScore(raw(style), style, image);expect(result.total).toBe(80);expect(result.accepted).toBe(true);
  }
  expect(qualityRubric('city').text).not.toContain('| 2 | Facial character');
  expect(score(5, false).accepted).toBe(false);expect(score(5, null).accepted).toBe(false);
  const mixed = raw();mixed.criteria[0]!.score = 1;mixed.criteria[1]!.score = 5;mixed.criteria[2]!.score = 5;mixed.criteria[3]!.score = 5;
  expect(parseQualityScore(mixed, 'fashion', image).accepted).toBe(true);
  expect(parseQualityScore(raw(), 'fashion', { ...image, mime: 'image/jpeg' }).accepted).toBe(false);
});
it('rejects missing, duplicate, fractional or out-of-range scores and missing gate evidence', () => {
  for (const value of [ { ...raw(), criteria: raw().criteria.slice(1) }, { ...raw(), criteria: raw().criteria.map(row => ({ ...row, id: 1 })) }, { ...raw(), criteria: raw().criteria.map(row => ({ ...row, score: 5.5 })) }, { ...raw(), gates: [] }, { ...raw(), preserve: [''] } ]) expect(() => parseQualityScore(value, 'fashion', image)).toThrow();
});
it('stops on the first 80+ gated candidate, bounds retries at three and retains the best complete scorecard', async () => {
  const generate = vi.fn(async (_prompt: string) => image), judge = vi.fn().mockResolvedValueOnce(score(3)).mockResolvedValueOnce(score(4));
  const result = await runQualityLoop({ prompt: 'Approved prompt', signal: new AbortController().signal, generate, judge });
  expect(generate).toHaveBeenCalledTimes(2);expect(judge).toHaveBeenCalledTimes(2);expect(result.status).toBe('accepted');expect(result.best).toBe(1);
  expect(generate.mock.calls[1]![0]).toContain('Keep the source crop');expect(generate.mock.calls[1]![0]).toContain('Correct the visible defect');
  const limited = await runQualityLoop({ prompt: 'Approved prompt', signal: new AbortController().signal, generate, judge: vi.fn().mockResolvedValueOnce(score(3)).mockResolvedValueOnce(score(5, false)).mockResolvedValueOnce(score(2)) });
  expect(limited.candidates).toHaveLength(3);expect(limited.status).toBe('limit');expect(limited.best).toBe(0);expect(limited.candidates[limited.best]!.score?.accepted).toBe(false);
});
it('never retries an unavailable judge, failed generation or stopped request and preserves an unscored candidate', async () => {
  const generate = vi.fn(async () => image);
  const unavailable = await runQualityLoop({ prompt: 'Prompt', signal: new AbortController().signal, generate, judge: async () => { throw Error('offline'); } });
  expect(unavailable.status).toBe('unavailable');expect(unavailable.candidates).toHaveLength(1);expect(generate).toHaveBeenCalledOnce();
  const abort = new AbortController();abort.abort();generate.mockClear();
  const stopped = await runQualityLoop({ prompt: 'Prompt', signal: abort.signal, generate, judge: async () => score() });expect(stopped.status).toBe('stopped');expect(generate).not.toHaveBeenCalled();
  const broken = vi.fn().mockResolvedValueOnce(image).mockRejectedValueOnce(Error('uncertain provider failure'));
  const failed = await runQualityLoop({ prompt: 'Prompt', signal: new AbortController().signal, generate: broken, judge: async () => score(3) });
  expect(failed.status).toBe('generation-failed');expect(failed.candidates).toHaveLength(1);expect(broken).toHaveBeenCalledTimes(2);
});
it('sends only source, reference and candidate directly to Standard vision without tools, storage or public discovery', async () => {
  const fetcher = vi.fn(async () => new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(raw()) } }] })));
  const result = await judgeImageQuality({ key: 'FICTIONAL', source: image.blob, reference: image.blob, image, style: 'fashion', prompt: 'Locked brief', signal: new AbortController().signal }, fetcher);
  expect(result.total).toBe(80);expect(fetcher).toHaveBeenCalledOnce();
  const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];const body = JSON.parse(String(init.body));
  expect(url).toBe('https://api.meta.ai/v1/chat/completions');expect(body.model).toBe('muse-spark-1.3');expect(body.store).toBe(false);expect(body.tool_choice).toBe('none');expect(body.tools).toBeUndefined();
  expect(body.messages[1].content.filter((part: {type:string}) => part.type === 'image_url')).toHaveLength(3);
  expect(init).toMatchObject({ credentials: 'omit', redirect: 'error', headers: { Authorization: 'Bearer FICTIONAL' } });
});

import { beforeEach, expect, it, vi } from 'vitest';
import { cityArtSnapshot, resetCityArtSnapshots } from './export-snapshot';

const mocks = vi.hoisted(() => ({ catalog: vi.fn(), apparel: vi.fn() }));
vi.mock('../artwork/catalog', () => ({ readCatalog: mocks.catalog, manifestSchema: {}, catalogSchema: {} }));
vi.mock('@mot/core', () => ({ loadCityApparel: mocks.apparel, TRIP_PACKAGE_LIMITS: { fileBytes: 50 * 1024 * 1024 } }));
const emptyManifest = { catalogs: [] };
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((ok, fail) => { resolve = ok; reject = fail; });
  return { promise, resolve, reject };
};

beforeEach(() => {
  resetCityArtSnapshots();
  mocks.catalog.mockReset().mockResolvedValue(emptyManifest);
  mocks.apparel.mockReset().mockResolvedValue([]);
});

it('rejects an already cancelled caller without starting a city lookup', async () => {
  const controller = new AbortController();
  controller.abort(new Error('cancelled before lookup'));
  await expect(cityArtSnapshot('bangkok', { signal: controller.signal })).rejects.toBe(controller.signal.reason);
  expect(mocks.catalog).not.toHaveBeenCalled();
});

it('does not return a cached snapshot to an already cancelled caller', async () => {
  await cityArtSnapshot('bangkok');
  const controller = new AbortController();
  controller.abort(new Error('cancelled cached lookup'));
  await expect(cityArtSnapshot('bangkok', { signal: controller.signal })).rejects.toBe(controller.signal.reason);
  expect(mocks.catalog).toHaveBeenCalledTimes(1);
});

it('cancels a waiting caller promptly while preserving the original lookup and cache', async () => {
  const manifest = deferred<typeof emptyManifest>();
  mocks.catalog.mockReturnValueOnce(manifest.promise);
  const owner = cityArtSnapshot('bangkok');
  const controller = new AbortController(), rejected = vi.fn();
  const waiter = cityArtSnapshot('bangkok', { signal: controller.signal }).catch(rejected);
  controller.abort(new Error('cancel only the waiter'));
  await Promise.resolve();
  try {
    expect(rejected).toHaveBeenCalledWith(controller.signal.reason);
    expect(mocks.catalog).toHaveBeenCalledTimes(1);
  } finally {
    manifest.resolve(emptyManifest);
    await waiter;
  }
  const snapshot = await owner;
  expect(await cityArtSnapshot('bangkok')).toBe(snapshot);
});

it('retries for a live waiter when the original caller cancels its lookup', async () => {
  const manifest = deferred<typeof emptyManifest>();
  mocks.catalog.mockReturnValueOnce(manifest.promise);
  const controller = new AbortController();
  const reason = new Error('cancel the original lookup');
  const owner = cityArtSnapshot('bangkok', { signal: controller.signal });
  const ownerResult = expect(owner).rejects.toBe(reason);
  const waiter = cityArtSnapshot('bangkok');
  controller.abort(reason);
  manifest.reject(controller.signal.reason);
  await ownerResult;
  expect((await waiter).cityId).toBe('bangkok');
  expect(mocks.catalog).toHaveBeenCalledTimes(2);
});

it('shares a single successful lookup and releases the waiter abort listener', async () => {
  const controller = new AbortController(), remove = vi.spyOn(controller.signal, 'removeEventListener');
  const [owner, waiter] = await Promise.all([cityArtSnapshot('bangkok'), cityArtSnapshot('bangkok', { signal: controller.signal })]);
  expect(waiter).toBe(owner);
  expect(mocks.catalog).toHaveBeenCalledTimes(1);
  expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
});

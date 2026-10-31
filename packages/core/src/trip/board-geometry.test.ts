import { describe, it, expect } from 'vitest';
import { BOARD_EXTENT_V1, boardAssetRect, boardCardRect, compareBoardObjects } from './board-geometry.ts';

type CardInput = Parameters<typeof boardCardRect>[0];
type CardRect = ReturnType<typeof boardCardRect>;
type AssetInput = Parameters<typeof boardAssetRect>[0];
type AssetRect = NonNullable<ReturnType<typeof boardAssetRect>>;
type BoardObjectInput = Parameters<typeof compareBoardObjects>[0];
type PlacedObject = BoardObjectInput & { x: number; y: number };

const boardAsset = (overrides: Record<string, unknown> = {}): AssetInput => ({
  surface: 'board',
  assetId: 'asset-1',
  x: 0.125,
  y: 0.25,
  width: 0.5,
  height: 0.25,
  zIndex: 7,
  rotation: 0,
  ...overrides,
} as AssetInput);

const placed = (kind: BoardObjectInput['kind'], id: string, stack: number, x = 0, y = 0): PlacedObject => ({ kind, id, stack, x, y });

describe('BOARD_EXTENT_V1', () => {
  it('is the fixed 10000-unit board extent', () => {
    expect(BOARD_EXTENT_V1).toBe(10000);
  });
});

describe('boardCardRect', () => {
  it.each([
    ['applies the default size and stack', { x: 100, y: 200 }, { x: 100, y: 200, width: 1200, height: 900, stack: 0 }],
    ['accepts zero coordinates and an explicit zero stack', { x: 0, y: 0, boardWidth: 400, boardHeight: 300, boardStack: 0 }, { x: 0, y: 0, width: 400, height: 300, stack: 0 }],
    ['accepts fractional world geometry', { x: 10.5, y: 20.25, boardWidth: 400.5, boardHeight: 300.75, boardStack: -2 }, { x: 10.5, y: 20.25, width: 400.5, height: 300.75, stack: -2 }],
    ['accepts minimum dimensions', { x: 9600, y: 9700, boardWidth: 400, boardHeight: 300, boardStack: 3 }, { x: 9600, y: 9700, width: 400, height: 300, stack: 3 }],
    ['accepts maximum dimensions exactly filling the remaining board', { x: 5000, y: 5000, boardWidth: 5000, boardHeight: 5000, boardStack: 1000000 }, { x: 5000, y: 5000, width: 5000, height: 5000, stack: 1000000 }],
    ['accepts the lowest stack at the origin with maximum size', { x: 0, y: 0, boardWidth: 5000, boardHeight: 5000, boardStack: -1000000 }, { x: 0, y: 0, width: 5000, height: 5000, stack: -1000000 }],
    ['accepts a default-sized card ending exactly on both far edges', { x: 8800, y: 9100 }, { x: 8800, y: 9100, width: 1200, height: 900, stack: 0 }],
  ] as Array<[string, CardInput, CardRect]>)('%s', (_name, input, expected) => {
    expect(boardCardRect(input)).toEqual(expected);
  });

  it.each([
    ['negative x', { x: -1, y: 0 }],
    ['negative y', { x: 0, y: -0.5 }],
    ['NaN x', { x: Number.NaN, y: 0 }],
    ['infinite y', { x: 0, y: Number.POSITIVE_INFINITY }],
    ['negatively infinite width', { x: 0, y: 0, boardWidth: Number.NEGATIVE_INFINITY }],
    ['null x when supplied', { x: null, y: 0 }],
    ['null y when supplied', { x: 0, y: null }],
    ['null width instead of using the default', { x: 0, y: 0, boardWidth: null }],
    ['null height instead of using the default', { x: 0, y: 0, boardHeight: null }],
    ['null stack instead of using the default', { x: 0, y: 0, boardStack: null }],
    ['zero width below the minimum', { x: 0, y: 0, boardWidth: 0 }],
    ['width just below the minimum', { x: 0, y: 0, boardWidth: 399.999 }],
    ['width just above the maximum', { x: 0, y: 0, boardWidth: 5000.001 }],
    ['zero height below the minimum', { x: 0, y: 0, boardHeight: 0 }],
    ['height just below the minimum', { x: 0, y: 0, boardHeight: 299.999 }],
    ['height just above the maximum', { x: 0, y: 0, boardHeight: 5000.001 }],
    ['NaN height', { x: 0, y: 0, boardHeight: Number.NaN }],
    ['fractional stack', { x: 0, y: 0, boardStack: 1.5 }],
    ['negative fractional stack', { x: 0, y: 0, boardStack: -0.25 }],
    ['NaN stack', { x: 0, y: 0, boardStack: Number.NaN }],
    ['infinite stack', { x: 0, y: 0, boardStack: Number.POSITIVE_INFINITY }],
    ['stack above the limit', { x: 0, y: 0, boardStack: 1000001 }],
    ['stack below the limit', { x: 0, y: 0, boardStack: -1000001 }],
    ['default width overflowing the right edge by one unit', { x: 8801, y: 0 }],
    ['default height overflowing the bottom edge by one unit', { x: 0, y: 9101 }],
    ['an epsilon overflow is not widened into a fit', { x: 8800.000001, y: 0 }],
    ['maximum width starting beyond its only fitting position', { x: 5000.5, y: 0, boardWidth: 5000 }],
    ['a card entirely beyond the board', { x: 10000, y: 0, boardWidth: 400, boardHeight: 300 }],
  ] as Array<[string, unknown]>)('rejects %s with RangeError', (_name, input) => {
    expect(() => boardCardRect(input as CardInput)).toThrow(RangeError);
  });

  it('does not mutate a frozen card input', () => {
    const input = Object.freeze({ x: 25, y: 50, boardWidth: 800, boardHeight: 600, boardStack: 4 });
    expect(boardCardRect(input)).toEqual({ x: 25, y: 50, width: 800, height: 600, stack: 4 });
    expect(input).toEqual({ x: 25, y: 50, boardWidth: 800, boardHeight: 600, boardStack: 4 });
  });
});

describe('boardAssetRect', () => {
  it.each([
    ['converts normalized board geometry to world units', boardAsset(), { x: 1250, y: 2500, width: 5000, height: 2500, stack: 7 }],
    ['accepts zero position and zero stack', boardAsset({ x: 0, y: 0, width: 0.125, height: 0.125, zIndex: 0 }), { x: 0, y: 0, width: 1250, height: 1250, stack: 0 }],
    ['accepts an asset ending exactly on both far edges', boardAsset({ x: 0.875, y: 0.75, width: 0.125, height: 0.25, zIndex: -1000000 }), { x: 8750, y: 7500, width: 1250, height: 2500, stack: -1000000 }],
    ['accepts a full-extent asset at the maximum stack', boardAsset({ x: 0, y: 0, width: 1, height: 1, zIndex: 1000000 }), { x: 0, y: 0, width: 10000, height: 10000, stack: 1000000 }],
    ['does not impose an asset ID format beyond non-emptiness', boardAsset({ assetId: 'asset with spaces/🚀', x: 0.5, y: 0.5, width: 0.25, height: 0.25, zIndex: 1 }), { x: 5000, y: 5000, width: 2500, height: 2500, stack: 1 }],
  ] as Array<[string, AssetInput, AssetRect]>)('%s', (_name, input, expected) => {
    expect(boardAssetRect(input)).toEqual(expected);
  });

  it('accepts the 100-unit minimum asset dimensions', () => {
    const rect = boardAssetRect(boardAsset({ width: 0.01, height: 0.01 }));
    expect(rect).not.toBeNull();
    expect(rect?.width).toBeCloseTo(100, 10);
    expect(rect?.height).toBeCloseTo(100, 10);
  });

  it.each([
    ['surface is absent', { assetId: 'legacy-1', cardId: 'card-1', x: Number.NaN, y: Number.POSITIVE_INFINITY, width: -50, height: 0, zIndex: 1.5, rotation: 90 }],
    ['surface is explicitly undefined', { surface: undefined, assetId: 'legacy-1', cardId: 'card-1', x: Number.NaN, y: Number.NaN, width: Number.NaN, height: Number.NaN, zIndex: Number.NaN, rotation: Number.NaN }],
    ['surface is magazine', { surface: 'magazine', assetId: '', cardId: 'card-1', x: -999, y: Number.POSITIVE_INFINITY, width: 0, height: -1, zIndex: 1000001.5, rotation: -720 }],
  ] as Array<[string, unknown]>)('returns null without validating legacy geometry when %s', (_name, input) => {
    expect(boardAssetRect(input as AssetInput)).toBeNull();
  });

  it.each([
    ['unknown surface', boardAsset({ surface: 'canvas' })],
    ['empty surface', boardAsset({ surface: '' })],
    ['surface with different casing', boardAsset({ surface: 'BOARD' })],
    ['surface with trailing whitespace', boardAsset({ surface: 'board ' })],
    ['null surface when supplied', boardAsset({ surface: null })],
    ['numeric surface', boardAsset({ surface: 42 })],
    ['missing asset ID', { surface: 'board', x: 0, y: 0, width: 0.5, height: 0.5, zIndex: 0, rotation: 0 }],
    ['empty asset ID', boardAsset({ assetId: '' })],
    ['null asset ID', boardAsset({ assetId: null })],
    ['linked card ID', boardAsset({ cardId: 'card-1' })],
    ['empty linked card ID still counts as supplied', boardAsset({ cardId: '' })],
    ['null linked card ID when supplied', boardAsset({ cardId: null })],
    ['positive rotation', boardAsset({ rotation: 90 })],
    ['tiny nonzero rotation', boardAsset({ rotation: 0.000001 })],
    ['negative rotation', boardAsset({ rotation: -45 })],
    ['NaN rotation', boardAsset({ rotation: Number.NaN })],
    ['null rotation', boardAsset({ rotation: null })],
    ['negative normalized x', boardAsset({ x: -0.125 })],
    ['negative normalized y', boardAsset({ y: -0.125 })],
    ['NaN normalized x', boardAsset({ x: Number.NaN })],
    ['infinite normalized height', boardAsset({ height: Number.POSITIVE_INFINITY })],
    ['null normalized width', boardAsset({ width: null })],
    ['zero width below the world minimum', boardAsset({ width: 0 })],
    ['width below 100 world units', boardAsset({ width: 0.0099 })],
    ['height below 100 world units', boardAsset({ height: 0.0099 })],
    ['width above 10000 world units', boardAsset({ x: 0, width: 1.0001 })],
    ['height above 10000 world units', boardAsset({ y: 0, height: 1.125 })],
    ['fractional zIndex stack', boardAsset({ zIndex: 2.5 })],
    ['NaN zIndex stack', boardAsset({ zIndex: Number.NaN })],
    ['infinite zIndex stack', boardAsset({ zIndex: Number.POSITIVE_INFINITY })],
    ['null zIndex stack', boardAsset({ zIndex: null })],
    ['zIndex stack above the limit', boardAsset({ zIndex: 1000001 })],
    ['zIndex stack below the limit', boardAsset({ zIndex: -1000001 })],
    ['right-edge overflow', boardAsset({ x: 0.875, width: 0.25 })],
    ['bottom-edge overflow', boardAsset({ y: 0.875, height: 0.25 })],
    ['an epsilon overflow is not widened into a fit', boardAsset({ x: 0.875, y: 0, width: 0.1250000001, height: 0.25 })],
    ['position at the far edge with a positive width', boardAsset({ x: 1, width: 0.01 })],
  ] as Array<[string, unknown]>)('rejects %s with RangeError', (_name, input) => {
    expect(() => boardAssetRect(input as AssetInput)).toThrow(RangeError);
  });

  it('does not mutate a frozen board asset input', () => {
    const input = Object.freeze(boardAsset({ x: 0.25, y: 0.125 }));
    expect(boardAssetRect(input)).toEqual({ x: 2500, y: 1250, width: 5000, height: 2500, stack: 7 });
    expect(input).toEqual({ surface: 'board', assetId: 'asset-1', x: 0.25, y: 0.125, width: 0.5, height: 0.25, zIndex: 7, rotation: 0 });
  });
});

describe('compareBoardObjects', () => {
  it('returns zero for the same kind, ID, and stack even at different positions', () => {
    expect(compareBoardObjects(placed('card', 'same', 5, 0, 0), placed('card', 'same', 5, 9000, 9000))).toBe(0);
    expect(compareBoardObjects(placed('asset', 'same', -5, 9000, 0), placed('asset', 'same', -5, 0, 9000))).toBe(0);
  });

  it('orders primarily by stack, before kind or ID', () => {
    expect(compareBoardObjects(placed('asset', 'zzzz', -1000000), placed('card', 'aaaa', 1000000))).toBeLessThan(0);
    expect(compareBoardObjects(placed('card', 'aaaa', 1000000), placed('asset', 'zzzz', -1000000))).toBeGreaterThan(0);
    expect(compareBoardObjects(placed('card', 'aaaa', -1), placed('asset', 'zzzz', 0))).toBeLessThan(0);
  });

  it('separates a card and an asset that collide on the same ID', () => {
    expect(compareBoardObjects(placed('asset', 'shared-id', 0), placed('card', 'shared-id', 0))).toBeLessThan(0);
    expect(compareBoardObjects(placed('card', 'shared-id', 0), placed('asset', 'shared-id', 0))).toBeGreaterThan(0);
  });

  it('compares kind before ID as separate fields', () => {
    expect(compareBoardObjects(placed('asset', 'zzzz', 0), placed('card', 'aaaa', 0))).toBeLessThan(0);
    expect(compareBoardObjects(placed('card', 'aaaa', 0), placed('asset', 'zzzz', 0))).toBeGreaterThan(0);
  });

  it.each([
    ['uppercase B before lowercase a by code unit', placed('card', 'B', 0), placed('card', 'a', 0)],
    ['numeric text compares lexicographically, not numerically', placed('asset', '10', 0), placed('asset', '2', 0)],
    ['z before a non-ASCII letter by code unit rather than locale order', placed('card', 'z', 0), placed('card', '\u00e4', 0)],
    ['shorter prefix ID first', placed('asset', 'asset', 0), placed('asset', 'asset-2', 0)],
  ] as Array<[string, PlacedObject, PlacedObject]>)('%s', (_name, a, b) => {
    expect(compareBoardObjects(a, b)).toBeLessThan(0);
    expect(compareBoardObjects(b, a)).toBeGreaterThan(0);
  });

  it('does not impose an ID format beyond a nonempty string', () => {
    expect(compareBoardObjects(placed('card', ' ', 0), placed('card', ' ', 0))).toBe(0);
    expect(compareBoardObjects(placed('asset', 'id/with symbols 🚀', 0), placed('asset', 'id/with symbols 🚀', 0))).toBe(0);
  });

  it.each([
    ['interleaved stacks and kinds', [placed('card', 'card-low', -10, 9000, 0), placed('asset', 'asset-high', 20, 0, 9000), placed('asset', 'asset-low', -10, 100, 100), placed('card', 'card-mid', 0, 500, 500), placed('asset', 'asset-mid', 0, 800, 800)], ['asset:asset-low', 'card:card-low', 'asset:asset-mid', 'card:card-mid', 'asset:asset-high']],
    ['same stack resolves by kind and then ID', [placed('card', 'b', 3), placed('asset', 'z', 3), placed('card', 'a', 3), placed('asset', 'a', 3)], ['asset:a', 'asset:z', 'card:a', 'card:b']],
  ] as Array<[string, PlacedObject[], string[]]>)('sorts %s into an explicit stable order', (_name, input, expected) => {
    expect([...input].sort(compareBoardObjects).map((object) => `${object.kind}:${object.id}`)).toEqual(expected);
  });

  it('is antisymmetric across stack, kind, and ID comparisons', () => {
    const pairs: Array<[PlacedObject, PlacedObject]> = [
      [placed('asset', 'a', -1), placed('card', 'a', 2)],
      [placed('asset', 'same', 0), placed('card', 'same', 0)],
      [placed('card', 'B', 0), placed('card', 'a', 0)],
      [placed('asset', '10', 0), placed('asset', '2', 0)],
    ];
    for (const [a, b] of pairs) {
      expect(Math.sign(compareBoardObjects(a, b))).toBe(-Math.sign(compareBoardObjects(b, a)));
      expect(compareBoardObjects(a, b)).not.toBe(0);
    }
  });

  it('is transitive through stack, kind, and ID ordering', () => {
    const first = placed('asset', 'a', -1, 9000, 9000);
    const second = placed('card', 'a', -1, 0, 0);
    const third = placed('card', 'b', -1, 100, 100);
    const fourth = placed('asset', 'a', 4, 200, 200);
    expect(compareBoardObjects(first, second)).toBeLessThan(0);
    expect(compareBoardObjects(second, third)).toBeLessThan(0);
    expect(compareBoardObjects(third, fourth)).toBeLessThan(0);
    expect(compareBoardObjects(first, third)).toBeLessThan(0);
    expect(compareBoardObjects(first, fourth)).toBeLessThan(0);
    expect(compareBoardObjects(second, fourth)).toBeLessThan(0);
  });

  it('keeps the same sorted identity order when every object moves', () => {
    const before = [placed('card', 'card-b', 2, 0, 0), placed('asset', 'asset-a', 2, 100, 100), placed('card', 'card-a', -1, 200, 200), placed('asset', 'asset-z', -1, 300, 300)];
    const moved = before.map((object) => ({ ...object, x: 10000 - object.x, y: object.x + object.y }));
    const identityOrder = (objects: Placed[]) => [...objects].sort(compareBoardObjects).map((object) => `${object.kind}:${object.id}`);
    type Placed = typeof before[number];
    expect(identityOrder(before)).toEqual(['asset:asset-z', 'card:card-a', 'asset:asset-a', 'card:card-b']);
    expect(identityOrder(moved)).toEqual(['asset:asset-z', 'card:card-a', 'asset:asset-a', 'card:card-b']);
    expect(compareBoardObjects(moved[0], moved[1])).toBe(compareBoardObjects(before[0], before[1]));
  });

  it.each([
    ['first kind is not card or asset', { kind: 'image', id: 'a', stack: -100 }, placed('card', 'z', 100)],
    ['second kind is empty', placed('card', 'a', -100), { kind: '', id: 'z', stack: 100 }],
    ['first ID is empty despite an early stack decision', { kind: 'asset', id: '', stack: -100 }, placed('card', 'a', 100)],
    ['second ID is empty despite an early stack decision', placed('asset', 'a', -100), { kind: 'card', id: '', stack: 100 }],
    ['second ID is null despite an early stack decision', placed('asset', 'a', -100), { kind: 'card', id: null, stack: 100 }],
    ['first stack is fractional', placed('card', 'a', 0.5), placed('card', 'b', 1)],
    ['second stack is fractional despite an early stack decision', placed('card', 'a', -100), placed('card', 'b', 100.5)],
    ['second stack is NaN', placed('card', 'a', -100), placed('card', 'b', Number.NaN)],
    ['second stack is infinite', placed('card', 'a', -100), placed('card', 'b', Number.POSITIVE_INFINITY)],
    ['second stack exceeds the limit despite an early stack decision', placed('card', 'a', -100), placed('card', 'b', 1000001)],
    ['first stack is below the limit', placed('card', 'a', -1000001), placed('card', 'b', 0)],
    ['first stack is null', { kind: 'card', id: 'a', stack: null }, placed('card', 'b', 0)],
    ['second kind is null', placed('card', 'a', -100), { kind: null, id: 'b', stack: 100 }],
  ] as Array<[string, unknown, unknown]>)('validates both objects and rejects %s with RangeError', (_name, a, b) => {
    expect(() => compareBoardObjects(a as BoardObjectInput, b as BoardObjectInput)).toThrow(RangeError);
  });

  it('does not mutate frozen comparator inputs', () => {
    const a = Object.freeze(placed('asset', 'a', 1, 10, 20));
    const b = Object.freeze(placed('card', 'a', 1, 30, 40));
    expect(compareBoardObjects(a, b)).toBeLessThan(0);
    expect(a).toEqual({ kind: 'asset', id: 'a', stack: 1, x: 10, y: 20 });
    expect(b).toEqual({ kind: 'card', id: 'a', stack: 1, x: 30, y: 40 });
  });
});

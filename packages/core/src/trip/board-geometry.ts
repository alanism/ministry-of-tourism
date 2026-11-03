export const BOARD_EXTENT_V1 = 10000;

const CARD_DEFAULT_WIDTH = 1200;
const CARD_DEFAULT_HEIGHT = 900;
const CARD_DEFAULT_STACK = 0;
const CARD_MIN_WIDTH = 400;
const CARD_MIN_HEIGHT = 300;
const CARD_MAX_WIDTH = 5000;
const CARD_MAX_HEIGHT = 5000;
const ASSET_MIN_SIZE = 100;
const ASSET_MAX_SIZE = 10000;
const STACK_MIN = -1000000;
const STACK_MAX = 1000000;

type CardInput = {
  x: number;
  y: number;
  boardWidth?: number;
  boardHeight?: number;
  boardStack?: number;
};

type AssetInput = {
  surface?: string;
  assetId?: string;
  cardId?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
  rotation: number;
};

type BoardObjectInput = {
  kind: 'card' | 'asset';
  id: string;
  stack: number;
};

function fail(message: string): never {
  throw new RangeError(message);
}

function requireRecord(value: unknown, name: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return fail(`${name} must be an object`);
  }
  return value as Record<string, unknown>;
}

function requireFiniteNumber(value: unknown, name: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fail(`${name} must be a finite number`);
  }
  return value;
}

function requireStack(value: unknown, name: string): number {
  const stack = requireFiniteNumber(value, name);
  if (!Number.isInteger(stack) || stack < STACK_MIN || stack > STACK_MAX) {
    return fail(`${name} must be an integer between ${STACK_MIN} and ${STACK_MAX}`);
  }
  return stack;
}

function requireNonEmptyString(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    return fail(`${name} must be a nonempty string`);
  }
  return value;
}

function checkRectFit(x: number, y: number, width: number, height: number): void {
  if (x < 0 || y < 0 || x + width > BOARD_EXTENT_V1 || y + height > BOARD_EXTENT_V1) {
    fail('rectangle must fit within the board');
  }
}

export function boardCardRect(card: CardInput): {
  x: number;
  y: number;
  width: number;
  height: number;
  stack: number;
} {
  const input = requireRecord(card, 'card');
  const x = requireFiniteNumber(input.x, 'x');
  const y = requireFiniteNumber(input.y, 'y');
  const width =
    input.boardWidth === undefined
      ? CARD_DEFAULT_WIDTH
      : requireFiniteNumber(input.boardWidth, 'boardWidth');
  const height =
    input.boardHeight === undefined
      ? CARD_DEFAULT_HEIGHT
      : requireFiniteNumber(input.boardHeight, 'boardHeight');
  const stack =
    input.boardStack === undefined
      ? CARD_DEFAULT_STACK
      : requireStack(input.boardStack, 'boardStack');
  if (width < CARD_MIN_WIDTH || width > CARD_MAX_WIDTH) {
    fail(`boardWidth must be between ${CARD_MIN_WIDTH} and ${CARD_MAX_WIDTH}`);
  }
  if (height < CARD_MIN_HEIGHT || height > CARD_MAX_HEIGHT) {
    fail(`boardHeight must be between ${CARD_MIN_HEIGHT} and ${CARD_MAX_HEIGHT}`);
  }
  checkRectFit(x, y, width, height);
  return { x, y, width, height, stack };
}

export function boardAssetRect(p: AssetInput): {
  x: number;
  y: number;
  width: number;
  height: number;
  stack: number;
} | null {
  const input = requireRecord(p, 'asset');
  if (input.surface === undefined || input.surface === 'magazine') {
    return null;
  }
  if (input.surface !== 'board') {
    fail('surface must be board');
  }
  requireNonEmptyString(input.assetId, 'assetId');
  if (input.cardId !== undefined) {
    fail('board assets must not have a cardId');
  }
  // Validate raw normalized numbers before any multiplication.
  const rawX = requireFiniteNumber(input.x, 'x');
  const rawY = requireFiniteNumber(input.y, 'y');
  const rawWidth = requireFiniteNumber(input.width, 'width');
  const rawHeight = requireFiniteNumber(input.height, 'height');
  const stack = requireStack(input.zIndex, 'zIndex');
  if (typeof input.rotation !== 'number' || input.rotation !== 0) {
    fail('rotation must be exactly 0');
  }
  const x = rawX * BOARD_EXTENT_V1;
  const y = rawY * BOARD_EXTENT_V1;
  const width = rawWidth * BOARD_EXTENT_V1;
  const height = rawHeight * BOARD_EXTENT_V1;
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(width) || !Number.isFinite(height)) {
    fail('asset geometry must be finite');
  }
  if (width < ASSET_MIN_SIZE || width > ASSET_MAX_SIZE) {
    fail(`asset width must be between ${ASSET_MIN_SIZE} and ${ASSET_MAX_SIZE}`);
  }
  if (height < ASSET_MIN_SIZE || height > ASSET_MAX_SIZE) {
    fail(`asset height must be between ${ASSET_MIN_SIZE} and ${ASSET_MAX_SIZE}`);
  }
  checkRectFit(x, y, width, height);
  return { x, y, width, height, stack };
}

function validateBoardObject(value: unknown, name: string): BoardObjectInput {
  const input = requireRecord(value, name);
  if (input.kind !== 'card' && input.kind !== 'asset') {
    fail(`${name}.kind must be card or asset`);
  }
  const id = requireNonEmptyString(input.id, `${name}.id`);
  const stack = requireStack(input.stack, `${name}.stack`);
  return { kind: input.kind, id, stack };
}

function compareCodeUnits(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

export function compareBoardObjects(a: BoardObjectInput, b: BoardObjectInput): number {
  const first = validateBoardObject(a, 'a');
  const second = validateBoardObject(b, 'b');
  if (first.stack !== second.stack) {
    return first.stack < second.stack ? -1 : 1;
  }
  const kindOrder = compareCodeUnits(first.kind, second.kind);
  if (kindOrder !== 0) return kindOrder;
  return compareCodeUnits(first.id, second.id);
}

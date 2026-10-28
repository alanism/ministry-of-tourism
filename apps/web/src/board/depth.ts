// Depth on the board. Each item gets its own slab of depth in a stable order;
// the selected item, yarn and anything being dragged sit above all of them.
// The camera sits above everything, so thousands of items all stay in view.
export const LAYER_STEP = 4;
export const MAX_LAYERS = 4400;

export const Z = {
  selected: LAYER_STEP * MAX_LAYERS + 200,
  yarn: LAYER_STEP * MAX_LAYERS + 600,
  lifted: LAYER_STEP * MAX_LAYERS + 1000,
  camera: LAYER_STEP * MAX_LAYERS + 2000,
  far: (LAYER_STEP * MAX_LAYERS + 2000) * 2,
} as const;

export function itemZ(layer: number, state: { lifted?: boolean; selected?: boolean }): number {
  if (state.lifted) return Z.lifted;
  if (state.selected) return Z.selected;
  return Math.min(layer, MAX_LAYERS) * LAYER_STEP;
}

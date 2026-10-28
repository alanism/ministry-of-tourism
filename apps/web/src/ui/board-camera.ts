import { MAX_ZOOM, MIN_ZOOM, type ViewState } from '../state/ui';

// Equal slider travel means an equal zoom ratio, so the low end stays usable.
export const zoomAt = (position: number) => MIN_ZOOM * (MAX_ZOOM / MIN_ZOOM) ** (Math.max(0, Math.min(100, position)) / 100);
export const zoomPosition = (zoom: number) => 100 * Math.log(zoom / MIN_ZOOM) / Math.log(MAX_ZOOM / MIN_ZOOM);

export function panCamera(view: Pick<ViewState, 'x' | 'y' | 'zoom'>, x: number, y: number, seconds: number) {
  const distance = 480 * seconds / (view.zoom * Math.max(1, Math.hypot(x, y)));
  return { x: view.x + x * distance, y: view.y + y * distance };
}

// The razor lens as a colored acetate over the board, with a way out.
import { getCategory } from '@writers-board/core';
import { useUi } from '../state/ui';
import { columnColor, usePalette } from '../state/palette';

export function LensSheet() {
  const lens = useUi((s) => s.lens);
  const palette = usePalette();
  if (!lens) return null;
  const category = getCategory(lens);
  return (
    <>
      <div className="lens-tint" style={{ background: columnColor(palette, category.id) }} aria-hidden="true" />
      <div className="lens-label" role="status">
        Razor lens: <strong>{category.label}</strong> only. Edit one pattern at a time.
        <button onClick={() => useUi.getState().setLens(null)}>Turn off</button>
      </div>
    </>
  );
}

import { CARD_SIZES, GUIDE_PRESETS, PALETTES, PALETTE_IDS, inkColor as inkColorIn, noteColor, storedInkColor, type BoardView, type GuideView } from '@writers-board/core';
import { useEffect, useRef, useState } from 'react';
import { exportBoard, type ExportKind } from '../export/exports';
import { itemKind } from '../board/bounds';
import { WRITER, boardSession, run } from '../state/board';
import { placeImages } from '../state/images';
import { useUi, type Tool } from '../state/ui';
import { Menu } from './Menu';
import { usePalette } from '../state/palette';
import { useFonts } from '../writing/fonts';
import { PAIRINGS, PAIRING_IDS } from '../writing/pairings';

const TOOLS: { id: Tool; label: string; hint: string }[] = [
  { id: 'select', label: 'Select', hint: 'Move and edit (V)' },
  { id: 'marker', label: 'Marker', hint: 'Draw on the whiteboard (M)' },
  { id: 'eraser', label: 'Eraser', hint: 'Press a marker stroke to erase it (E)' },
  { id: 'yarn', label: 'Yarn', hint: 'Press two items to tie them; press yarn to cut it (Y)' },
];

function centerOfView() {
  const { view } = useUi.getState();
  return { x: Math.round(view.x), y: Math.round(view.y) };
}

/** A new stop goes in the middle of the widest gap along the guide. */
function addStop(guide: GuideView) {
  const ts = [0, ...guide.stops.map((s) => s.t).sort((a, b) => a - b), 1];
  let at = 0.5;
  let widest = -1;
  for (let i = 1; i < ts.length; i++) {
    if (ts[i]! - ts[i - 1]! > widest) {
      widest = ts[i]! - ts[i - 1]!;
      at = (ts[i]! + ts[i - 1]!) / 2;
    }
  }
  run('guide_update', { id: guide.id, stops: [...guide.stops, { id: crypto.randomUUID(), t: Math.round(at * 1000) / 1000, label: '' }] });
}

/** The palette's four colors for notes or ink; the pick is stored as its slot. */
function Swatches({ colors, value, onPick, label }: { colors: readonly string[]; value: string; onPick: (c: string) => void; label: string }) {
  return (
    <span className="swatches" role="radiogroup" aria-label={label}>
      {colors.map((color, i) => (
        <button key={color} role="radio" aria-checked={value.toUpperCase() === color.toUpperCase()} aria-label={`${label} ${i + 1}`} className="swatch" style={{ background: color }} onClick={() => onPick(color)} />
      ))}
    </span>
  );
}

function Selection({ board, id }: { board: BoardView; id: string }) {
  const kind = itemKind(board, id);
  const palette = usePalette();
  if (kind === 'card') {
    const card = board.cards.find((c) => c.id === id)!;
    return (
      <div className="toolbar-group" role="group" aria-label={`${card.name} card`}>
        <button onClick={() => useUi.getState().edit(id)} title="Write (Enter)">Write</button>
        <button onClick={() => useUi.getState().toggleFlip(id)} title="Flip (F)">Flip</button>
        <button onClick={() => run('card_update', { id, orientation: card.orientation === 'portrait' ? 'landscape' : 'portrait' })} title="Portrait / landscape (R)">
          {card.orientation === 'portrait' ? 'Landscape' : 'Portrait'}
        </button>
        <label>
          <span className="visually-hidden">Card size</span>
          <select value={card.size} onChange={(e) => run('card_update', { id, size: e.target.value })}>
            {CARD_SIZES.map((size) => (
              <option key={size} value={size}>{size === '3x3' ? '3×3 sticky' : size.replace('x', '×')}</option>
            ))}
          </select>
        </label>
        <button onClick={() => run('card_delete', { id })} title="Remove (Delete)">Remove</button>
      </div>
    );
  }
  if (kind === 'note') {
    const note = board.notes.find((n) => n.id === id)!;
    return (
      <div className="toolbar-group" role="group" aria-label="Sticky note">
        <button onClick={() => useUi.getState().edit(id)}>Write</button>
        <Swatches colors={palette.notes} value={noteColor(note.color, palette)} label="Note color" onPick={(color) => run('note_update', { id, color })} />
        <button onClick={() => run('note_delete', { id })}>Remove</button>
      </div>
    );
  }
  if (kind === 'image') {
    const image = board.images.find((i) => i.id === id)!;
    return (
      <div className="toolbar-group" role="group" aria-label="Picture">
        <label>
          <span className="visually-hidden">Caption</span>
          <input
            className="caption-input"
            placeholder="Caption"
            defaultValue={image.caption}
            key={image.id}
            onBlur={(e) => e.target.value !== image.caption && run('image_update', { id, caption: e.target.value })}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            }}
          />
        </label>
        <button onClick={() => run('image_update', { id, frame: image.frame === 'polaroid' ? 'print' : 'polaroid' })}>
          {image.frame === 'polaroid' ? 'Plain print' : 'Polaroid'}
        </button>
        {image.frame !== 'sticker' && <button onClick={() => run('image_update', { id, frame: 'sticker' })}>Sticker</button>}
        <button onClick={() => run('image_delete', { id })}>Remove</button>
      </div>
    );
  }
  if (kind === 'guide') {
    const guide = board.guides.find((g) => g.id === id)!;
    return (
      <div className="toolbar-group" role="group" aria-label={`${guide.title} guide`}>
        <button onClick={() => run('guide_update', { id, visible: false })}>Hide</button>
        <button onClick={() => run('guide_update', { id, locked: !guide.locked })}>{guide.locked ? 'Unlock' : 'Lock'}</button>
        {guide.kind === 'path' && !guide.locked && <button onClick={() => addStop(guide)}>Add stop</button>}
        <button onClick={() => run('guide_delete', { id })}>Remove</button>
      </div>
    );
  }
  return null;
}

export function Toolbar({ board }: { board: BoardView }) {
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');
  const selectedId = useUi((s) => s.selectedId);
  const tool = useUi((s) => s.tool);
  const inkColor = useUi((s) => s.inkColor);
  const yarnFrom = useUi((s) => s.yarnFrom);
  const palette = usePalette();
  const pairing = useFonts((st) => st.pairing);
  const fileInput = useRef<HTMLInputElement>(null);
  const bar = useRef<HTMLElement>(null);
  // The side panels start below the toolbar, however many rows it wraps to.
  useEffect(() => {
    const element = bar.current;
    if (!element) return;
    const report = () => document.documentElement.style.setProperty('--toolbar-bottom', `${Math.round(element.getBoundingClientRect().bottom)}px`);
    report();
    const observer = new ResizeObserver(report);
    observer.observe(element);
    const header = document.querySelector('.mode-header');
    if (header) observer.observe(header);
    window.addEventListener('resize', report);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', report);
      document.documentElement.style.removeProperty('--toolbar-bottom');
    };
  }, []);
  const runExport = (kind: ExportKind) => {
    setExporting(true);
    setExportError('');
    exportBoard(board, kind)
      .catch((error) => setExportError(error instanceof Error ? error.message : String(error)))
      .finally(() => setExporting(false));
  };
  const addGuide = (preset: string) => {
    const c = centerOfView();
    const created = run<{ id: string }>('guide_create', { preset, x: c.x - 480, y: c.y });
    if (created) useUi.getState().select(created.id);
  };

  return (
    <header className="toolbar" ref={bar}>
      <h1 className="visually-hidden">Writer’s Board</h1>
      <div className="toolbar-group" role="group" aria-label="History">
        <button onClick={() => boardSession().undo(WRITER.id)} title="Undo (Ctrl+Z)">Undo</button>
        <button onClick={() => boardSession().redo(WRITER.id)} title="Redo (Ctrl+Shift+Z)">Redo</button>
      </div>
      <div className="toolbar-group" role="radiogroup" aria-label="Tool">
        {TOOLS.map((t) => (
          <button key={t.id} role="radio" aria-checked={tool === t.id} aria-pressed={tool === t.id} title={t.hint} onClick={() => useUi.getState().setTool(t.id)}>
            {t.label}
          </button>
        ))}
        {tool === 'marker' && <Swatches colors={palette.inks} value={inkColorIn(inkColor, palette)} label="Ink color" onPick={(c) => useUi.getState().setInkColor(storedInkColor(c))} />}
        {tool === 'yarn' && <span className="hint">{yarnFrom ? 'Now press the other end' : 'Press the first item'}</span>}
      </div>
      <div className="toolbar-group" role="group" aria-label="Add">
        <button
          onClick={() => {
            const c = centerOfView();
            const created = run<{ id: string }>('note_create', { x: c.x - 72, y: c.y - 72, rotation: Math.round((Math.random() * 4 - 2) * 10) / 10 });
            if (created) useUi.getState().edit(created.id);
          }}
        >
          Sticky note
        </button>
        <Menu
          label="Add"
          heading="Add to the board"
          items={[
            { label: 'Picture…', onSelect: () => fileInput.current?.click() },
            { label: 'Artwork…', onSelect: () => useUi.getState().setDialog('artwork') },
            { heading: 'Guides' },
            ...GUIDE_PRESETS.map((p) => ({ label: p.title, onSelect: () => addGuide(p.id) })),
          ]}
        />
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => {
            void placeImages([...(e.target.files ?? [])]);
            e.target.value = '';
          }}
        />
      </div>
      <div className="toolbar-group" role="group" aria-label="Board">
        <Menu
          label={exporting ? 'Exporting…' : 'Board'}
          heading="Board"
          align="right"
          items={[
            { heading: 'Export' },
            { label: 'Markdown (.md)', onSelect: () => runExport('markdown'), disabled: exporting },
            { label: 'PDF: board and manuscript', onSelect: () => runExport('pdf'), disabled: exporting },
            { label: 'Picture of the board (.png)', onSelect: () => runExport('png'), disabled: exporting },
            { label: 'Board file (.json)', onSelect: () => runExport('json'), disabled: exporting },
            { heading: 'Palette' },
            ...PALETTE_IDS.map((id) => ({ label: PALETTES[id].label, hint: PALETTES[id].purpose, checked: board.palette === id, onSelect: () => run('board_set_palette', { palette: id }) })),
            { heading: 'Writing type' },
            ...PAIRING_IDS.map((id) => ({ label: PAIRINGS[id].label, hint: PAIRINGS[id].description, checked: pairing === id, onSelect: () => useFonts.getState().setPairing(id) })),
            { label: 'Your boards…', hint: 'Switch, import, back up, save to a folder', onSelect: () => useUi.getState().setDialog('boards') },
            { heading: 'Set up' },
            { label: 'AI settings', onSelect: () => useUi.getState().setDialog('settings') },
            { label: 'Connect agents', onSelect: () => useUi.getState().setDialog('agents') },
          ]}
        />
        {exportError && <span role="alert" className="toolbar-error">{exportError}</span>}
      </div>
      {selectedId && <Selection board={board} id={selectedId} />}
    </header>
  );
}

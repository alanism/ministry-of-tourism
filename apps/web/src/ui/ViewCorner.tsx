// How the board is shown, kept in the bottom-right corner, out of the way of
// writing: lanes and guides on or off, the razor lens, and back to the start.
import { CATEGORIES, type BoardView, type CategoryId } from '@writers-board/core';
import { useEffect, useRef } from 'react';
import { WRITER, boardSession, run } from '../state/board';
import { homeView, useUi } from '../state/ui';
import { columnColor, usePalette } from '../state/palette';
import { Menu } from './Menu';
import { Switch } from './Switch';
import { BoardControls } from './BoardControls';

export function ViewCorner({ board }: { board: BoardView }) {
  const bar = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = bar.current;
    if (!element) return;
    const corner = element.parentElement;
    const report = () => {
      corner?.style.setProperty('--view-bar-height', `${element.getBoundingClientRect().height}px`);
      if (corner) document.documentElement.style.setProperty('--view-corner-height', `${corner.getBoundingClientRect().height}px`);
    };
    report();
    const observer = new ResizeObserver(report);
    observer.observe(element);
    if (corner) observer.observe(corner);
    return () => {
      observer.disconnect();
      document.documentElement.style.removeProperty('--view-corner-height');
    };
  }, []);
  const showLanes = useUi((s) => s.showLanes);
  const selectedId = useUi((s) => s.selectedId);
  const selectedCard = board.cards.find((card) => card.id === selectedId);
  const lens = useUi((s) => s.lens);
  const palette = usePalette();
  const hidden = board.guides.filter((g) => !g.visible);
  const anyVisible = board.guides.some((g) => g.visible);

  const lastDiscard = useUi((s) => s.lastDiscard);
  // The "thrown away" note stays a few seconds, long enough to change your mind.
  useEffect(() => {
    if (!lastDiscard) return;
    const timer = setTimeout(() => useUi.getState().clearDiscard(), 6000);
    return () => clearTimeout(timer);
  }, [lastDiscard]);
  const what = lastDiscard
    ? [lastDiscard.cards && `${lastDiscard.cards === 1 ? 'Card' : `${lastDiscard.cards} cards`}`, lastDiscard.notes && `${lastDiscard.notes === 1 ? 'note' : `${lastDiscard.notes} notes`}`].filter(Boolean).join(' and ')
    : '';

  return (
    <>
      <div className={`discard-note${lastDiscard ? ' is-shown' : ''}`} role="status">
        {lastDiscard && (
          <>
            {`${what.charAt(0).toUpperCase()}${what.slice(1)} thrown away`}
            <button
              onClick={() => {
                boardSession().undo(WRITER.id);
                useUi.getState().clearDiscard();
              }}
            >
              Undo
            </button>
          </>
        )}
      </div>
    <aside className="view-corner" aria-label="View">
      <BoardControls />
      <div className="view-options" ref={bar}>
      <button
        type="button"
        className="trash-bin"
        aria-label="Remove selected card"
        title={selectedCard ? `Remove ${selectedCard.name} (Delete)` : 'Select a card to remove'}
        disabled={!selectedCard}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') event.stopPropagation();
        }}
        onClick={() => {
          if (!selectedCard) return;
          if (run('card_delete', { id: selectedCard.id })) useUi.getState().select(null);
        }}
      >
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
          <path d="M5 7h14l-1.3 12.2a1.5 1.5 0 0 1-1.5 1.3H7.8a1.5 1.5 0 0 1-1.5-1.3L5 7Z" fill="var(--paper)" stroke="var(--ink)" strokeWidth="1.4" strokeLinejoin="round" />
          <path d="M3.5 7h17M9.5 4.5h5" stroke="var(--ink)" strokeWidth="1.4" strokeLinecap="round" />
          <path d="M10 10.5v6.5M14 10.5v6.5" stroke="var(--faint)" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      </button>
      <Switch label="Lanes" checked={showLanes} onChange={(on) => useUi.getState().setShowLanes(on)} />
      {board.guides.length > 0 && <Switch label="Guides" checked={anyVisible} onChange={(on) => run('guides_set_visible', { visible: on })} />}
      {hidden.length > 0 && anyVisible && (
        <Menu label="Hidden" heading="Show a hidden guide" align="right" items={hidden.map((g) => ({ label: g.title, onSelect: () => run('guide_update', { id: g.id, visible: true }) }))} />
      )}
      <div className="segmented" role="group" aria-label="Razor lens: show one column, fade the rest">
        <button aria-pressed={lens === null} onClick={() => useUi.getState().setLens(null)} title="Lens off">
          All
        </button>
        {CATEGORIES.map((c) => (
          <button key={c.id} aria-pressed={lens === c.id} onClick={() => useUi.getState().setLens(c.id as CategoryId)} title={`Show ${c.label}; fade the rest`}>
            <span className="segmented-dot" style={{ background: columnColor(palette, c.id) }} aria-hidden="true" />
            {c.label}
          </button>
        ))}
      </div>
      <button
        className="quiet-button"
        onClick={() => {
          const { view, setView } = useUi.getState();
          setView(homeView(view.width, view.height));
        }}
      >
        Re-center
      </button>
      </div>
    </aside>
    </>
  );
}

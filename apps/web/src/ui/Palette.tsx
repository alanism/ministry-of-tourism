// Add-card palette: the 48 framework cards in their four columns. Cards
// already on the board are marked, so it doubles as a map of what's been used.
import { useState } from 'react';
import { CATEGORIES, cardsInCategory, type BoardView } from '@writers-board/core';
import { run } from '../state/board';
import { useUi } from '../state/ui';
import { columnColor, usePalette } from '../state/palette';

export function Palette({ board }: { board: BoardView }) {
  const [open, setOpen] = useState(() => window.innerWidth > 720);
  const placed = new Set(board.cards.map((c) => c.type));
  const palette = usePalette();

  const add = (type: string) => {
    const { view } = useUi.getState();
    // New cards land near the middle of the screen, slightly scattered.
    const jitter = () => Math.round(Math.random() * 60 - 30);
    const created = run<{ id: string }>('card_create', {
      type,
      x: Math.round(view.x - 120 + jitter()),
      y: Math.round(view.y - 72 + jitter()),
      rotation: Math.round((Math.random() * 3 - 1.5) * 10) / 10,
    });
    if (created) useUi.getState().select(created.id);
  };

  return (
    <aside className={`palette ${open ? 'is-open' : ''}`} aria-label="Add a card">
      <button className="palette-toggle" onClick={() => setOpen(!open)} aria-expanded={open}>
        {open ? '‹ Cards' : 'Cards ›'}
      </button>
      {open && (
        <div className="palette-body">
          {CATEGORIES.map((category) => {
            const cards = cardsInCategory(category.id);
            const used = cards.filter((c) => placed.has(c.id)).length;
            return (
              <section key={category.id} className="palette-group">
                <h2 style={{ ['--band' as string]: columnColor(palette, category.id) }}>
                  {category.label}
                  <span className="palette-count">
                    {used}/{cards.length}
                  </span>
                </h2>
                <ul>
                  {cards.map((card) => (
                    <li key={card.id}>
                      <button className={placed.has(card.id) ? 'is-placed' : undefined} onClick={() => add(card.id)} title={card.question}>
                        {card.name}
                        {placed.has(card.id) && <span className="visually-hidden"> (on the board)</span>}
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </aside>
  );
}

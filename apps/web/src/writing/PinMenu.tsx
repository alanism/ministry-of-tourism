// Pins a selected passage of the draft to a card on the board, or to a new card.
// The link follows the words as the draft is edited.
import { CATEGORIES, cardsInCategory, findQuote, type BoardView } from '@writers-board/core';
import { useState } from 'react';
import { run } from '../state/board';

export interface PinTarget {
  quote: string;
  /** Where the selection starts in the draft. */
  start: number;
  x: number;
  y: number;
}

/** Which occurrence of the quote starts at `start` (1-based). */
function occurrenceAt(text: string, quote: string, start: number): number {
  let n = 0;
  for (let at = text.indexOf(quote); at !== -1 && at <= start; at = text.indexOf(quote, at + 1)) n++;
  return Math.max(1, n);
}

export function PinMenu({ board, target, onDone }: { board: BoardView; target: PinTarget; onDone: (message: string) => void }) {
  const [open, setOpen] = useState(false);

  const pin = (cardId: string, name: string) => {
    const occurrence = occurrenceAt(board.manuscript, target.quote, target.start);
    if (!findQuote(board.manuscript, target.quote, occurrence).ok) return onDone('That passage changed; select it again.');
    const linked = run('link_create', { cardId, target: { kind: 'manuscript' }, quote: target.quote, occurrence });
    onDone(linked ? `Pinned to ${name}` : 'Could not pin that passage');
  };

  const pinToNew = (type: string, name: string) => {
    const created = run<{ id: string }>('card_create', { type });
    if (created) pin(created.id, `a new ${name} card`);
  };

  if (!open) {
    return (
      <button className="pin-button" style={{ left: target.x, top: target.y }} onMouseDown={(e) => e.preventDefault()} onClick={() => setOpen(true)}>
        Pin to card
      </button>
    );
  }

  return (
    <div className="pin-menu" style={{ left: target.x, top: target.y }} role="dialog" aria-label="Pin passage to a card">
      <p className="pin-quote">“{target.quote.length > 80 ? `${target.quote.slice(0, 80)}…` : target.quote}”</p>
      {board.cards.length > 0 && (
        <>
          <h3>Cards on the board</h3>
          <ul>
            {board.cards.map((card) => (
              <li key={card.id}>
                <button onClick={() => pin(card.id, card.name)}>
                  <strong>{card.name}</strong> {card.text ? `· ${card.text.slice(0, 32)}` : ''}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      <label>
        New card
        <select defaultValue="" onChange={(e) => e.target.value && pinToNew(e.target.value, e.target.selectedOptions[0]!.text)}>
          <option value="">Choose a card…</option>
          {CATEGORIES.map((category) => (
            <optgroup key={category.id} label={category.label}>
              {cardsInCategory(category.id).map((card) => (
                <option key={card.id} value={card.id}>
                  {card.name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>
      <button className="pin-cancel" onClick={() => onDone('')}>
        Cancel
      </button>
    </div>
  );
}

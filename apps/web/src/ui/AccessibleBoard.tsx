// A real-element copy of the board for screen readers and for agents that read
// the page or work from screenshots: the WebGL canvas alone is a black box.
import { memo } from 'react';
import type { BoardView, CardView } from '@writers-board/core';
import { run } from '../state/board';
import { useUi } from '../state/ui';

// One row per card, re-rendered only when that card's words or place change.
const CardRow = memo(
  function CardRow({ card }: { card: CardView }) {
    return (
      <li data-card-id={card.id} data-card-type={card.type}>
        <h4>
          {card.name} ({card.category.toLowerCase()})
        </h4>
        <p>{card.question}</p>
        <p>{card.text || 'Empty'}</p>
        <p>
          At {card.x}, {card.y}; {card.orientation} {card.size}
        </p>
        <button onClick={() => useUi.getState().edit(card.id)}>Write on {card.name}</button>
        <button onClick={() => useUi.getState().toggleFlip(card.id)}>Flip {card.name}</button>
        <button onClick={() => run('card_delete', { id: card.id })}>Remove {card.name}</button>
      </li>
    );
  },
  (a, b) =>
    a.card.text === b.card.text && a.card.x === b.card.x && a.card.y === b.card.y && a.card.orientation === b.card.orientation && a.card.size === b.card.size && a.card.id === b.card.id,
);

export function AccessibleBoard({ board }: { board: BoardView }) {
  return (
    <section className="visually-hidden" aria-label="Board contents" data-agent-view="board">
      <h2>{board.title}</h2>
      <p>
        {board.cards.length} cards, {board.notes.length} sticky notes, {board.images.length} pictures, {board.guides.length} guides,{' '}
        {board.connections.length} connections, {board.strokes.length} marker strokes
      </p>
      <h3>Cards</h3>
      <ul>
        {board.cards.map((card) => (
          <CardRow key={card.id} card={card} />
        ))}
      </ul>
      <h3>Sticky notes</h3>
      <ul>
        {board.notes.map((note) => (
          <li key={note.id} data-note-id={note.id}>
            <p>{note.text || 'Empty note'}</p>
            <button onClick={() => useUi.getState().edit(note.id)}>Write on note</button>
            <button onClick={() => run('note_delete', { id: note.id })}>Remove note</button>
          </li>
        ))}
      </ul>
      <h3>Pictures</h3>
      <ul>
        {board.images.map((image) => (
          <li key={image.id} data-image-id={image.id}>
            <p>{image.caption || 'Picture without a caption'}</p>
            <button onClick={() => run('image_delete', { id: image.id })}>Remove picture</button>
          </li>
        ))}
      </ul>
      <h3>Guides</h3>
      <ul>
        {board.guides.map((guide) => (
          <li key={guide.id} data-guide-id={guide.id}>
            <p>
              {guide.title} ({guide.visible ? 'shown' : 'hidden'}
              {guide.locked ? ', locked' : ''}): {guide.stops.map((s) => s.label || 'unnamed stop').join(', ')}
            </p>
            <button onClick={() => run('guide_update', { id: guide.id, visible: !guide.visible })}>
              {guide.visible ? 'Hide' : 'Show'} {guide.title}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

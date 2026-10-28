// ?view=agent: the board as a plain page of real elements, for agents working
// in cloud browsers (often without a GPU). Same commands, run as a page agent.
import { useState } from 'react';
import { CATEGORIES, cardsInCategory, type BoardView } from '@writers-board/core';

const PAGE_AGENT = { id: 'agent:page', name: 'Page agent' };

function call(name: string, input: unknown): string {
  try {
    window.writersBoard?.call(name, input, PAGE_AGENT);
    return '';
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

export function AgentView({ board }: { board: BoardView }) {
  const [message, setMessage] = useState('');
  const [type, setType] = useState('idea.thesis');

  return (
    <main className="agent-view" data-agent-view="board">
      <h1>{board.title}</h1>
      <p>
        Agent view of Writer's Board. Mode: <strong>{board.agentMode}</strong>. Coach mode: <strong>{board.draftForMe ? 'off (Draft for me is on)' : 'on'}</strong>.
        Every action below runs the same command an MCP tool would.
      </p>
      {message && <p role="alert">{message}</p>}

      <section aria-labelledby="add-card">
        <h2 id="add-card">Add a card</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setMessage(call('card_create', { type }));
          }}
        >
          <label>
            Card type{' '}
            <select value={type} onChange={(e) => setType(e.target.value)}>
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
          </label>{' '}
          <button type="submit">Add card</button>
        </form>
      </section>

      <section aria-labelledby="cards">
        <h2 id="cards">Cards ({board.cards.length})</h2>
        <table>
          <thead>
            <tr>
              <th>Card</th>
              <th>Column</th>
              <th>Question</th>
              <th>Writer's text</th>
              <th>Note</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {board.cards.map((card) => (
              <tr key={card.id} data-card-id={card.id}>
                <td>{card.name}</td>
                <td>{card.category.toLowerCase()}</td>
                <td>{card.question}</td>
                <td>{card.text || '—'}</td>
                <td>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const value = new FormData(e.currentTarget).get('annotation');
                      setMessage(call('card_annotate', { id: card.id, annotation: String(value ?? '') }));
                    }}
                  >
                    <input name="annotation" defaultValue={card.annotation} aria-label={`Note on ${card.name}`} />
                    <button type="submit">Save note</button>
                  </form>
                </td>
                <td>
                  <button onClick={() => setMessage(call('card_delete', { id: card.id }))}>Remove</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section aria-labelledby="notes">
        <h2 id="notes">Sticky notes ({board.notes.length})</h2>
        <ul>
          {board.notes.map((note) => (
            <li key={note.id}>{note.text || '(empty)'}</li>
          ))}
        </ul>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const text = String(new FormData(e.currentTarget).get('text') ?? '');
            setMessage(call('note_create', { x: 60, y: 60, text }));
            e.currentTarget.reset();
          }}
        >
          <input name="text" aria-label="New note" placeholder="New sticky note" /> <button type="submit">Add note</button>
        </form>
      </section>

      <section aria-labelledby="guides">
        <h2 id="guides">Guides ({board.guides.length})</h2>
        <ul>
          {board.guides.map((guide) => (
            <li key={guide.id}>
              {guide.title} ({guide.visible ? 'shown' : 'hidden'}): {guide.stops.map((s) => s.label || 'unnamed').join(' → ')}
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="draft">
        <h2 id="draft">Draft</h2>
        <pre className="agent-draft-text">{board.manuscript || '(empty)'}</pre>
      </section>
    </main>
  );
}

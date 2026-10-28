// Create a guest copy (predicted build 02). The checkboxes decide what is copied.
import { useState } from 'react';
import { readAllCards, readTripMeta, tripParts, type TripCard, type TripSession } from '@writers-board/core';
import { Icon, Thumb } from './ui';
import { coverAssetId, useAssetUrl } from './trip-assets';
import { cityLabel } from './sample';

function CardThumb({ session, card }: { session: TripSession; card: TripCard }) {
  return <Thumb url={useAssetUrl(session, coverAssetId(card))} fallback="doc" />;
}

export function GuestCopyPanel({ session, onCreate, onClose }: { session: TripSession; onCreate: (title: string, cardIds: Set<string>) => void; onClose: () => void }) {
  const meta = readTripMeta(session.doc);
  const cards = readAllCards(tripParts(session.doc)).filter((c) => c.kind !== 'brief');
  const guide = cards.filter((c) => c.scope === 'guide');
  const others = cards.filter((c) => c.scope !== 'guide');
  const [title, setTitle] = useState(`${cityLabel(meta.city)} · guest copy`);
  const [chosen, setChosen] = useState(() => new Set(guide.map((c) => c.id)));
  return (
    <aside className="m-panel mot-sheet" aria-label="Create a guest copy">
      <div className="mot-sheet-head">
        <h2>Create a guest copy</h2>
        <button type="button" className="m-icon-btn" aria-label="Close" onClick={onClose}><Icon name="close" /></button>
      </div>
      <div className="mot-sheet-scroll">
      <p className="lede">Make a copy of selected guide cards for your guest.</p>
      <label htmlFor="mot-guest-title" style={{ display: 'block', fontWeight: 600, margin: '22px 0 8px' }}>Trip title</label>
      <input id="mot-guest-title" className="m-field" value={title} onChange={(e) => setTitle(e.target.value)} />
      <p className="m-muted t-1" style={{ marginTop: 8 }}>Copy guide cards. Add this guest's stay details next.</p>
      <p style={{ fontWeight: 600, marginTop: 22 }}>Include cards</p>
      <div className="mot-include">
        {guide.length === 0 && <p className="m-muted" style={{ padding: '10px 0' }}>No guide cards yet. Mark a card as Guide when you edit it.</p>}
        {guide.map((c) => (
          <label key={c.id}>
            <input type="checkbox" className="mot-check" checked={chosen.has(c.id)} onChange={(e) => { const n = new Set(chosen); if (e.target.checked) n.add(c.id); else n.delete(c.id); setChosen(n); }} />
            <span className="t">{c.title}</span>
            <CardThumb session={session} card={c} />
          </label>
        ))}
      </div>
      {others.length > 0 && (
        <>
          <p style={{ fontWeight: 600, marginTop: 22, color: 'var(--m-ink-2)' }}>Not included</p>
          <div className="mot-include">
            {others.map((c) => (
              <div key={c.id} className="row">
                <span className="mot-minus" aria-hidden="true" />
                <span className="t">{c.title}<small>{c.scope === 'private' ? 'Private' : 'Stay only'}</small></span>
                <CardThumb session={session} card={c} />
              </div>
            ))}
          </div>
        </>
      )}
      </div>
      <div className="mot-sheet-foot">
        <button type="button" className="m-btn primary block" disabled={chosen.size === 0 || !title.trim()} onClick={() => onCreate(title.trim(), chosen)}>Create guest copy</button>
        <p className="note">Your master guide stays unchanged.</p>
      </div>
    </aside>
  );
}

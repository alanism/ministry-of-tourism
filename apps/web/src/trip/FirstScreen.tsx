// First screens (MOT-53): one obvious action per audience. Copy fixed from the owner's memo.
import type { BoardKind } from '@writers-board/core';
import { Logo } from './ui';
import type { BoardEntry } from './trip-store';

export function FirstScreen({ onStart, boards, onOpen, notice }: { onStart: (kind: BoardKind) => void; boards: BoardEntry[]; onOpen: (id: string) => void; notice?: string }) {
  return (
    <main className="mot">
      <div className="mot-first">
        <Logo large />
        {notice && <p role="alert" className="m-panel" style={{ marginTop: 20, padding: '14px 18px', borderColor: 'var(--m-red)' }}>{notice}</p>}
        <div className="mot-first-grid">
          <section className="mot-first-copy" aria-label="Traveler">
            <h1 className="mot-first-hero">You're the<br />Minister now.</h1>
            <p className="mot-first-intro">Your host's local knowledge. Your kind of trip.</p>
            <p>Plan the days. Keep the moments. Start with a host guide, or make the trip your own.</p>
            <button type="button" className="m-btn primary" onClick={() => onStart('traveler')}>Make this my trip</button>
            <p className="mot-first-promise">Your board. Your decisions. A trip worth keeping.</p>
          </section>
          <figure className="mot-first-proof mot-first-demo">
            <video controls playsInline preload="none" poster="/assets/concept-trailer-poster.webp" aria-label="Product demo and how it works video">
              <source src="/assets/mot-product-and-technical-demo-20261030.mp4" type="video/mp4" />
              <p>Your browser does not support embedded video. <a href="/assets/mot-product-and-technical-demo-20261030.mp4">Watch the product demo</a></p>
            </video>
            <figcaption>Product demo + how it works · 2:30</figcaption>
          </figure>
        </div>
        <div className="mot-first-paths">
          <section aria-label="Host">
            <h2>A better welcome.</h2><p>Write your local knowledge once. Give each guest their own copy.</p>
            <button type="button" className="m-btn" onClick={() => onStart('host_guide')}>Create a guest copy</button>
          </section>
          <section aria-label="Tour guide">
            <h2>Good knowledge travels.</h2><p>Build one tour board and share it with every group.</p>
            <button type="button" className="m-btn" onClick={() => onStart('traveler')}>Create a tour board</button>
          </section>
        </div>
        {boards.length > 0 && (
          <section className="m-panel" style={{ marginTop: 14, padding: '18px 22px' }} aria-label="Boards on this device">
            <p className="m-eyebrow">Boards on this device</p>
            <div className="mot-boards">
              {boards.map((b) => (
                <button key={b.id} type="button" className="mot-board-row" onClick={() => onOpen(b.id)}>
                  <span className="dot" /><span><strong>{b.title}</strong><small>{b.kind === 'host_guide' ? 'Host guide' : b.kind === 'guest' ? 'Guest copy' : 'Trip'}</small></span>
                </button>
              ))}
            </div>
          </section>
        )}
        <p className="m-muted" role="status" style={{ marginTop: 18 }}>Muse is not connected yet. The board, Today, keepsakes and export all work without it.</p>
      </div>
    </main>
  );
}

// First screens (MOT-53): one obvious action per audience. Copy fixed from the owner's memo.
import type { BoardKind } from '@mot/core';
import { Logo } from './ui';
import type { BoardEntry } from './trip-store';

const museSetupPrompt = 'Create a personal Custom Connector named Ministry of Tourism using https://ministryoftourism.web.app/connectors/muse/openapi.json. Use no authentication. List the available cities, then retrieve Bangkok articles, places, artwork and stickers. Show one result of each type with its source and credit. Confirm whether you saved a reusable Custom Connector. If unsupported, explain the exact missing capability. This API cannot access my private trip boards.';

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
              <source src="/assets/mot-final-3segments-2m40-20261104.mp4" type="video/mp4" />
              <p>Your browser does not support embedded video. <a href="/assets/mot-final-3segments-2m40-20261104.mp4">Watch the product demo</a></p>
            </video>
            <figcaption>Product demo + how it works · 2:40</figcaption>
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
        <details className="m-panel" style={{ marginTop: 24, padding: '12px 20px' }}>
          <summary style={{ cursor: 'pointer', minHeight: 44, padding: '10px 0', fontWeight: 600 }}>Connect Muse to MoT</summary>
          <p>Give Muse access to MoT's public FCC collection. No login or API key is needed; your saved boards stay on your device.</p>
          <p style={{ marginTop: 12 }}>Open your Muse conversation and paste:</p>
          <textarea className="m-field" aria-label="Muse Custom Connector setup prompt" readOnly value={museSetupPrompt} rows={8} style={{ width: '100%', marginTop: 12, resize: 'vertical' }} />
          <p style={{ display: 'flex', flexWrap: 'wrap', gap: 20 }}><a className="m-link" style={{ padding: '10px 0' }} href="/connectors/muse/">Setup guide</a><a className="m-link" style={{ padding: '10px 0' }} href="/connectors/muse/openapi.json">API specification</a></p>
          <p className="m-muted">For Muse visiting this page: read the API specification and use the user's Custom Connector flow if supported. This page does not register a connector automatically; Muse may ask for your permission. Confirm success with actual API results.</p>
        </details>
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

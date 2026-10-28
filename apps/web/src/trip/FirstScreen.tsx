// First screens (MOT-53): one obvious action per audience. Copy fixed from the owner's memo.
import type { BoardKind } from '@writers-board/core';
import { useState } from 'react';
import { Logo } from './ui';
import type { BoardEntry } from './trip-store';
import { samplePhotoUrl } from './sample-media';

export function FirstScreen({ onStart, boards, onOpen, notice }: { onStart: (kind: BoardKind) => void; boards: BoardEntry[]; onOpen: (id: string) => void; notice?: string }) {
  const [photoFailed, setPhotoFailed] = useState(false);
  const photo = !photoFailed && samplePhotoUrl('river');
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
          <figure className="mot-first-proof">
            {photo ? <img src={photo} alt="A sample Bangkok keepsake showing boats on the river at sunset" onError={() => setPhotoFailed(true)} /> :
              <div aria-label="Sample trip notes" style={{ aspectRatio: '3 / 2', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 14, padding: 24 }}>
                <p className="m-eyebrow">Bangkok · sample plan</p>
                <p>Walk by the river.</p><p>Save a favorite place.</p><p>Add a photo of your own.</p>
              </div>}
            <figcaption><strong>A trip worth keeping.</strong><span>{photo ? 'Bangkok · Our first evening on the river.' : 'Start with notes. Add your own memories.'}</span></figcaption>
            <p className="mot-proof-caption">{photo ? 'Sample keepsake · concept photo' : 'Sample trip · notes only'}</p>
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

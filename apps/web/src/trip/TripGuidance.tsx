// Below-board guidance (MOT-116): quiet native disclosures rendered from the one guidance source.
// Content is in the page from the first render; nothing is fetched on click.
import { GUIDE_PATH, GUIDE_SECTIONS, GUIDE_TITLE, GUIDE_VERSION, type TripPhase } from '@writers-board/core';

export function TripGuidance({ phase }: { phase: TripPhase }) {
  return (
    <section className="mot-guidance" aria-labelledby="mot-guidance-title">
      <h2 id="mot-guidance-title" className="m-label">{GUIDE_TITLE}</h2>
      <div className="mot-guidance-steps">
        {GUIDE_SECTIONS.map((section) => (
          <details key={section.phase} className="mot-guidance-step">
            <summary><strong>{section.title}</strong>{phase === section.phase && <em className="mot-guidance-now">Now</em>}<span>{section.summary}</span></summary>
            <ul>{section.points.map((point) => <li key={point}>{point}</li>)}</ul>
          </details>
        ))}
      </div>
      <p className="mot-guidance-ai"><a href={GUIDE_PATH}>Guide for your AI</a><span>· version {GUIDE_VERSION} · plain Markdown</span></p>
    </section>
  );
}

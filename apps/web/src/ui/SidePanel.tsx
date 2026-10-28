// Right-hand panel: the coach deck with "What's wrong?", and the sources pasted
// for Reverse Engineer with each card's quote highlighted.
import { useEffect, useRef, useState } from 'react';
import { COACHES, TUTORING_LOOP, type BoardView, type CoachMove, type CoachReview } from '@writers-board/core';
import { coachMove, coachReview, scoreBoard } from '../ai/actions';
import { useUi } from '../state/ui';
import { rangeFor } from '../writing/textDom';
import { AgentTab } from './AgentTab';
import { ChatGptUsage } from './ChatGptUsage';

function Tutor({ board }: { board: BoardView }) {
  const log = [...board.coachLog].reverse();
  return (
    <section className="tutor" aria-label="Tutor view">
      <h3>Say this, not that</h3>
      <table className="phrasing">
        <tbody>
          {TUTORING_LOOP.phrasing.map((p) => (
            <tr key={p.instead}>
              <td className="instead">{p.instead}</td>
              <td className="say">{p.say}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="hint">One session, one move. The child stays the writer; you model once, then hand it back.</p>
      <h3>
        Sessions: {board.coachLog.length} · moves practiced: {new Set(board.coachLog.map((e) => e.move)).size}
      </h3>
      {log.length === 0 ? (
        <p className="hint">Each “What’s wrong?” session is logged here.</p>
      ) : (
        <ol className="session-log" reversed>
          {log.map((e) => (
            <li key={e.id}>
              <strong>{e.move}</strong> on {e.target}
              <br />
              <span className="hint">
                “{e.complaint}” · {new Date(e.at).toLocaleDateString()} · {e.coachIds.map((id) => COACHES.find((c) => c.id === id)?.role ?? id).join(' + ')}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function useAsync<T>() {
  const [state, setState] = useState<{ busy: boolean; error: string; value: T | null }>({ busy: false, error: '', value: null });
  const start = async (fn: () => Promise<T>) => {
    setState({ busy: true, error: '', value: null });
    try {
      setState({ busy: false, error: '', value: await fn() });
    } catch (e) {
      setState({ busy: false, error: e instanceof Error ? e.message : String(e), value: null });
    }
  };
  return [state, start] as const;
}

function WhatsWrong({ board }: { board: BoardView }) {
  const selectedId = useUi((s) => s.selectedId);
  const card = board.cards.find((c) => c.id === selectedId);
  const [complaint, setComplaint] = useState(TUTORING_LOOP.complaints[0]!.complaint);
  const [move, setMove] = useState(TUTORING_LOOP.moves[0]!);
  const [state, start] = useAsync<CoachMove>();
  const route = TUTORING_LOOP.complaints.find((c) => c.complaint === complaint)!;
  const coaches = route.coachIds.map((id) => COACHES.find((c) => c.id === id)!.role).join(' + ');

  return (
    <section className="whats-wrong" aria-label="What's wrong?">
      <h3>What’s wrong?</h3>
      <div className="chips" role="radiogroup" aria-label="The writer says">
        {TUTORING_LOOP.complaints.map((c) => (
          <button key={c.complaint} role="radio" aria-checked={complaint === c.complaint} className="chip" onClick={() => setComplaint(c.complaint)}>
            {c.complaint}
          </button>
        ))}
      </div>
      <p className="coach-route">
        <span className="label">Coach</span> {coaches}
      </p>
      <div className="chips" role="radiogroup" aria-label="One move today">
        {TUTORING_LOOP.moves.map((m) => (
          <button key={m} role="radio" aria-checked={move === m} className="chip" onClick={() => setMove(m)}>
            {m.replace(/^Today we /, '')}
          </button>
        ))}
      </div>
      <button
        className="primary"
        disabled={state.busy}
        onClick={() =>
          start(async () => {
            const result = await coachMove(complaint, move, { cardId: card?.id ?? null });
            if (card) useUi.getState().edit(card.id);
            return result;
          })
        }
      >
        {state.busy ? 'Thinking…' : card ? `Work on the ${card.name} card` : 'Work on the draft'}
      </button>
      {state.error && <p className="dialog-error">{state.error}</p>}
      {state.value && (
        <div className="coach-result">
          <p>{state.value.diagnosis}</p>
          <p>
            <strong>Example</strong> (on a blush note): {state.value.example}
          </p>
          <p>
            <strong>Now you try:</strong> {state.value.tryThis}
          </p>
        </div>
      )}
    </section>
  );
}

function CoachCards({ board }: { board: BoardView }) {
  const selectedId = useUi((s) => s.selectedId);
  const card = board.cards.find((c) => c.id === selectedId);
  const [flipped, setFlipped] = useState<Record<string, boolean>>({});
  const [reviewing, setReviewing] = useState<string | null>(null);
  const [state, start] = useAsync<CoachReview>();
  const [scoring, startScoring] = useAsync<number>();

  return (
    <details className="coach-more">
      <summary>All five coaches</summary>
    <ul className="coach-list">
      {COACHES.map((coach) => {
        const back = flipped[coach.id];
        return (
          <li key={coach.id}>
            <button className={`coach-card ${back ? 'is-back' : ''}`} onClick={() => setFlipped({ ...flipped, [coach.id]: !back })} aria-pressed={back}>
              <span className="coach-role">{coach.role}</span>
              {back ? (
                <ol className="coach-checks">
                  {coach.roleCard.outputFormat.map((check) => (
                    <li key={check.name}>
                      <strong>{check.name}</strong> {check.question}
                    </li>
                  ))}
                </ol>
              ) : (
                <>
                  <span className="coach-question">{coach.question}</span>
                  <span className="coach-dimension">{coach.dimension}</span>
                </>
              )}
            </button>
            {card && (
              <button
                className="coach-review"
                disabled={state.busy}
                onClick={() => {
                  setReviewing(coach.id);
                  void start(() => coachReview(card.id, coach.id));
                }}
              >
                {state.busy && reviewing === coach.id ? 'Reviewing…' : `Review the ${card.name} card`}
              </button>
            )}
            <button
              className="coach-review"
              disabled={scoring.busy}
              onClick={() => {
                setReviewing(coach.id);
                void startScoring(() => scoreBoard(coach.id));
              }}
            >
              {scoring.busy && reviewing === coach.id ? 'Scoring…' : 'Score the board 1–5'}
            </button>
            {reviewing === coach.id && scoring.value !== null && <p className="hint">Stamped {scoring.value} cards. Flip a card to read why.</p>}
            {reviewing === coach.id && scoring.error && <p className="dialog-error">{scoring.error}</p>}
            {reviewing === coach.id && state.error && <p className="dialog-error">{state.error}</p>}
            {reviewing === coach.id && state.value && (
              <ul className="review">
                {state.value.checks.map((check) => (
                  <li key={check.name} className={check.verdict === 'works' ? 'works' : 'needs-work'}>
                    <strong>{check.name}</strong> <em>{check.verdict}</em> {check.note}
                  </li>
                ))}
                <li className="next-move">
                  <strong>Next move:</strong> {state.value.nextMove}
                </li>
              </ul>
            )}
          </li>
        );
      })}
    </ul>
    </details>
  );
}

const HIGHLIGHT_BY_CATEGORY: Record<string, string> = { NOUNS: 'src-nouns', IDEA: 'src-idea', FORM: 'src-form', VOICE: 'src-voice' };

function Sources({ board }: { board: BoardView }) {
  const [sourceId, setSourceId] = useState<string | null>(board.sources[0]?.id ?? null);
  const selectedId = useUi((s) => s.selectedId);
  const textRef = useRef<HTMLDivElement>(null);
  const source = board.sources.find((s) => s.id === sourceId) ?? board.sources[0];
  const text = source?.text;

  useEffect(() => {
    const el = textRef.current;
    if (!el || !source || !('highlights' in CSS)) return;
    const groups: Record<string, Range[]> = {};
    let selectedRange: Range | null = null;
    for (const card of board.cards) {
      for (const link of card.links) {
        if (link.target.kind !== 'source' || link.target.sourceId !== source.id || link.status === 'gone') continue;
        const range = rangeFor(el, link.start, link.end);
        (groups[HIGHLIGHT_BY_CATEGORY[card.category]!] ??= []).push(range);
        if (card.id === selectedId) selectedRange = range;
      }
    }
    for (const name of Object.values(HIGHLIGHT_BY_CATEGORY)) CSS.highlights.set(name, new Highlight(...(groups[name] ?? [])));
    CSS.highlights.set('src-selected', new Highlight(...(selectedRange ? [selectedRange] : [])));
    if (selectedRange) {
      const rect = selectedRange.getBoundingClientRect();
      const box = el.getBoundingClientRect();
      el.scrollTop += rect.top - box.top - box.height / 3;
    }
    return () => {
      for (const name of [...Object.values(HIGHLIGHT_BY_CATEGORY), 'src-selected']) CSS.highlights.delete(name);
    };
  }, [board.cards, source, selectedId, text]);

  if (board.sources.length === 0) return <p className="hint">Pieces you Reverse Engineer appear here, with every quoted passage highlighted.</p>;
  return (
    <section className="sources" aria-label="Sources">
      {board.sources.length > 1 && (
        <select value={source?.id} onChange={(e) => setSourceId(e.target.value)} aria-label="Source">
          {board.sources.map((s) => (
            <option key={s.id} value={s.id}>
              {s.title}
            </option>
          ))}
        </select>
      )}
      <h3>
        {source?.title}
        {source?.author ? <span className="hint"> · {source.author}</span> : null}
      </h3>
      <p className="hint">Select a card on the board to find its passage. Colors follow the four columns.</p>
      <div className="source-text" ref={textRef}>
        {text}
      </div>
    </section>
  );
}

export function SidePanel({ board }: { board: BoardView }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'coaches' | 'sources' | 'agent' | 'tutor'>('coaches');
  return (
    <aside className={`coach-deck ${open ? 'is-open' : ''}`} aria-label="Coaches and sources">
      <button className="coach-toggle" onClick={() => setOpen(!open)} aria-expanded={open}>
        {open ? 'Close ›' : '‹ Coaches & agent'}
      </button>
      {open && (
        <div className="side-body">
          <div className="side-tabs" role="tablist">
            <button role="tab" aria-selected={tab === 'coaches'} onClick={() => setTab('coaches')}>
              Coaches
            </button>
            <button role="tab" aria-selected={tab === 'agent'} onClick={() => setTab('agent')}>
              Agent
            </button>
            <button role="tab" aria-selected={tab === 'tutor'} onClick={() => setTab('tutor')}>
              Tutor
            </button>
            <button role="tab" aria-selected={tab === 'sources'} onClick={() => setTab('sources')}>
              Sources ({board.sources.length})
            </button>
          </div>
          {tab === 'coaches' ? (
            <>
              <div className="side-tools" role="group" aria-label="Writing tools">
                <button onClick={() => useUi.getState().setDialog('reverse')} title="Paste a piece and turn it into quoted cards, or outline your own draft">
                  Reverse Engineer
                </button>
                <button onClick={() => useUi.getState().setDialog('storyboard')} title="Draw frames from a guide or from chosen cards">
                  Storyboard
                </button>
              </div>
              <ChatGptUsage job="coach" />
              <WhatsWrong board={board} />
              <CoachCards board={board} />
            </>
          ) : tab === 'tutor' ? (
            <Tutor board={board} />
          ) : tab === 'agent' ? (
            <AgentTab board={board} />
          ) : (
            <Sources board={board} />
          )}
        </div>
      )}
    </aside>
  );
}

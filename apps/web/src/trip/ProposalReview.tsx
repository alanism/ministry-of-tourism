// Review changes (predicted build 03): calm by default, peek for the details, nothing changes until you apply.
// While Muse is not connected, suggestions come from the labeled test adapter, run as a real job with Stop.
// An undecided suggestion stays on the Board as ghost cards (Satori change 5); this dialog is their detail view.
import { useEffect, useRef, useState } from 'react';
import { JobRunner, applyProposal, describeAgentFailure, fakeReviewSuggestion, undoProposal, type Actor, type ReviewOp, type ReviewSuggestion, type Stage, type TripSession } from '@writers-board/core';
import { Icon } from './ui';
import { useAssetUrl } from './trip-assets';
import { recordOutcome } from './metrics';

/** The test adapter answers after a short pause, so Stop can be tried for real. */
const ADAPTER_DELAY_MS = 1200;

/** A suggestion that is not yet decided: the Board draws its unapplied card creations as ghosts. */
export interface PendingReview { suggestion: ReviewSuggestion; applied: number[] }
export interface Ghost { index: number; stage: Stage; title: string; body: string; assetId?: string; label?:string; citation?:{title:string;url:string}; review?:()=>void }

export function ghostCards(pending: PendingReview | null): Ghost[] {
  if (!pending) return [];
  return pending.suggestion.proposal.ops.flatMap((op, index) => {
    if (op.command !== 'trip_card_create' || pending.applied.includes(index)) return [];
    const input = op.input as { stage?: Stage; title?: string; body?: string; assetIds?: string[] };
    return input.stage ? [{ index, stage: input.stage, title: input.title ?? 'Untitled', body: input.body ?? '', assetId: input.assetIds?.at(-1) }] : [];
  });
}

function OpCard({ session, op, index, suggestion, checked, applied, justApplied, onCheck }: { session: TripSession; op: ReviewOp; index: number; suggestion: ReviewSuggestion; checked: boolean; applied: boolean; justApplied: boolean; onCheck: (v: boolean) => void }) {
  const [expanded, setExpanded] = useState<boolean | null>(null);
  const open = expanded ?? !applied;
  const [peek, setPeek] = useState(false);
  const url = useAssetUrl(session, op.assetId);
  return (
    <article className={`m-card mot-op proposed${justApplied ? ' approved' : ''}`}>
      <div className="mot-op-head">
        <label className="mot-check-target"><input type="checkbox" className="mot-check" aria-label={op.title} checked={applied || checked} disabled={applied} onChange={(e) => onCheck(e.target.checked)} /></label>
        <strong>{op.title}</strong>
        {applied && <span className={`mot-stamp${justApplied ? ' landing' : ''}`}>Approved</span>}
        <button type="button" className="m-icon-btn" aria-label={open ? 'Collapse' : 'Expand'} aria-expanded={open} onClick={() => setExpanded(!open)}><Icon name={open ? 'chevronUp' : 'chevronDown'} /></button>
      </div>
      {open && (
        <>
          <dl><dt>Target:</dt><dd>{op.target}</dd><dt>Source:</dt><dd>{op.source}</dd></dl>
          <p>{op.why}</p>
          {url && <div className="m-card-photo"><img src={url} alt="" /></div>}
          <button type="button" className="m-link" aria-expanded={peek} onClick={() => setPeek(!peek)}>Peek details <Icon name="arrowRight" /></button>
          {peek && (
            <pre>{JSON.stringify({
              by: suggestion.label,
              toolsCalled: suggestion.toolsCalled,
              sources: suggestion.proposal.sources,
              operation: suggestion.proposal.ops[index],
            }, null, 2)}</pre>
          )}
        </>
      )}
    </article>
  );
}

type Phase = { kind: 'asking' } | { kind: 'ready'; suggestion: ReviewSuggestion } | { kind: 'stopped' } | { kind: 'failed'; message: string };

export function ProposalReview({ session, actor, refresh, notify, onClose, pending, focus, onPending }: {
  session: TripSession; actor: Actor; refresh: () => void; notify: (m: string, action?: { label: string; run: () => void }) => void; onClose: () => void;
  /** An undecided suggestion to reopen instead of asking again, and the op to select (a ghost card that was clicked). */
  pending: PendingReview | null; focus?: number; onPending: (p: PendingReview | null) => void;
}) {
  const runner = useRef(new JobRunner());
  const jobId = useRef('');
  const [phase, setPhase] = useState<Phase>(() => pending ? { kind: 'ready', suggestion: pending.suggestion } : { kind: 'asking' });
  const [selected, setSelected] = useState<Set<number>>(() => new Set([focus ?? (pending ? pending.suggestion.ops.findIndex((_, i) => !pending.applied.includes(i)) : 0)]));
  const [applied, setApplied] = useState<Set<number>>(() => new Set(pending?.applied));
  const [justApplied, setJustApplied] = useState<Set<number>>(new Set());
  const [msg, setMsg] = useState('');

  const ask = () => {
    const id = `review-${crypto.randomUUID()}`;
    jobId.current = id;
    setPhase({ kind: 'asking' }); setApplied(new Set()); setJustApplied(new Set()); setSelected(new Set([0])); setMsg('');
    onPending(null);
    void runner.current.start(id, async () => {
      await new Promise((r) => setTimeout(r, ADAPTER_DELAY_MS));
      return fakeReviewSuggestion(session, id);
    }, { onDone: (suggestion) => { if (jobId.current === id) { setPhase({ kind: 'ready', suggestion }); onPending({ suggestion, applied: [] }); } } }).then((job) => {
      if (jobId.current !== id) return;
      if (job.status === 'cancelled') setPhase({ kind: 'stopped' });
      else if (job.status !== 'done') setPhase({ kind: 'failed', message: describeAgentFailure(job).message });
    });
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (!pending) ask(); return () => { runner.current.stop(jobId.current); }; }, []);

  const undoAll = (proposalId: string) => {
    const ok = undoProposal(session, proposalId);
    onPending(null);
    refresh(); notify(ok ? 'Suggested changes undone. Your own edits stay.' : 'Nothing to undo');
  };
  const apply = (suggestion: ReviewSuggestion) => {
    try {
      const r = applyProposal(session, actor, suggestion.proposal, [...selected].sort());
      if (r.appliedOps) recordOutcome('proposal_applied');
      refresh();
      notify(`Applied ${r.appliedOps} ${r.appliedOps === 1 ? 'change' : 'changes'}`, { label: 'Undo', run: () => undoAll(suggestion.proposal.id) });
      const nowApplied = [...applied, ...selected].sort((a, b) => a - b);
      if (r.remainingOps === 0) { onPending(null); onClose(); return; }
      // The rest stay approvable (#8): keep the panel open on what is left, and on the Board as ghosts.
      onPending({ suggestion, applied: nowApplied });
      setApplied(new Set(nowApplied)); setJustApplied(new Set(selected)); setSelected(new Set()); setMsg('');
    } catch (e) { setMsg(e instanceof Error ? e.message : 'Could not apply. Nothing changed.'); }
  };

  const suggestion = phase.kind === 'ready' ? phase.suggestion : null;
  const remaining = suggestion ? suggestion.ops.length - applied.size : 0;
  return (
    <aside className="m-panel mot-sheet" aria-label="Review changes">
      <div className="mot-sheet-head">
        <h2>Review changes</h2>
        <button type="button" className="m-icon-btn" aria-label="Close review" onClick={onClose}><Icon name="close" /></button>
      </div>
      <div className="mot-sheet-scroll">
      <div style={{ marginTop: 10 }}><span className="m-chip muse">Test adapter · Muse not connected</span></div>
      <p className="lede t-1">Based on current board</p>

      {phase.kind === 'asking' && (
        <div role="status" style={{ marginTop: 18, display: 'grid', gap: 12 }}>
          <p><strong>Asking the test adapter…</strong><br /><span className="lede">It reads this board's shared cards. Nothing changes until you apply.</span></p>
          <button type="button" className="m-btn block" onClick={() => { if (runner.current.stop(jobId.current)) setPhase({ kind: 'stopped' }); }}>Stop</button>
        </div>
      )}
      {(phase.kind === 'stopped' || phase.kind === 'failed') && (
        <div role="status" style={{ marginTop: 18, display: 'grid', gap: 12 }}>
          <p>{phase.kind === 'stopped' ? 'Stopped. Nothing changed, and a late answer will not land.' : phase.message}</p>
          <button type="button" className="m-btn block" onClick={ask}>Try again</button>
          <button type="button" className="m-btn ghost block" onClick={onClose}>Keep editing by hand</button>
        </div>
      )}
      {suggestion && (
        <>
          <h3 className="t-3" style={{ marginTop: 16 }}>{applied.size ? `${remaining} of ${suggestion.ops.length} changes left` : `${suggestion.ops.length} suggested changes`}</h3>
          <p className="lede">{applied.size ? 'Applied changes are on your board. The rest wait for you.' : 'Your board stays unchanged until you apply.'}</p>
          <div className="mot-proposals">{suggestion.ops.map((op, i) => (
            <OpCard key={i} index={i} session={session} op={op} suggestion={suggestion} applied={applied.has(i)} justApplied={justApplied.has(i)} checked={selected.has(i)}
              onCheck={(v) => { const n = new Set(selected); if (v) n.add(i); else n.delete(i); setSelected(n); }} />
          ))}</div>
          {msg && <p role="status" className="lede">{msg}</p>}
        </>
      )}
      </div>
      {suggestion && (
          <div className="mot-sheet-foot">
            <button type="button" className="m-btn primary block" disabled={selected.size === 0} onClick={() => apply(suggestion)}>Apply {selected.size} selected</button>
            <button type="button" className="m-btn block" onClick={() => { onPending(null); onClose(); notify(applied.size ? 'Declined the rest.' : 'Declined. Nothing changed.'); }}>Decline remaining</button>
            {applied.size > 0 && <button type="button" className="m-btn block mot-review-undo" onClick={() => { undoAll(suggestion.proposal.id); setApplied(new Set()); onClose(); }}>Undo applied changes</button>}
          </div>
      )}
    </aside>
  );
}

// Board, Today and Map: three views of the same cards, all drawn with one card brick.
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { STAGES, boardProjection, localDateFor, mapPins, readTripMeta, todayProjection, type Actor, type BoardKind, type RevCard, type Scope, type Stage, type TripSession } from '@writers-board/core';
import { Icon, Menu, type MenuEntry } from './ui';
import { attachPhoto, coverAssetId, pickPhoto, useAssetUrl } from './trip-assets';
import { HOST_LANES, PROVENANCE_LABEL, STAGE_NAME, dayLabel, longDayLabel } from './sample';
import { recordOutcome } from './metrics';
import type { Ghost } from './ProposalReview';

export interface ViewProps { session: TripSession; actor: Actor; tick: number; refresh: () => void; notify: (m: string) => void; }

const CARD_TYPE = 'application/x-mot-card';
const SCOPE_LABEL: Record<Scope, string> = { guide: 'Guide', stay: 'Stay only', private: 'Private' };
const scopeChoices = (kind: BoardKind, current: Scope): { scope: Scope; label: string }[] =>
  kind === 'host_guide'
    ? [{ scope: 'guide', label: 'Guide' }, { scope: 'stay', label: 'Stay only' }, { scope: 'private', label: 'Private' }]
    : [...(current === 'guide' ? [{ scope: 'guide' as Scope, label: 'Host guide' }] : []), { scope: 'stay', label: 'Trip' }, { scope: 'private', label: 'Just me' }];

function stageNames(kind: BoardKind): Record<Stage, string> {
  if (kind !== 'host_guide') return STAGE_NAME;
  const names = { ...STAGE_NAME };
  for (const l of HOST_LANES) names[l.stage] = l.name;
  return names;
}

function Photo({ session, assetId }: { session: TripSession; assetId: string | undefined }) {
  const url = useAssetUrl(session, assetId);
  const [ratio, setRatio] = useState(4 / 3);
  if (!assetId) return null;
  return (
    <div className="m-card-photo" style={{ aspectRatio: ratio }}>
      {url && <img src={url} alt="" draggable={false} onLoad={(e) => { const i = e.currentTarget; setRatio(Math.min(1.9, Math.max(0.85, i.naturalWidth / i.naturalHeight))); }} />}
    </div>
  );
}

/** The one card brick: content first, every action behind a click, the ⋮ menu or a drag. */
/** How a card arrived on this render: moved from another lane, or new (an applied suggestion lands stamped). */
type Landing = 'moved' | 'new';

export function TripCardView({ card, session, actor, kind, refresh, notify, autoEdit = false, isNext = false, landing }: { card: RevCard; kind: BoardKind; autoEdit?: boolean; isNext?: boolean; landing?: Landing } & Omit<ViewProps, 'tick'>) {
  const [editing, setEditing] = useState(autoEdit);
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!landing) return;
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    ref.current?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: still ? 'auto' : 'smooth' });
  }, [landing]);
  const [dragging, setDragging] = useState(false);
  const [draft, setDraft] = useState({ title: card.title, body: card.body, day: card.day ?? '', time: card.time ?? '', scope: card.scope });
  const names = stageNames(kind);
  const run = (name: string, input: Record<string, unknown>, message: string) => {
    try { session.execute(actor, name, input); if (name === 'trip_task_set_status' && input.status === 'done') recordOutcome('task_completed'); refresh(); notify(message); }
    catch (e) { notify(e instanceof Error ? e.message : 'That did not work. Nothing changed.'); }
  };
  const edit = () => { setDraft({ title: card.title, body: card.body, day: card.day ?? '', time: card.time ?? '', scope: card.scope }); setEditing(true); };
  const save = () => {
    run('trip_card_update', { id: card.id, title: draft.title.trim() || card.title, body: draft.body, day: draft.day || null, time: draft.time || null, scope: draft.scope }, 'Card updated');
    setEditing(false);
  };
  const addPhoto = () => pickPhoto((file) => {
    void attachPhoto(session, actor, card.id, file).then(() => { refresh(); notify('Photo added'); }, (e: unknown) => notify(e instanceof Error ? e.message : 'Could not add that photo.'));
  });
  const lanes = kind === 'host_guide' ? HOST_LANES.map((l) => l.stage) : [...STAGES];
  const menu: MenuEntry[] = [
    { label: 'Edit', onSelect: edit },
    ...(card.source?.canonicalUrl||card.source?.url?[{label:'Open source',onSelect:()=>{window.open(card.source?.canonicalUrl??card.source?.url,'_blank','noopener,noreferrer');}}]:[]),
    ...(card.kind === 'task' ? [{ label: card.status === 'done' ? 'Mark as open' : 'Mark as done', onSelect: () => run('trip_task_set_status', { id: card.id, status: card.status === 'done' ? 'open' : 'done' }, card.status === 'done' ? 'Reopened' : 'Done') }] : []),
    { label: card.assetIds.length ? 'Replace photo' : 'Add photo', onSelect: addPhoto },
    { heading: 'Move to' },
    ...lanes.filter((s) => s !== card.stage).map((s) => ({ label: names[s], onSelect: () => run('trip_card_move', { id: card.id, stage: s }, `Moved to ${names[s]}`) })),
    'divider',
    { label: 'Delete card', danger: true, onSelect: () => run('trip_card_delete', { id: card.id }, 'Card deleted. Undo brings it back.') },
  ];
  const showStatus = card.kind === 'task' && (card.stage === 'plan' || card.stage === 'prepare');
  const className = ['m-card', editing && 'editing', dragging && 'dragging', card.status === 'done' && 'done', isNext && 'next', landing && 'landed'].filter(Boolean).join(' ');

  if (editing) {
    return (
      <article className={className} aria-label={`Editing ${card.title}`}>
        <div className="m-card-top"><span className="m-eyebrow">{PROVENANCE_LABEL[card.provenance]}</span></div>
        <input className="m-edit-title" aria-label="Title" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} autoFocus={autoEdit} />
        <textarea className="m-edit-body" aria-label="Notes" value={draft.body} autoFocus={!autoEdit} onChange={(e) => setDraft({ ...draft, body: e.target.value })}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) save(); if (e.key === 'Escape') setEditing(false); }} />
        <div className="m-edit-grid">
          <label>Day<input type="date" value={draft.day} onChange={(e) => setDraft({ ...draft, day: e.target.value })} /></label>
          <label>Time<input type="time" value={draft.time} onChange={(e) => setDraft({ ...draft, time: e.target.value })} /></label>
        </div>
        <fieldset className="m-edit-scope">
          <legend>Who can see it</legend>
          <div className="m-seg">
            {scopeChoices(kind, card.scope).map((c) => <button key={c.scope} type="button" aria-pressed={draft.scope === c.scope} onClick={() => setDraft({ ...draft, scope: c.scope })}>{c.label}</button>)}
          </div>
        </fieldset>
        <div className="m-edit-actions">
          <button type="button" className="m-btn primary" onClick={save}>Done</button>
          <button type="button" className="m-btn" onClick={() => setEditing(false)}>Cancel</button>
        </div>
      </article>
    );
  }
  return (
    <article ref={ref} className={className} draggable
      onDragStart={(e) => { e.dataTransfer.setData(CARD_TYPE, card.id); e.dataTransfer.effectAllowed = 'move'; setDragging(true); }}
      onDragEnd={() => setDragging(false)}>
      <div className="m-card-top">
        {kind === 'host_guide'
          ? <span className={`m-chip tag ${card.scope}`}>{SCOPE_LABEL[card.scope]}</span>
          : <span className="m-eyebrow">{PROVENANCE_LABEL[card.provenance]}</span>}
        <Menu label={`Actions for ${card.title || 'card'}`} items={menu} />
      </div>
      {landing === 'new' && card.provenance === 'agent' && <span className="mot-stamp landing on-card" aria-hidden="true">Approved</span>}
      <h3 className="m-card-title"><button type="button" onClick={edit}>{card.title || 'Untitled'}</button></h3>
      <Photo session={session} assetId={coverAssetId(card)} />
      {card.body && <p className="m-card-body">{card.body}</p>}
      {(isNext || showStatus || card.day || (kind !== 'host_guide' && card.scope === 'private')) && (
        <div className="m-chips">
          {isNext && <span className="m-chip tag next">Next up</span>}
          {showStatus && <span className={`m-chip${card.status === 'done' ? ' done' : ''}`}>{card.status === 'done' ? 'Done' : 'Open'}</span>}
          {card.day && <span className="m-chip tag">{dayLabel(card.day)}{card.time ? ` · ${card.time}` : ''}</span>}
          {kind !== 'host_guide' && card.scope === 'private' && <span className="m-chip private">Private</span>}
        </div>
      )}
    </article>
  );
}

/** A suggestion that is not on the board yet: dashed, marked as agent work, one click from its detail. */
function GhostCard({ ghost, session, onReview }: { ghost: Ghost; session: TripSession; onReview?: (index: number) => void }) {
  const url = useAssetUrl(session, ghost.assetId);
  return (
    <article className="m-card ghost" aria-label={`Suggestion, not on your board yet: ${ghost.title}`}>
      <div className="m-card-top"><span className="m-eyebrow"><Icon name="sparkle" /> {ghost.label??'Suggestion · not added'}</span></div>
      <h3 className="m-card-title"><span>{ghost.title}</span></h3>
      {url && <div className="m-card-photo wide"><img src={url} alt="" draggable={false} /></div>}
      {ghost.body && <p className="m-card-body">{ghost.body}</p>}
      {ghost.citation&&<a className="mot-muse-citation" href={ghost.citation.url} target="_blank" rel="noopener noreferrer">{ghost.citation.title}</a>}
      {(ghost.review||onReview) && <button type="button" className="m-btn small mot-ghost-review" onClick={() => ghost.review?ghost.review():onReview?.(ghost.index)}>Review <Icon name="arrowRight" /></button>}
    </article>
  );
}

/** Which cards just changed lane or appeared, so they can settle into place (Satori change 4). */
function useLandings(session: TripSession, cards: RevCard[]): Map<string, Landing> {
  const seen = useRef<{ session: TripSession; stages: Map<string, Stage> } | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const [landed, setLanded] = useState<Map<string, Landing>>(new Map());
  const placement = cards.map((c) => `${c.id}:${c.stage}`).join('|');
  useLayoutEffect(() => {
    const stages = new Map(cards.map((c) => [c.id, c.stage]));
    const before = seen.current?.session === session ? seen.current.stages : null;
    seen.current = { session, stages };
    if (!before) return;
    const now = new Map<string, Landing>();
    for (const [id, stage] of stages) if (before.get(id) !== stage) now.set(id, before.has(id) ? 'moved' : 'new');
    if (!now.size) return;
    setLanded(now);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setLanded(new Map()), 1800);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, placement]);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return landed;
}

/** The earliest open card dated today or later, in the trip's time zone. */
function nextUp(board: Record<Stage, RevCard[]>, timeZone: string|null): RevCard | undefined {
  if(!timeZone)return undefined;
  const today = localDateFor(new Date(), timeZone);
  return Object.values(board).flat()
    .filter((c) => c.kind !== 'brief' && c.status !== 'done' && c.day && c.day >= today)
    .sort((a, b) => a.day!.localeCompare(b.day!) || (a.time ?? '99:99').localeCompare(b.time ?? '99:99') || a.id.localeCompare(b.id))[0];
}

/** The Board's focal point (Satori layer 7): what comes next, at a larger scale, one step from its day. */
function NextUp({ card, session, onOpenDay }: { card: RevCard; session: TripSession; onOpenDay?: () => void }) {
  const url = useAssetUrl(session, coverAssetId(card));
  return (
    <section className="m-panel mot-next" aria-label="Next up">
      <div className="mot-next-when">
        <p className="m-eyebrow mot-next-label">Next up</p>
        <p className="mot-next-day">{dayLabel(card.day!)}</p>
        <p className="mot-next-time">{card.time ?? 'Any time'} · {STAGE_NAME[card.stage]}</p>
      </div>
      <div className="mot-next-what">
        <h2>{card.title || 'Untitled'}</h2>
        {card.body && <p>{card.body}</p>}
      </div>
      {url && <div className="mot-next-photo"><img src={url} alt="" /></div>}
      {onOpenDay && <button type="button" className="m-btn" onClick={onOpenDay}>See the day <Icon name="arrowRight" /></button>}
    </section>
  );
}

export function BoardView({ session, actor, tick, refresh, notify, header, top, onOpenDay, ghosts = [], onReview }: ViewProps & { header?: ReactNode; top?: ReactNode; onOpenDay?: () => void; ghosts?: Ghost[]; onReview?: (index: number) => void }) {
  void tick;
  const meta = readTripMeta(session.doc);
  const kind = meta.kind;
  const board = boardProjection(session.doc);
  const next = kind === 'host_guide' ? undefined : nextUp(board, meta.timeZone);
  const landed = useLandings(session, Object.values(board).flat());
  const [over, setOver] = useState<Stage | null>(null);
  const [fresh, setFresh] = useState<string | null>(null);
  const lanes = kind === 'host_guide'
    ? [...HOST_LANES, ...STAGES.filter((s) => !HOST_LANES.some((l) => l.stage === s) && board[s].length).map((s) => ({ stage: s, name: STAGE_NAME[s] }))]
    : STAGES.map((s) => ({ stage: s, name: STAGE_NAME[s] }));
  const drop = (stage: Stage, id: string) => {
    setOver(null);
    const card = Object.values(board).flat().find((c) => c.id === id);
    if (!card || card.stage === stage) return;
    session.execute(actor, 'trip_card_move', { id, stage }); refresh(); notify(`Moved to ${lanes.find((l) => l.stage === stage)?.name ?? stage}`);
  };
  const addHere = (stage: Stage) => {
    const { id } = session.execute<{ id: string }>(actor, 'trip_card_create', { kind: 'place', title: 'New card', stage, provenance: kind === 'host_guide' ? 'host' : 'traveler' });
    setFresh(id); refresh();
  };
  return (
    <section className="mot-board" aria-label="Board">
      {header}
      {(next || top) && <div className={`mot-top${next ? ' has-next' : ''}`}>{next && <NextUp card={next} session={session} onOpenDay={onOpenDay} />}{top}</div>}
      <div className={`mot-lanes${kind === 'host_guide' ? ' host-lanes' : ''}`}>
        {lanes.map(({ stage, name }) => {
          const cards = board[stage].filter((c) => c.kind !== 'brief');
          const waiting = ghosts.filter((g) => g.stage === stage);
          return (
            <section key={stage} aria-label={name} className={`m-panel mot-lane${over === stage ? ' drop' : ''}`}
              onDragOver={(e) => { if (e.dataTransfer.types.includes(CARD_TYPE)) { e.preventDefault(); setOver(stage); } }}
              onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(null); }}
              onDrop={(e) => { const id = e.dataTransfer.getData(CARD_TYPE); if (id) { e.preventDefault(); drop(stage, id); } }}>
              <header className={`mot-lane-head${kind === 'host_guide' ? ' host' : ''}`}><h2 className="m-label">{name}</h2></header>
              {kind === 'host_guide' && <button type="button" className="mot-add-row" onClick={() => addHere(stage)}><Icon name="plus" /> Add a card</button>}
              <div className="mot-lane-cards">
                {waiting.map((g) => <GhostCard key={`ghost-${g.index}`} ghost={g} session={session} onReview={onReview} />)}
                {cards.map((c) => <TripCardView key={c.id} card={c} kind={kind} autoEdit={c.id === fresh} isNext={c.id === next?.id} landing={landed.get(c.id)} session={session} actor={actor} refresh={refresh} notify={notify} />)}
                {cards.length + waiting.length === 0 && <p className="mot-lane-empty">Drop a card here.</p>}
              </div>
            </section>
          );
        })}
      </div>
    </section>
  );
}

export function TodayView({ session, actor, tick, refresh, notify }: ViewProps) {
  void tick;
  const meta = readTripMeta(session.doc);
  if(!meta.timeZone)return <section className="m-panel mot-day" aria-label="Today"><h2>Timezone unknown</h2><p>Choose the destination timezone before using Today. Your dated cards are unchanged.</p></section>;
  const today = localDateFor(new Date(), meta.timeZone);
  const all = Object.values(boardProjection(session.doc)).flat().filter((c) => c.kind !== 'brief');
  const todays = todayProjection(session.doc).filter((c) => c.kind !== 'brief');
  const next = todays.length ? undefined : all.map((c) => c.day).filter((d): d is string => !!d && d > today).sort()[0];
  const byTime = (a: RevCard, b: RevCard) => (a.time ?? '99:99').localeCompare(b.time ?? '99:99') || a.id.localeCompare(b.id);
  const shown = todays.length ? todays : next ? all.filter((c) => c.day === next).sort(byTime) : [];
  const shownDay = todays.length ? today : next;
  const later = [...new Set(all.map((c) => c.day).filter((d): d is string => !!d && d > today && d !== shownDay))].sort().slice(0, 3);
  const upcoming = later.map((d) => [d, all.filter((c) => c.day === d).sort(byTime)] as const);
  // The grid break for Today (Satori change 6): the day, torn off like a calendar leaf, over the panel's edge.
  return (
    <div className="mot-edge-wrap">
    {shownDay && <span className="mot-edge-tab" aria-hidden="true"><small>{weekdayOf(shownDay)}</small>{Number(shownDay.slice(8))}</span>}
    <section className="m-panel mot-day" aria-label="Today">
      <p className="m-eyebrow">Today · {dayLabel(today)} · {meta.timeZone.replace('_', ' ')} time</p>
      <h2>{shownDay ? longDayLabel(shownDay) : 'Nothing planned yet'}</h2>
      {next && <p className="mot-day-note m-muted">Nothing scheduled today. Here's what's next on your trip.</p>}
      {shown.length > 0 ? (
        <div className="mot-timeline">
          {shown.map((c) => (
            <div key={c.id} className="mot-slot">
              <time>{c.time ?? 'Any time'}</time>
              <TripCardView card={c} kind={meta.kind} session={session} actor={actor} refresh={refresh} notify={notify} />
            </div>
          ))}
        </div>
      ) : (
        <p className="m-muted" style={{ marginTop: 10 }}>Give a card a day from its ⋮ menu (Edit), and it shows up here on that day in the trip's time zone.</p>
      )}
      {upcoming.length > 0 && (
        <>
          <hr className="m-rule" style={{ margin: '26px 0 6px' }} />
          <p className="m-eyebrow">Later on the trip</p>
          {upcoming.map(([day, cards]) => (
            <div key={day} style={{ marginTop: 14 }}>
              <h3 className="t-3">{longDayLabel(day)}</h3>
              <div className="mot-timeline" style={{ marginTop: 10 }}>
                {cards.map((c) => (
                  <div key={c.id} className="mot-slot">
                    <time>{c.time ?? 'Any time'}</time>
                    <TripCardView card={c} kind={meta.kind} session={session} actor={actor} refresh={refresh} notify={notify} />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </>
      )}
    </section>
    </div>
  );
}

const weekdayOf = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' });

export function MapView({ session, tick, onBack }: { session: TripSession; tick: number; onBack: () => void }) {
  void tick;
  const { pins, attribution } = mapPins(session.doc);
  // The grid break for Map: its pin sits over the panel's edge.
  return (
    <div className="mot-edge-wrap">
    <span className="mot-edge-tab pin" aria-hidden="true"><Icon name="pin" /></span>
    <section className="m-panel mot-day" aria-label="Map">
      <p className="m-eyebrow">Map</p>
      {pins.length === 0 ? (
        <div className="mot-empty" style={{ padding: '14px 0 0' }}>
          <h2>No verified places yet</h2>
          <p className="m-muted">A trip package with checked coordinates will bring your places into this view. Keep planning on the board while maps and routes are unavailable.</p>
          <button type="button" className="m-btn" onClick={onBack}>Back to board <Icon name="arrowRight" /></button>
        </div>
      ) : (
        <div className="mot-timeline">
          {pins.map((p) => (
            <div key={p.cardId} className="mot-slot">
              <time><Icon name="pin" /></time>
              <article className="m-card"><h3 className="m-card-title">{p.title}</h3><p className="m-card-body">{p.lat.toFixed(4)}, {p.lng.toFixed(4)} · traced to {p.trace}</p></article>
            </div>
          ))}
        </div>
      )}
      <p className="m-muted t-1" style={{ marginTop: 24 }}>{attribution}</p>
    </section>
    </div>
  );
}

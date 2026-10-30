import {TripGuidance} from './TripGuidance';
import {tripPhase} from '@writers-board/core';
// Trip shell, matched to the predicted builds: header pill nav, brief sidebar, lanes, Muse rail, review and keepsakes.
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { TripSession, createGuestCopy, importTripPackage, readAllCards, readTripMeta, tripParts, type Actor, type BoardKind, type FccCityContent } from '@writers-board/core';
import './trip.css';
import './integration.css';
import { FirstScreen } from './FirstScreen.tsx';
import { BoardView, MapView, TodayView } from './BoardView.tsx';
import { ProposalReview, ghostCards, type PendingReview, type Ghost } from './ProposalReview.tsx';
import { Keepsakes,MemoryChoice } from './Keepsakes.tsx';

import { GuestCopyPanel } from './GuestCopyPanel.tsx';
import { Diamond, FocusSheet, Icon, Logo, Menu, Toast, type MenuEntry } from './ui';
import { STORAGE_ERROR_EVENT, STORAGE_STATUS_EVENT, forgetLastBoard, lastBoardId, listBoards, openTrip, type OpenTrip, type SavedStatus } from './trip-store.ts';
import { hasEphemeralAssets, placeTripArtwork, placeTripUpload, storeImportedAssets } from './trip-assets';
import { BRIEF_TEMPLATE, cityLabel, isSample, parseBrief, tripSubtitle } from './sample';
import { enableMetrics, readMetrics, recordOutcome } from './metrics';
import { DestinationPicker, type DestinationRow } from './DestinationPicker';
import { loadDestinations } from './destination';
import bundledDestinationText from './destination-bundle.json?raw';
import { Composition } from './Composition';
import { MagazineStudio } from './MagazineStudio';
import { installTripApi } from './agentApi';
import { createTripArtifact, currentTripOperation, diagnostics } from './artifacts';
import { ExportScreen } from './ExportScreen';
import type { NewTrip } from './trip-store';
import { FccBrowser,SourceFreshness,citySlug,type FccBrowserState } from './FccBrowser';

import { MusePlan } from './MusePlan';

const ArtworkPicker=lazy(()=>import('../artwork/ArtworkPicker'));
const GroupPreferences=lazy(()=>import('./GroupPreferences').then(module=>({default:module.GroupPreferences})));
const bundledDestinations:unknown=JSON.parse(bundledDestinationText).cities;

const YOU: Actor = { kind: 'human', id: 'traveler-1', name: 'You' };
type Tab = 'board' | 'composition' | 'fcc' | 'today' | 'map' | 'keepsakes' | 'export';
const TABS: { id: Tab; label: string }[] = [{ id: 'board', label: 'Board' },{id:'composition',label:'Composition'},{id:'fcc',label:'Explore FCC'}, { id: 'today', label: 'Today' }, { id: 'map', label: 'Map' }, { id: 'keepsakes', label: 'Keepsakes' }, {id:'export',label:'Export'}];
const KIND_LABEL: Record<BoardKind, string> = { traveler: 'Trip', guest: 'Guest copy', host_guide: 'Host guide' };

function Saved({ status, exportedAt }: { status: SavedStatus; exportedAt: string | null }) {
  return <><p className={`mot-saved${status === 'saved' ? '' : ' unsaved'}`}><Icon name="device" />{status === 'error' ? 'In this tab only · download a ZIP backup' : status === 'saved' ? 'Saved on this device' : 'Saving…'}</p>{exportedAt && <small className="m-muted">Last export: {new Date(exportedAt).toLocaleString()}</small>}</>;
}

function BriefPanel({ session, refresh, notify }: { session: TripSession; refresh: () => void; notify: (m: string) => void }) {
  const card = readAllCards(tripParts(session.doc)).find((c) => c.kind === 'brief');
  const [draft, setDraft] = useState<string | null>(null);
  const brief = parseBrief(card?.body ?? '');
  const save = () => {
    if (draft === null) return;
    if (card) session.execute(YOU, 'trip_card_update', { id: card.id, body: draft });
    else session.execute(YOU, 'trip_card_create', { kind: 'brief', title: 'Trip brief', body: draft, stage: 'plan' });
    setDraft(null); refresh(); notify('Trip brief updated');
  };
  return (
    <section aria-label="Trip brief">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <p className="m-label" style={{ display: 'flex', gap: 8, alignItems: 'center' }}><span className="mot-diamond-sm"><Diamond /></span>Trip brief</p>
        {draft === null && <button type="button" className="m-link t-1" onClick={() => setDraft(card?.body ?? BRIEF_TEMPLATE)}>{card ? 'Edit' : 'Add'}</button>}
      </div>
      {draft !== null ? (
        <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
          <textarea className="m-field" rows={6} aria-label="Trip brief" value={draft} onChange={(e) => setDraft(e.target.value)} />
          <div style={{ display: 'flex', gap: 8 }}><button type="button" className="m-btn primary small" onClick={save}>Save</button><button type="button" className="m-btn small" onClick={() => setDraft(null)}>Cancel</button></div>
        </div>
      ) : card ? (
        <dl className="mot-brief" style={{ margin: 0 }}>
          {brief.base && <><dt>Base</dt><dd>{brief.base}</dd></>}
          {brief.interests.length > 0 && <><dt>Interests</dt><dd><span className="m-chips" style={{ marginTop: 6 }}>{brief.interests.map((i) => <span key={i} className="m-chip">{i}</span>)}</span></dd></>}
          {brief.notes && <><dt>Notes</dt><dd>{brief.notes}</dd></>}
        </dl>
      ) : <p className="m-muted t-2" style={{ marginTop: 8 }}>Where you're staying, what you love, how fast you like to go. Muse reads this first.</p>}
    </section>
  );
}

export function TripApp() {
  const [open, setOpen] = useState<OpenTrip | null>(null);
  const [session, setSession] = useState<TripSession | null>(null);
  const [booting, setBooting] = useState(true);
  const [tab, setTab] = useState<Tab>('board');
  const [keepsakeFormat,setKeepsakeFormat]=useState<'magazine'|'postcard'|'memories'>('memories');
  const [tick, setTick] = useState(0);
  const [toast, setToast] = useState<{ message: string; action?: { label: string; run: () => void } } | null>(null);
  const [lost, setLost] = useState(false);
  const [panel, setPanel] = useState<'review' | 'guest' | 'art' | 'destination' | 'muse' | 'ballot' | null>(null);
  const [creating,setCreating]=useState<BoardKind|null>(null);
  const [destinations,setDestinations]=useState<DestinationRow[]>([]);
  const [destinationIndex,setDestinationIndex]=useState<Awaited<ReturnType<typeof loadDestinations>>>();
  const [registryAttempt,setRegistryAttempt]=useState(0);
  const registryRef=useRef<DestinationRow[]>([]);
  const startingTrip=useRef(false);
  const [cityContent,setCityContent]=useState<FccCityContent>();
  const [fccState,setFccState]=useState<FccBrowserState>();
  const [museAvailable,setMuseAvailable]=useState(false);
  const [museLabel,setMuseLabel]=useState('Muse · check connection');
  const [museGhosts,setMuseGhosts]=useState<Ghost[]>([]);
  const providers=useRef({fcc:false,muse:false});

  const [pending, setPending] = useState<PendingReview | null>(null);
  const [focusOp, setFocusOp] = useState<number | undefined>(undefined);
  const [museOpen, setMuseOpen] = useState(true);
  const [newTitle, setNewTitle] = useState('');
  const [briefOpen, setBriefOpen] = useState(false);
  const [measure, setMeasure] = useState(() => readMetrics() !== null);
  const fileRef = useRef<HTMLInputElement>(null);
  const shellRef = useRef<HTMLElement>(null);
  const toastTimer = useRef<number | undefined>(undefined);
  const refresh = () => setTick((t) => t + 1);
  const notify = (message: string, action?: { label: string; run: () => void }) => {
    setToast({ message, action }); window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), action ? 6000 : 3200);
  };

  const adopt = (trip: OpenTrip) => { setOpen(trip); setSession(new TripSession(trip.doc,{destinations:registryRef.current})); setPanel(null); setPending(null); refresh(); };
  const switchTo = async (id: string) => {
    try { adopt(await openTrip(id)); setTab('board'); }
    catch (e) { notify(e instanceof Error ? e.message : 'Could not open that board.'); }
  };
  const start = async (details:NewTrip) => {
    if(startingTrip.current)return;
    startingTrip.current=true;
    try {
      const trip = await openTrip(crypto.randomUUID(), details);
      recordOutcome('board_created');
      adopt(trip);setCreating(null); setTab('board');
    } catch (e) { notify(e instanceof Error ? e.message : 'Could not start the trip.'); }
    finally { startingTrip.current=false; }
  };
  const newBoard = () => { forgetLastBoard(); setOpen(null); setSession(null); };

  useEffect(()=>{
    delete window.writersBoard;
    const inherited=document.querySelector<HTMLElement>('.agent-notes'),previousDisplay=inherited?.style.display;
    if(inherited)inherited.style.display='none';
    return()=>{if(inherited)inherited.style.display=previousDisplay??'';};
  },[]);
  useEffect(()=>{
    const controller=new AbortController();let alive=true;setDestinationIndex(undefined);
    void loadDestinations({signal:controller.signal,bundled:bundledDestinations,offline:!navigator.onLine}).then(index=>{if(alive){registryRef.current.splice(0,registryRef.current.length,...index.cities);setDestinations(index.cities);setDestinationIndex(index);}});
    return()=>{alive=false;controller.abort();};
  },[registryAttempt]);
  useEffect(()=>{if(!session||!open)return;const cleanup=installTripApi(session,{onChange:refresh,providers:()=>providers.current,whenSaved:async()=>{await open.whenSaved();if(hasEphemeralAssets(session.doc))throw new Error('Image bytes are in this tab only. Download a package before closing.');},onDiagnostic:receipt=>diagnostics.record(receipt),exportState:currentTripOperation,exportArtifact:(format,signal)=>createTripArtifact(session,format,signal,{includePrivate:false})});const updated=()=>refresh();session.doc.on('update',updated);return()=>{cleanup();session.doc.off('update',updated);session.destroy();};},[session,open]);

  useEffect(() => {
    const id = lastBoardId();
    if (!id) { setBooting(false); return; }
    // A board that was here but is gone (browser storage cleared or evicted) is said out loud, not skipped (MOT-15).
    void openTrip(id).then(adopt, () => { forgetLastBoard(); setLost(true); }).finally(() => setBooting(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => () => { open?.destroy(); }, [open]);
  useEffect(() => {
    const onFail = (e: Event) => { refresh(); notify((e as CustomEvent<string>).detail); };
    window.addEventListener(STORAGE_ERROR_EVENT, onFail);
    window.addEventListener(STORAGE_STATUS_EVENT, refresh);
    return () => { window.removeEventListener(STORAGE_ERROR_EVENT, onFail); window.removeEventListener(STORAGE_STATUS_EVENT, refresh); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const title = session ? readTripMeta(session.doc).title : null;
  useEffect(() => { document.title = title ? `${title} · MOT` : 'MOT · Ministry of Tourism'; }, [title]);
  useEffect(() => { shellRef.current?.scrollTo(0, 0);shellRef.current?.querySelector<HTMLElement>('.mot-nav button[aria-current="page"]')?.scrollIntoView({block:'nearest',inline:'nearest'}); }, [tab, open]);

  const destinationProps={registry:destinations,registryStatus:destinationIndex?.status??'loading' as const,registryUpdatedAt:destinationIndex?.retrievedAt,registryError:destinationIndex?.error,onRetryRegistry:registryAttempt<3?()=>setRegistryAttempt(attempt=>attempt+1):undefined};
  if (booting) return <main className="mot" />;
  if (!open || !session) return <><FirstScreen onStart={(kind) => { setLost(false);setCreating(kind); }} boards={listBoards()} onOpen={(id) => void switchTo(id)}
    notice={lost ? 'Your last board is no longer in this browser’s storage. It may have been cleared by the browser or by you. If you exported a ZIP backup, import it to get the board back.' : undefined} />{creating&&<FocusSheet label="Choose destination" onClose={()=>setCreating(null)}><DestinationPicker kind={creating} {...destinationProps} onClose={()=>setCreating(null)} onSave={details=>void start(details)} /></FocusSheet>}</>;
  const meta = readTripMeta(session.doc);
  const contentCity=meta.cityId??citySlug(meta.city),sourceState=fccState?.boardId===meta.boardId&&fccState.cityId===contentCity?fccState:undefined;
  const scopedContent=cityContent?.city.id===contentCity?cityContent:undefined,updatedSources=new Set(sourceState?.updatedKeys??[]);
  providers.current={fcc:!!scopedContent,muse:museAvailable};
  const saved = hasEphemeralAssets(session.doc)?'error':open.status();
  const whenSaved=async()=>{await open.whenSaved();if(hasEphemeralAssets(session.doc))throw new Error('Image bytes are still in this tab. Download a personal ZIP backup.');};
  const sample = isSample(meta.boardId);
  const host = meta.kind === 'host_guide';
  const boards = listBoards();

  const onImport = async (file: File) => {
    try {
      const { doc, assets } = await importTripPackage(new Uint8Array(await file.arrayBuffer()));
      await storeImportedAssets(doc, assets);
      const trip = await openTrip(readTripMeta(doc).boardId, { from: doc });
      doc.destroy();
      adopt(trip); setTab('board'); notify('Imported as a new board');
    } catch (e) { notify(e instanceof Error ? e.message : 'Import failed. Your current board is unchanged.'); }
  };
  const guestCopy = async (copyTitle: string, cardIds: Set<string>) => {
    try {
      const guest = createGuestCopy(session.doc, { title: copyTitle, cardIds });
      const trip = await openTrip(readTripMeta(guest).boardId, { from: guest });
      guest.destroy();
      adopt(trip); notify('Guest copy created. Your master guide stays unchanged.');
    } catch (e) { notify(e instanceof Error ? e.message : 'Could not create the guest copy.'); }
  };
  const addCard = () => {
    if (!newTitle.trim()) return;
    session.execute(YOU, 'trip_card_create', { kind: 'task', title: newTitle.trim(), stage: 'plan' });
    recordOutcome('card_created');
    setNewTitle(''); refresh(); notify('Card added');
  };

  const review = (op?: number) => { setFocusOp(op); setPanel('review'); };
  const undo = () => { const ok = session.undo(YOU.id); refresh(); notify(ok ? 'Undone' : 'Nothing to undo'); };
  const boardItems: MenuEntry[] = [
    { heading: 'Boards on this device' },
    ...boards.map((b) => ({ label: `${b.id === meta.boardId ? '● ' : ''}${b.title} · ${KIND_LABEL[b.kind]}`, onSelect: () => void switchTo(b.id) })),
    'divider',
    { label: 'Start a new board', onSelect: newBoard },
    { label: 'Import ZIP', onSelect: () => fileRef.current?.click() },
    { label: 'Group preferences', onSelect: () => setPanel('ballot') },
    { label: 'Undo', onSelect: undo },
  ];
  const chip = [cityLabel(meta.city), tripSubtitle({ ...meta, kind: 'traveler' })].filter(Boolean).join(' · ');
  const importButton = <button type="button" className="m-btn block" onClick={() => fileRef.current?.click()}>Import ZIP</button>;

  const sidebar = host ? (
    <aside className="m-panel mot-side mot-host-side" aria-label="My boards">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 className="t-3">My boards</h2>
        <button type="button" className="m-icon-btn" aria-label="Start a new board" onClick={newBoard} style={{ border: '1px solid var(--m-line)' }}><Icon name="plus" /></button>
      </div>
      <div className="mot-boards">
        {boards.map((b) => (
          <button key={b.id} type="button" className="mot-board-row" aria-current={b.id === meta.boardId} onClick={() => void switchTo(b.id)}>
            <span className="dot" /><span><strong>{b.title}</strong><small>{KIND_LABEL[b.kind]}</small></span>
          </button>
        ))}
      </div>
      <div className="mot-side-actions">
        <button type="button" className="m-btn ink block" onClick={() => setPanel(panel === 'guest' ? null : 'guest')}>Create a guest copy</button>
        {importButton}
      </div>
    </aside>
  ) : (
    <aside className="m-panel mot-side" aria-label="Trip">
      <h1>{meta.title}</h1>
      <div className="mot-trip-meta"><p className="sub">{tripSubtitle(meta) || cityLabel(meta.city)}</p><Saved status={saved} exportedAt={open.lastExportedAt()} /></div>
      <div className="mot-phone-actions">
        <button type="button" className="m-btn small" aria-expanded={briefOpen} aria-controls="mot-brief-body" onClick={() => setBriefOpen(!briefOpen)}>Trip brief <Icon name={briefOpen ? 'chevronUp' : 'chevronDown'} /></button>
        <button type="button" className="m-btn small" aria-label="Review sample changes" onClick={() => review()}><Icon name="sparkle" />Review samples</button>
      </div>
      <div id="mot-brief-body" className={`mot-brief-body${briefOpen ? ' is-open' : ''}`}><hr className="m-rule" /><BriefPanel key={meta.boardId} session={session} refresh={refresh} notify={notify} /></div>
      <div className="mot-side-actions">
        <form className="mot-add" onSubmit={(e) => { e.preventDefault(); addCard(); }}>
          <input className="m-field" aria-label="New card title" placeholder="New card title" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} />
          <button type="submit" className="m-btn ink block">Add card</button>
        </form>
        {importButton}
      </div>
    </aside>
  );

  const ghostCount = ghostCards(pending).length;
  const rail = museOpen ? (
    <aside className="m-panel mot-rail" aria-label="Muse">
      <div className="mot-rail-head">
        <strong><Icon name="sparkle" /> Muse</strong>
        <button type="button" className="m-icon-btn" aria-label="Collapse Muse" onClick={() => setMuseOpen(false)}><Icon name="chevronDown" /></button>
      </div>
      <p className="mot-rail-note m-muted">{ghostCount ? `${ghostCount} ${ghostCount === 1 ? 'suggestion waits' : 'suggestions wait'} on your board, dashed.` : 'Your board stays in your hands.'}</p>
      <button type="button" className="m-btn small" onClick={() => review()}>Review sample changes</button>
    </aside>
  ) : (
    <aside className="m-panel mot-rail collapsed" aria-label="Muse">
      <button type="button" className="m-icon-btn" aria-label="Open Muse" onClick={() => setMuseOpen(true)}><Icon name="sparkle" /></button>
    </aside>
  );
  const hostHead = host ? (
    <header className="mot-board-head">
      <h1>{meta.title}</h1>
      <span className="m-muted t-2">{tripSubtitle(meta)}</span>
      <Saved status={saved} exportedAt={open.lastExportedAt()} />
      <button type="button" className="m-btn primary mot-phone-guest" onClick={() => setPanel('guest')}>Create a guest copy</button>
    </header>
  ) : undefined;

  return (
    <main className="mot" ref={shellRef}>
      <header className="mot-header">
        <button type="button" className="mot-brand" onClick={() => setTab('board')}><Logo /></button>
        <nav className="mot-nav" aria-label="Trip views">
          {TABS.map((t) => <button key={t.id} type="button" aria-current={tab === t.id ? 'page' : undefined} onClick={() => setTab(t.id)}>{t.label}</button>)}
        </nav>
        <div className="mot-header-end">
          <button type="button" aria-label="Ask Muse" className="m-btn pill small mot-muse-trigger" onClick={()=>setPanel('muse')}>{museLabel}</button>
          <button type="button" className="m-btn pill small" onClick={()=>setPanel('destination')}>Destination</button>
          <Menu label="Add" items={[{label:'FCC art',onSelect:()=>setPanel('art')}]} trigger={{className:'m-btn pill small',content:<>Add <Icon name="plus" /></>}} />
          <Menu label={`Switch board. Current: ${chip}`} items={boardItems} trigger={{ className: 'm-btn pill small trip-chip', content: <><span className="chip-text">{chip}</span><Icon name="chevronDown" /></> }} />
          <button type="button" className="m-btn pill mot-header-undo" onClick={undo}>Undo</button>
          <button type="button" className="m-btn pill mot-export-trigger" aria-label="Open export" onClick={()=>setTab('export')}><Icon name="file" /><span>Export</span></button>
        </div>
      </header>
      <input ref={fileRef} type="file" accept=".zip,application/zip" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void onImport(f); }} />

      {tab === 'export' ? <ExportScreen key={meta.boardId} session={session} tick={tick} notify={notify} onExported={()=>open.markExported()} /> : tab === 'keepsakes' ? (
        <div><nav className="mot-keepsake-formats" aria-label="Keepsake formats"><button type="button" className={`m-btn small${keepsakeFormat==='memories'?' ink':''}`} aria-pressed={keepsakeFormat==='memories'} onClick={()=>setKeepsakeFormat('memories')}>Memories</button><button type="button" className={`m-btn small${keepsakeFormat==='memories'?<MemoryChoice key={meta.boardId} session={session} actor={YOU} tick={tick} saved={saved} notify={notify} refresh={refresh} whenSaved={whenSaved}/>:keepsakeFormat==='magazine'?' ink':''}`} aria-pressed={keepsakeFormat==='magazine'} onClick={()=>setKeepsakeFormat('magazine')}>Magazine</button><button type="button" className={`m-btn small${keepsakeFormat==='postcard'?' ink':''}`} aria-pressed={keepsakeFormat==='postcard'} onClick={()=>setKeepsakeFormat('postcard')}>Photo postcard</button></nav>{keepsakeFormat==='memories'?<MemoryChoice key={meta.boardId} session={session} actor={YOU} tick={tick} saved={saved} notify={notify} refresh={refresh} whenSaved={whenSaved}/>:keepsakeFormat==='magazine'?<MagazineStudio session={session} tick={tick} onExport={()=>setTab('export')} />:<Keepsakes key={meta.boardId} session={session} tick={tick} saved={saved} onExport={() => setTab('export')} onBack={() => setTab('board')} notify={notify} />}</div>

      ) : tab==='composition' ? <Composition session={session} actor={YOU} refresh={refresh} notify={notify} /> : tab==='fcc'?<FccBrowser key={`${meta.boardId}:${contentCity}`} session={session} actor={YOU} refresh={refresh} notify={notify} onContent={setCityContent} onState={setFccState} initialState={sourceState} /> : (
        <div className={`mot-work view-${tab}`}>
          {sidebar}
          <div className="mot-main">
            {tab === 'board' && <BoardView session={session} actor={YOU} tick={tick} refresh={refresh} notify={notify} updatedSources={updatedSources} header={<>{hostHead}<SourceFreshness state={sourceState?{...sourceState,pending:false}:undefined} onOpen={()=>setTab('fcc')}/></>} top={rail} onOpenDay={() => setTab('today')} ghosts={[...ghostCards(pending),...museGhosts]} onReview={review} />}
            {tab === 'today' && <div className="mot-board"><TodayView whenSaved={whenSaved} session={session} actor={YOU} tick={tick} refresh={refresh} notify={notify} updatedSources={updatedSources} /></div>}

            {tab === 'map' && <div className="mot-board"><MapView session={session} tick={tick} onBack={() => setTab('board')} /></div>}
          </div>
        </div>
      )}
      <div className="mot-guidance-wrap"><TripGuidance phase={tripPhase(meta)}/></div>
      {panel==='ballot'&&<FocusSheet label="Group preferences" onClose={()=>setPanel(null)}><Suspense fallback={<p role="status">Opening group preferences…</p>}><GroupPreferences key={meta.boardId} session={session} actor={YOU} tick={tick} refresh={refresh} notify={notify} whenSaved={async()=>{await open.whenSaved();if(hasEphemeralAssets(session.doc))throw new Error('Image bytes are still in this tab. Download a personal ZIP backup.');}} onClose={()=>setPanel(null)} /></Suspense></FocusSheet>}
      {panel === 'review' && <FocusSheet label="Review changes" onClose={() => setPanel(null)}><ProposalReview key={meta.boardId} session={session} actor={YOU} refresh={refresh} notify={notify} onClose={() => setPanel(null)} pending={pending} focus={focusOp} onPending={setPending} /></FocusSheet>}
      {panel === 'guest' && host && <FocusSheet label="Create a guest copy" onClose={() => setPanel(null)}><GuestCopyPanel key={meta.boardId} session={session} onCreate={(t, ids) => void guestCopy(t, ids)} onClose={() => setPanel(null)} /></FocusSheet>}
      {panel==='destination'&&<FocusSheet label="Change destination" onClose={()=>setPanel(null)}><DestinationPicker current={meta} kind={meta.kind} {...destinationProps} preservedCards={readAllCards(session.parts).map(card=>({id:card.id,title:card.title,sourceCity:destinations.find(row=>row.id===card.source?.cityId)?.name??card.source?.cityId}))} onClose={()=>setPanel(null)} onSave={details=>{try{session.execute(YOU,'trip_meta_update',{city:details.city,cityId:details.cityId,countryCode:details.countryCode,timeZone:details.timeZone,dates:details.dates});setPanel(null);refresh();notify('Destination changed. Existing cards keep their sources; refresh FCC content when ready.');}catch(error){notify(error instanceof Error?error.message:'Destination could not be changed.');}}} /></FocusSheet>}
      {panel==='art'&&<Suspense fallback={<p role="status">Opening FCC art…</p>}><ArtworkPicker trip={{destination:meta,destinations}} onClose={()=>setPanel(null)} onUpload={async(file,signal)=>{await placeTripUpload(session,YOU,file,signal);refresh();setTab('composition');notify('Photo added to your trip.',{label:'Undo',run:undo});}} onInsert={async(artwork,signal)=>{await placeTripArtwork(session,YOU,artwork,signal);refresh();setTab('composition');notify('Artwork added to your trip.',{label:'Undo',run:undo});}} /></Suspense>}
      {panel==='muse'&&<MusePlan key={meta.boardId} session={session} actor={YOU} content={scopedContent} onAvailability={setMuseAvailable} onState={setMuseLabel} onGhosts={setMuseGhosts} refresh={refresh} notify={notify} onClose={()=>setPanel(null)} />}

      {toast && panel!=='art' && <Toast message={toast.message} action={toast.action} onClose={() => setToast(null)} />}
      <div className="mot-foot">
        <details className="mot-data-details" onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) e.currentTarget.open = false; }}><summary>On this device</summary><div><label><input type="checkbox" checked={measure} onChange={(e) => { enableMetrics(e.target.checked); setMeasure(e.target.checked); }} /> Count demo actions on this device</label>{measure && <p>{Object.values(readMetrics()?.counts ?? {}).reduce((a, b) => a + b, 0)} actions · no live model cost</p>}</div></details>
        <p>{sample ? 'Sample trip · ' : ''}{museLabel}</p>
      </div>
      <details className="mot-trip-agent-notes"><summary>For trip agents</summary><p>Read <code>window.motTrip.capabilities()</code> for this trip's actual commands, schema, board ID and revision. <a href="/trip-agents.md">Trip agent contract</a></p></details>
    </main>
  );
}

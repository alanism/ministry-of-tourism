import { useEffect, useRef, useState } from 'react';
import { DISCOVERY_CATEGORIES, readAllCards, discoveryName, type Actor, type FccCityContent, type TripSession, type DiscoveryResponse, type DiscoveryCandidate } from '@mot/core';
import { discoveryCard, requestDiscovery } from './discovery-client';
import { FocusSheet } from './ui';
import { SourceLink } from './SourceContent';
import './discover-more.css';

interface Props { content: FccCityContent; session: TripSession; actor: Actor; refresh: () => void; notify: (message: string) => void; }
function DiscoveryPanel({ content, session, actor, refresh, notify, close }: Props & { close: () => void }) {
  const [runtime, setRuntime] = useState<{ available: boolean; reason: string; transport: 'loopback-preview' | 'firebase-attested' }>({ available: false, reason: 'Checking discovery availability…', transport: 'loopback-preview' });
  const [seedIds, setSeedIds] = useState<string[]>([]), [category, setCategory] = useState<typeof DISCOVERY_CATEGORIES[number]>('any');
  const [consent, setConsent] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [result, setResult] = useState<DiscoveryResponse>(), [added, setAdded] = useState<string[]>([]);
  const controller = useRef<AbortController | null>(null);
  const current = useRef({ session, cityId: content.city.id }); current.current = { session, cityId: content.city.id };
  useEffect(() => {
    const abort = new AbortController();
    void fetch('/api/muse/discovery-status', { signal: abort.signal }).then(async response => {
      if (!response.ok) throw Error();
      const value = await response.json();
      const transport = value.transport === 'firebase-attested' ? 'firebase-attested' : value.transport === undefined || value.transport === 'loopback-preview' ? 'loopback-preview' : undefined;
      if (!abort.signal.aborted) setRuntime({ available: value.available === true && !!transport, transport: transport ?? 'loopback-preview', reason: typeof value.reason === 'string' ? value.reason : 'Discovery unavailable.' });
    }).catch(() => { if (!abort.signal.aborted) setRuntime({ available: false, transport: 'loopback-preview', reason: 'Discovery unavailable: this site has no configured discovery server. FCC browsing and your board still work.' }); });
    return () => { abort.abort(); controller.current?.abort(); controller.current = null; };
  }, []);
  const ask = async () => {
    if (controller.current || !runtime.available || !consent || !seedIds.length) return;
    const abort = new AbortController(); controller.current = abort;
    const timeout = setTimeout(() => abort.abort(), 35000);
    setBusy(true); setError(''); setResult(undefined); setAdded([]);
    try {
      const value = await requestDiscovery({ cityId: content.city.id, seedIds, category }, content, abort.signal, fetch, { transport: runtime.transport, contributorConsent: consent });
      if (controller.current === abort && !abort.signal.aborted && current.current.session === session && current.current.cityId === value.cityId) setResult(value);
    } catch (cause) { if (controller.current === abort) setError(abort.signal.aborted ? 'Discovery stopped. Nothing was added.' : cause instanceof Error ? cause.message : 'Discovery unavailable.'); }
    finally { clearTimeout(timeout); if (controller.current === abort) { controller.current = null; setBusy(false); } }
  };
  const add = (candidate: DiscoveryCandidate) => {
    if (!result || result.cityId !== current.current.cityId || current.current.session !== session || added.includes(candidate.name)) return;
    if (readAllCards(session.parts).some(card => card.kind === 'place' && discoveryName(card.title) === discoveryName(candidate.name))) { setError('This place is already on your board.'); return; }
    try {
      const seed = content.places.find(place => place.id === candidate.relatedSeedId);
      if (!seed) throw Error('The FCC seed is no longer available.');
      session.execute(actor, 'trip_card_create', discoveryCard(candidate, result, seed.name));
      setAdded(previous => [...previous, candidate.name]); refresh(); notify('Discovery added to Explore with source excerpts. Current details are not checked.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'The place could not be added.'); }
  };
  return <FocusSheet label="Discover more like this" onClose={close}><section className="m-panel mot-discover">
    <header><div><span className="m-eyebrow">FCC is the starting point</span><h2>Discover more like this</h2></div><button type="button" className="m-btn" onClick={close}>Close discovery</button></header>
    <p>Start with FCC's curated places in {content.city.name}. Muse Spark 1.3 Contributor looks for other venues mentioned alongside them or nearby in public sources. Review the evidence before adding a place.</p>
    <p className="m-muted">Instagram mentions appear only when a readable post or reel source is returned. These suggestions are not verified trends or live opening information.</p>
    {!runtime.available && <p role="status">{runtime.reason}</p>}
    <fieldset disabled={busy}><legend>Choose 1–3 FCC places</legend><div className="mot-discover-seeds">{content.places.map(place => <label key={place.id}><input type="checkbox" checked={seedIds.includes(place.id)} disabled={!seedIds.includes(place.id) && seedIds.length >= 3} onChange={event => { const checked = event.target.checked; setSeedIds(previous => checked ? [...previous, place.id] : previous.filter(id => id !== place.id)); setResult(undefined); }} />{place.name}</label>)}</div>
      <label>Look for <select className="m-field" value={category} onChange={event => { setCategory(event.target.value as typeof category); setResult(undefined); }}>{DISCOVERY_CATEGORIES.map(value => <option key={value} value={value}>{value === 'any' ? 'Any related place' : value}</option>)}</select></label>
    </fieldset>
    <details><summary>What is sent to Meta?</summary><p>Only the public FCC city, selected public venue names and source links, category and existing public venue names for exclusions. Your board, notes, photos, bookings and personal information are not sent in this flow. Meta Contributor uses submitted content to improve its models and prohibits personal, sensitive or confidential information. This separate discovery choice does not change the privacy of your saved board or other Muse features.</p><p><a href="https://dev.meta.ai/docs/pricing-rate-limits" target="_blank" rel="noopener noreferrer">Meta Contributor information</a></p></details>
    {runtime.transport === 'firebase-attested' && <p className="m-muted">This limited free preview uses a server-held key. When you agree and search, MoT creates or reuses an anonymous Firebase identity on this browser and verifies the app request to enforce shared usage limits. It does not upload or connect your saved trip board. Clearing browser storage changes the guest identity; shared preview limits still apply.</p>}
    <label className="mot-discover-consent"><input type="checkbox" checked={consent} disabled={busy} onChange={event => setConsent(event.target.checked)} />I agree to send this public catalogue request to Meta Contributor for discovery and model improvement.</label>
    <div className="mot-discover-actions"><button type="button" className="m-btn primary" disabled={!runtime.available || !consent || !seedIds.length || busy} onClick={() => void ask()}>Find related places</button>{busy && <button type="button" className="m-btn" onClick={() => controller.current?.abort()}>Stop discovery</button>}</div>
    {busy && <p role="status">Searching public sources. Nothing is added automatically…</p>}{error && <p role="alert">{error}</p>}
    {result && <div aria-live="polite"><p>{result.candidates.length ? `${result.candidates.length} suggestions to review` : 'No new places had usable co-mention evidence. Try other FCC seeds.'} · searched {new Date(result.retrievedAt).toLocaleString()}</p>
      {result.candidates.map(candidate => <article className="mot-discover-result" key={candidate.name}><span className="m-eyebrow">Suggestion · not checked</span><h3>{candidate.name}</h3><p>Related to {content.places.find(place => place.id === candidate.relatedSeedId)?.name}</p><p>{candidate.reason}</p>{candidate.evidence.map(evidence => <div key={evidence.url}><span>{evidence.kind === 'instagram-mention' ? 'Instagram mention' : 'Public web source'}</span><blockquote>{evidence.snippet}</blockquote><SourceLink url={evidence.url} label={evidence.title || 'Open source'} /></div>)}<button type="button" className="m-btn" disabled={added.includes(candidate.name)} onClick={() => add(candidate)}>{added.includes(candidate.name) ? 'Added to board' : `Add ${candidate.name} to board`}</button></article>)}
    </div>}
    <p className="m-muted">{runtime.transport === 'firebase-attested' ? 'Preview allowances are shared and may run out. No Meta API key is entered or exposed in this discovery panel.' : "Use your own key by running MoT's local server yourself. This page does not collect or forward a personal API key."}</p>
  </section></FocusSheet>;
}
export function DiscoverMore(props: Props) {
  const [open, setOpen] = useState(false), opener = useRef<HTMLButtonElement>(null);
  return <><button ref={opener} type="button" className="m-btn ink" disabled={!props.content.places.length} onClick={() => setOpen(true)}>Discover more like this</button>{open && <DiscoveryPanel key={`${props.session.boardId}:${props.content.city.id}`} {...props} close={() => { setOpen(false); opener.current?.focus(); }} />}</>;
}

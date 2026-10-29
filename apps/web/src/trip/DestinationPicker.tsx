import { useEffect, useId, useRef, useState } from 'react';
import type { BoardKind, TripMeta } from '@writers-board/core';
import type { NewTrip } from './trip-store';
import { countryChoices, countryName, destinationDetails, foldDestination, searchDestinations, type DestinationRegistryStatus, type DestinationRow } from './destination';
import './destination.css';

export { destinationRows, type DestinationRow } from './destination';
export interface DestinationPickerProps {
  kind?: BoardKind; current?: TripMeta; onSave: (trip: NewTrip) => void; onClose: () => void; registry: DestinationRow[];
  registryStatus?: DestinationRegistryStatus | 'loading'; registryUpdatedAt?: string; registryError?: string; onRetryRegistry?: () => void;
  preservedCards?: readonly { id: string; title: string; sourceCity?: string }[];
}
const LANES = ['Plan', 'Prepare', 'Arrive', 'Explore', 'Remember'];
function Tag({ row, city }: { row?: DestinationRow; city: string }) {
  const [failed, setFailed] = useState(false);
  return <span className="mot-destination-tag" aria-hidden="true">{row?.tagUrl && !failed
    ? <img src={row.tagUrl} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
    : <span className="mot-destination-tag-drawn"><span>{Array.from(city).slice(0, 3).join('').toLocaleUpperCase()}</span></span>}</span>;
}
export function DestinationPicker({ kind = 'traveler', current, onSave, onClose, registry, registryStatus, registryUpdatedAt, registryError, onRetryRegistry, preservedCards }: DestinationPickerProps) {
  const [step, setStep] = useState<'city' | 'country' | 'preview'>('city');
  const [query, setQuery] = useState(''), [countryQuery, setCountryQuery] = useState(''), [active, setActive] = useState(0), [wallLimit, setWallLimit] = useState(24);
  const [selection, setSelection] = useState<{ city: string; countryCode: string; destination?: DestinationRow }>();
  const [error, setError] = useState('');
  const search = useRef<HTMLInputElement>(null), countrySearch = useRef<HTMLInputElement>(null), preview = useRef<HTMLHeadingElement>(null);
  const id = useId(), listId = `destination-results-${id}`;
  const results = searchDestinations(registry, query).slice(0, 8);
  const showResults = !!query.trim(), activeOption = Math.min(active, results.length);
  const status = registryStatus ?? (registry.length ? 'ready' : 'unavailable');
  const countryResults = countryChoices(countryQuery);
  useEffect(() => { if (step === 'city') search.current?.focus(); else if (step === 'country') countrySearch.current?.focus(); else preview.current?.focus(); }, [step]);
  useEffect(()=>{if(step==='city'&&showResults)document.getElementById(`${listId}-${activeOption}`)?.scrollIntoView({block:'nearest'});},[step,showResults,listId,activeOption]);
  const chooseCity = (row: DestinationRow) => { setSelection({ city: row.name, countryCode: row.countryCode, destination: row }); setError(''); setStep('preview'); };
  const chooseTyped = () => { if (!query.trim()) return; setSelection({ city: query.trim(), countryCode: '' }); setCountryQuery(''); setError(''); setStep('country'); };
  const chooseCountry = (code: string) => { if (selection) { setSelection({ ...selection, countryCode: code }); setError(''); setStep('preview'); } };
  const chooseOption = (index: number) => { const match = results[index]; if (match) chooseCity(match.row); else chooseTyped(); };
  const back = () => { setError(''); setStep(step === 'preview' && !selection?.destination ? 'country' : 'city'); };
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (step === 'city') { if (showResults) chooseOption(activeOption); return; }
    if (step === 'country') { const exact = countryResults.find(country => foldDestination(country.name) === foldDestination(countryQuery)); if (exact) chooseCountry(exact.code); return; }
    if (!selection) return;
    try { onSave(destinationDetails({ ...selection, kind, current })); }
    catch { setError('The destination could not be saved. Choose the city and country again.'); }
  };
  return <section className="mot m-panel mot-destination" aria-label={current ? 'Change destination' : 'Choose destination'}>
    <form onSubmit={submit}>
      <header className="mot-destination-heading"><h2>{current ? 'Change destination' : 'Where are you going?'}</h2><button type="button" className="mot-destination-close" onClick={onClose} aria-label="Close destination">×</button></header>
      <div className="mot-destination-body">
        {step === 'city' ? <>
          {current && <p className="mot-destination-muted">Currently {current.city}{current.countryCode ? `, ${countryName(current.countryCode)}` : ''}. Your board title stays “{current.title}”.</p>}
          <label className="mot-destination-search"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><circle cx="10" cy="10" r="6" /><path d="m15 15 5 5" /></svg><span className="mot-destination-sr">Destination city</span>
            <input ref={search} type="search" value={query} maxLength={120} autoComplete="off" placeholder="City, or another name for it" role="combobox" aria-expanded={showResults} aria-controls={showResults ? listId : undefined} aria-activedescendant={showResults ? `${listId}-${activeOption}` : undefined}
              onChange={event => { setQuery(event.target.value); setActive(0); }} onKeyDown={event => {
                if (!showResults) return;
                if (event.key === 'ArrowDown') { event.preventDefault(); setActive(Math.min(activeOption + 1, results.length)); }
                if (event.key === 'ArrowUp') { event.preventDefault(); setActive(Math.max(activeOption - 1, 0)); }
                if (event.key === 'Enter') { event.preventDefault(); chooseOption(activeOption); }
              }} />
          </label>
          <div className="mot-destination-status" role="status"><i className={status === 'ready' ? '' : 'off'} />{status === 'loading' ? 'Loading the destination list… You can still type a city.' : registry.length ? `${status === 'bundled'?'Included FCC list':status === 'cached' ? 'Saved destination list' : 'FCC destination list'} · ${registry.length} cities${registryUpdatedAt ? ` · ${registryUpdatedAt.slice(0, 10)}` : ''} · works offline` : 'FCC destination list not yet available · name any city to continue'}</div>
          {(status === 'unavailable' || registryError) && <p className="mot-destination-muted">{registryError ?? 'The city list is waiting on FCC publication. Your trip can still start with a city and a country you choose.'}{onRetryRegistry && <> <button type="button" className="mot-destination-text-button" onClick={onRetryRegistry}>Retry the list</button></>}</p>}
          {showResults ? <ul className="mot-destination-results" id={listId} role="listbox" aria-label="Destinations">
            {results.map(({ row, via }, index) => <li role="none" key={row.id}><button type="button" id={`${listId}-${index}`} className="mot-destination-result" role="option" aria-selected={activeOption === index} tabIndex={-1} onClick={() => chooseCity(row)}>
              <Tag row={row} city={row.name} /><span><strong>{row.name}</strong><small>{countryName(row.countryCode)}{via && <> · also {via}</>}</small></span><span className="mot-destination-result-meta">{row.artworkCount === undefined ? 'Choose →' : row.artworkCount ? `${row.artworkCount} FCC illustrations` : 'No FCC art yet'}</span>
            </button></li>)}
            <li role="none"><button type="button" id={`${listId}-${results.length}`} className="mot-destination-result typed" role="option" aria-selected={activeOption === results.length} tabIndex={-1} onClick={chooseTyped}><Tag city={query.trim()} /><span><strong>Use “{query.trim()}” as you typed it</strong><small>Choose its country next. We won’t guess.</small></span><span className="mot-destination-result-meta">Your own city</span></button></li>
          </ul> : registry.length ? <div><p className="mot-destination-label">Or pick a tag</p><div className="mot-destination-tagwall" aria-label="Destination luggage tags">{registry.slice(0, wallLimit).map(row => <button type="button" key={row.id} aria-label={`Choose ${row.name}, ${countryName(row.countryCode)}`} onClick={() => chooseCity(row)}><Tag row={row} city={row.name} /><span>{row.name}</span><small>{countryName(row.countryCode)}</small></button>)}</div>{registry.length > wallLimit && <button type="button" className="mot-destination-text-button" onClick={() => setWallLimit(value => value + 24)}>Show more cities</button>}</div>
            : <div className="mot-destination-waiting"><Tag city="?" /><p>Every trip starts somewhere.</p><span>Type a city above. Choose its country by name next.</span></div>}
          <p className="mot-destination-muted">A new trip starts empty. Choosing a destination never adds sample cards.</p>
        </> : step === 'country' && selection ? <>
          <div className="mot-destination-preview"><div className="mot-destination-who"><Tag city={selection.city} /><div><h3>{selection.city}</h3><p>Kept exactly as you typed it.</p></div></div></div>
          <div><h3 className="mot-destination-question">Which country is {selection.city} in?</h3><p className="mot-destination-muted">You choose. A city name or picture is not evidence of its country.</p></div>
          <label className="mot-destination-search"><span className="mot-destination-sr">Country</span><input ref={countrySearch} type="search" placeholder="Search countries by name" value={countryQuery} onChange={event => setCountryQuery(event.target.value)} /></label>
          <div className="mot-destination-countries" role="group" aria-label="Countries">{countryResults.slice(0, 18).map(country => <button type="button" key={country.code} onClick={() => chooseCountry(country.code)}>{country.name}</button>)}</div>
          <p className="mot-destination-muted">{countryResults.length > 18 ? `${countryResults.length - 18} more countries · keep typing to narrow the list.` : !countryResults.length ? 'No country matches. Search its full name.' : 'Time zone stays unknown unless FCC supplies an explicit city entry.'}</p>
        </> : selection ? <>
          <div className="mot-destination-preview"><div className="mot-destination-who"><Tag key={selection.destination?.id ?? selection.city} row={selection.destination} city={selection.city} /><div><h3 ref={preview} tabIndex={-1}>{selection.city}, {countryName(selection.countryCode)}</h3><p>{current ? `New destination for “${current.title}”.` : 'Your own trip, ready to begin.'}</p></div></div>
            {!current && <><div className="mot-destination-lanes" aria-label="New board lanes">{LANES.map(lane => <div key={lane}><b>{lane}</b><span>empty</span></div>)}</div><p><strong>Starts empty.</strong> No sample cards.</p></>}
          </div>
          {current ? <div><h3 className="mot-destination-question">{preservedCards ? `Your ${preservedCards.length} cards stay exactly as they are` : 'Your cards and their source cities stay unchanged'}</h3>{preservedCards?.length ? <ul className="mot-destination-keep">{preservedCards.map(card => <li key={card.id}><b>{card.title || 'Untitled card'}</b>{card.sourceCity && <span>From {card.sourceCity}</span>}</li>)}</ul> : null}<p className="mot-destination-muted">Browse the new city’s FCC content after saving. Nothing is added automatically.</p></div> : null}
          <dl className="mot-destination-facts"><dt>Country</dt><dd>{countryName(selection.countryCode)}{!selection.destination && <> <button type="button" className="mot-destination-text-button" onClick={() => setStep('country')}>Change</button></>}</dd><dt>Time zone</dt><dd>{selection.destination?.timeZone ?? 'Unknown · schedule times stay as entered'}</dd><dt>Dates</dt><dd>{current?.dates ? `${current.dates.start} – ${current.dates.end}` : 'Not set'}</dd></dl>
        </> : null}
        {error && <p role="alert" className="mot-destination-error">{error}</p>}
      </div>
      <footer className="mot-destination-foot">{step === 'city' ? <><span>Type to search · ↑ ↓ then Enter to choose</span><button type="button" className="m-btn" onClick={onClose}>Cancel</button></> : <><button type="button" className="m-btn" onClick={back}>Back</button>{step === 'preview' && <button type="submit" className="m-btn primary">{current ? 'Save destination' : 'Create trip'}</button>}</>}</footer>
    </form>
  </section>;
}

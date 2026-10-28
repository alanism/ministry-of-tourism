import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { z } from 'zod';
import { useUi } from '../state/ui';
import { artworkSchema, catalogSchema, manifestSchema, registrySchema, readCatalog, type Artwork, type Manifest, type StylePack } from './catalog';
import { placeArtwork } from './place-artwork';
import './artwork.css';
import CountryArtworkBrowser from './CountryArtworkBrowser';
import type { ArtDestination } from './country-art';
interface TripArtContext {destination:{cityId?:string;city:string;countryCode?:string};destinations:readonly ArtDestination[];}
const normalizedCity=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');

const PAGE_SIZE = 12;

function useCatalog<T>(url: string, schema: z.ZodType<T>) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{ url: string; data?: T; error?: string }>();
  useEffect(() => {
    if (!url) return;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new Error('Artwork took too long to load. Please retry.')), 20000);
    let live = true;
    setState({ url });
    readCatalog(url, schema, controller.signal).then(data => {
      if (live) setState({ url, data });
    }).catch(error => {
      if (live) setState({ url, error: controller.signal.aborted ? 'Artwork took too long to load. Please retry.' : error instanceof Error ? error.message : 'Could not load artwork. Please retry.' });
    }).finally(() => clearTimeout(timer));
    return () => { live = false; clearTimeout(timer); controller.abort(); };
  }, [url, schema, attempt]);
  return { data: state?.url === url ? state.data : undefined, error: state?.url === url ? state.error : undefined, retry: () => setAttempt(value => value + 1) };
}

function LoadState({ error, retry }: { error?: string; retry: () => void }) {
  return error ? <div role="alert" className="artwork-message"><p>{error}</p><button type="button" onClick={retry}>Retry</button></div>
    : <p className="artwork-message" role="status">Loading artwork…</p>;
}

function Thumbnail({ artwork }: { artwork: Artwork }) {
  const [failed, setFailed] = useState(false);
  const [x, y, w, h] = artwork.crop ?? [0, 0, 1, 1];
  const style: CSSProperties = { width: `${100 / w}%`, height: `${100 / h}%`, left: `${-100 * x / w}%`, top: `${-100 * y / h}%` };
  return <span className="artwork-preview"><span className="artwork-crop" style={{ aspectRatio: (artwork.width * w) / (artwork.height * h) }}>
    {failed ? <span className="artwork-thumb-error">Preview unavailable</span>
      : <img src={artwork.thumb} alt="" loading="lazy" decoding="async" style={style} onError={() => setFailed(true)} />}
  </span></span>;
}

function CatalogBrowser({ manifest, onPick, busy,trip }: { manifest: Manifest; onPick: (artwork: Artwork) => void; busy: boolean;trip?:TripArtContext }) {
  const [subject, setSubject] = useState(manifest.subjects[0]!.id);
  const [city, setCity] = useState(trip?manifest.cities.find(value=>value.id===trip.destination.cityId||normalizedCity(value.id)===normalizedCity(trip.destination.city)||normalizedCity(value.label)===normalizedCity(trip.destination.city))?.id??'':manifest.cities.find(value => value.id === 'bangkok')?.id ?? manifest.cities[0]?.id ?? '');
  const [country,setCountry]=useState(false);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const catalog = manifest.catalogs.find(value => value.subject === subject && (value.city ?? '') === city);
  const resource = useCatalog(catalog?.url ?? '', catalogSchema);
  const items = resource.data?.items.filter(item => item.subject === subject && (item.city ?? '') === city
    && item.label.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())) ?? [];
  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages - 1);
  const reset = () => { setPage(0); setQuery(''); };
  const hasUnlocated = manifest.catalogs.some(value => !value.city);
  const identityError = resource.data && resource.data.styleId !== manifest.styleId;
  return <>
    <div className="artwork-filters">
      <label className="field"><span>Subject</span><select value={subject} disabled={busy} onChange={event => { setSubject(event.target.value); reset(); }}>
        {manifest.subjects.map(value => <option key={value.id} value={value.id}>{value.label}</option>)}
      </select></label>
      {manifest.cities.length > 0 && <label className="field"><span>City</span><select value={city} disabled={busy||country} onChange={event => { setCity(event.target.value); reset(); }}>
        {trip&&!city&&!hasUnlocated&&<option value="">No exact-city collection</option>}
        {hasUnlocated && <option value="">Not city-specific</option>}
        {manifest.cities.map(value => <option key={value.id} value={value.id}>{value.label}</option>)}
      </select></label>}
      <label className="field artwork-search"><span>Search these images</span><input type="search" placeholder="Find an image…" value={query} disabled={busy} onChange={event => { setQuery(event.target.value); setPage(0); }} /></label>
    </div>
    {trip&&<div className="artwork-filters"><button type="button" disabled={busy} onClick={()=>setCountry(value=>!value)}>{country?'Back to city art':'Browse this country'}</button><span>{country?`Country: ${trip.destination.countryCode??'unknown'}`:`Origin: ${manifest.cities.find(value=>value.id===city)?.label??'No exact-city collection'}`}</span></div>}
    {country&&trip?<CountryArtworkBrowser manifest={manifest} subject={subject} countryCode={trip.destination.countryCode} destinations={trip.destinations} onPick={onPick} busy={busy} />:!catalog ? <p className="artwork-message">No artwork in this selection yet. Try another subject or city{trip?', or browse the country collection':''}.</p>
      : identityError ? <p className="artwork-message" role="alert">This catalog belongs to another style. Please choose another style.</p>
      : !resource.data ? <LoadState error={resource.error} retry={resource.retry} />
      : <>
        <p className="artwork-count" role="status">{items.length} images · Select an image to add it to your board.</p>
        {items.length ? <div className="artwork-grid" aria-label="Artwork images">
          {items.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE).map(item => <button type="button" key={item.id} className="artwork-tile" aria-label={`Add ${item.label}`} disabled={busy} onClick={() => onPick(artworkSchema.parse(item))}>
            <Thumbnail artwork={item} /><span className="artwork-label">{item.label}</span>
          </button>)}
        </div> : <p className="artwork-message">No images match that search.</p>}
        {totalPages > 1 && <nav className="artwork-pagination" aria-label="Artwork pages">
          <button type="button" disabled={busy || currentPage === 0} onClick={() => setPage(currentPage - 1)}>Previous</button>
          <span>Page {currentPage + 1} of {totalPages}</span>
          <button type="button" disabled={busy || currentPage + 1 >= totalPages} onClick={() => setPage(currentPage + 1)}>Next</button>
        </nav>}
      </>}
  </>;
}

function PackBrowser({ pack, onPick, busy,trip }: { pack: StylePack; onPick: (artwork: Artwork) => void; busy: boolean;trip?:TripArtContext }) {
  const resource = useCatalog(pack.manifest, manifestSchema);
  if (!resource.data) return <LoadState error={resource.error} retry={resource.retry} />;
  if (resource.data.styleId !== pack.id) return <p className="artwork-message" role="alert">This style catalog could not be matched. Please choose another style.</p>;
  return <CatalogBrowser key={pack.id} manifest={resource.data} onPick={onPick} busy={busy} trip={trip} />;
}

export default function ArtworkPicker({onInsert,onClose,trip}:{onInsert?:(artwork:Artwork,signal:AbortSignal)=>Promise<void>;onClose?:()=>void;trip?:TripArtContext}={}) {
  const registry = useCatalog('/artwork/index.json', registrySchema);
  const [styleId, setStyleId] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const section = useRef<HTMLElement>(null);
  const insertion = useRef<AbortController | null>(null);
  const close = onClose??(()=>useUi.getState().setDialog(null));
  const pack = registry.data?.styles.find(value => value.id === styleId) ?? registry.data?.styles[0];
  useEffect(() => {
    section.current?.querySelector<HTMLButtonElement>('button')?.focus();
    return () => { insertion.current?.abort(); document.querySelector<HTMLButtonElement>('.toolbar .menu-button')?.focus(); };
  }, []);
  const pick = async (artwork: Artwork) => {
    if (insertion.current) return;
    const controller = new AbortController();
    insertion.current = controller;
    const timer = setTimeout(() => controller.abort(new Error('Download took too long. Please try again.')), 30000);
    setBusy(artwork.label); setError('');
    try { await (onInsert??placeArtwork)(artwork, controller.signal); close(); }
    catch (cause) {
      if (!controller.signal.aborted || cause instanceof Error && cause.name !== 'AbortError') {
        setError(controller.signal.aborted ? 'Download took too long. Please try again.' : cause instanceof Error ? cause.message : 'Could not add artwork. Please try again.');
      }
    } finally { clearTimeout(timer); insertion.current = null; setBusy(''); }
  };
  return <div className="dialog-backdrop" onMouseDown={event => event.target === event.currentTarget && close()} onKeyDown={event => {
    event.stopPropagation();
    if (event.key === 'Escape') { event.preventDefault(); close(); }
    if (event.key === 'Tab') {
      const focusable = [...(section.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled)') ?? [])];
      const first = focusable[0], last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
  }}>
    <section ref={section} className="dialog artwork-picker" role="dialog" aria-modal="true" aria-labelledby="artwork-title" aria-busy={!!busy}>
      <div className="artwork-heading"><h2 id="artwork-title">Artwork</h2><button type="button" onClick={close} aria-label="Close artwork">Close</button></div>
      <p className="dialog-note">People, places and objects for your ideas. Images load as you browse.</p>
      {busy && <p className="artwork-notice" role="status">Adding {busy}…</p>}
      {error && <p className="dialog-error" role="alert">{error}</p>}
      {!registry.data ? <LoadState error={registry.error} retry={registry.retry} /> : <>
        <label className="field artwork-style"><span>Style</span><select value={pack?.id} disabled={!!busy} onChange={event => { setStyleId(event.target.value); setError(''); }}>
          {registry.data.styles.map(value => <option key={value.id} value={value.id}>{value.label}</option>)}
        </select></label>
        {pack && <PackBrowser key={pack.id} pack={pack} onPick={artwork => void pick(artwork)} busy={!!busy} trip={trip} />}
      </>}
    </section>
  </div>;
}

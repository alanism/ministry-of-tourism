import { useEffect, useMemo, useRef, useState } from 'react';
import type { Artwork, Manifest } from './catalog';
import { loadCountryArtwork, resolveArtScope, type ArtDestination, type CountryArtCache, type CountryArtLoad } from './country-art';

const PAGE_SIZE = 12;
export interface CountryArtworkBrowserProps {
  manifest: Manifest; subject: string; countryCode?: string; destinations: readonly ArtDestination[];
  onPick: (artwork: Artwork) => void; busy?: boolean;preview?:boolean;
}

/** Country browsing is explicit; fetching a collection never inserts art or changes the destination. */
export default function CountryArtworkBrowser({ manifest, subject, countryCode, destinations, onPick, busy = false,preview=false }: CountryArtworkBrowserProps) {
  const scope = useMemo(() => resolveArtScope({ countryCode, category: subject, mode: 'country', destinations, manifest }), [countryCode, subject, destinations, manifest]);
  const [attempt, setAttempt] = useState(0);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const [state, setState] = useState<{ key: string; loading: boolean; result?: CountryArtLoad }>();
  const cache = useRef<CountryArtCache>(new Map());
  const loadingController = useRef<AbortController | null>(null);
  const key = JSON.stringify([manifest.styleId, subject, countryCode, scope.catalogPaths]);
  useEffect(() => {
    if (!scope.catalogs.length) return;
    const controller = new AbortController(); loadingController.current = controller;
    let live = true;
    setState({ key, loading: true });
    void loadCountryArtwork({ scope, manifest, subject, signal: controller.signal, cache: cache.current, offline: !navigator.onLine }).then(result => {
      if (live) setState({ key, loading: false, result });
    });
    return () => { live = false; controller.abort(); if (loadingController.current === controller) loadingController.current = null; };
  }, [scope, manifest, subject, key, attempt]);
  if (!scope.catalogs.length) return <p className="artwork-message" role="status">{scope.message}</p>;
  const current = state?.key === key ? state : undefined;
  const result = current?.result;
  const items = (result?.items ?? []).filter(item => `${item.artwork.label} ${item.originCityName}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const pages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const currentPage = Math.min(page, pages - 1);
  return <section aria-label="Country artwork" aria-busy={current?.loading ?? true}>
    <p className="artwork-count">{scope.message} Country art is decorative; it does not create local routes or recommendations.</p>
    <label className="field artwork-search"><span>Search country artwork</span><input type="search" value={query} disabled={busy} onChange={event => { setQuery(event.target.value); setPage(0); }} /></label>
    {(!current || current.loading) && <div className="artwork-message" role="status">Loading country artwork… <button type="button" onClick={() => loadingController.current?.abort()}>Stop</button></div>}
    {result?.status === 'cancelled' && <p className="artwork-message" role="status">Country artwork loading stopped. <button type="button" onClick={() => setAttempt(value => value + 1)}>Retry</button></p>}
    {result?.error && <p className="artwork-message" role="alert">{result.error} <button type="button" disabled={busy} onClick={() => setAttempt(value => value + 1)}>Retry</button></p>}
    {result?.retrievedAt && <p className="artwork-count" role="status">{result.status === 'cached' ? 'Cached collection' : 'Collection loaded'} · {result.retrievedAt} · {items.length} images</p>}
    {result && !current?.loading && <>
      {items.length ? <div className="artwork-grid" aria-label="Country artwork images">
        {items.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE).map(item => <button type="button" className="artwork-tile" key={`${item.originCityId}:${item.artwork.id}`} disabled={busy} aria-label={`${preview?'Preview':'Add'} ${item.artwork.label} from ${item.originCityName}`} onClick={() => onPick(item.artwork)}>
          <span className="artwork-preview"><img src={item.artwork.thumb} alt="" loading="lazy" decoding="async" style={{ width: '100%', height: '100%', objectFit: 'contain' }} /></span>
          <span className="artwork-label">{item.artwork.label}</span><span className="artwork-label">From {item.originCityName}</span>{preview&&<span className="artwork-label art-meta">{item.artwork.artRef?.credit??'Credit not supplied'}</span>}
        </button>)}
      </div> : result.status === 'ready' || result.status === 'cached' ? <p className="artwork-message">No images match this search. Normal image uploads remain available.</p> : null}
      {pages > 1 && <nav className="artwork-pagination" aria-label="Country artwork pages">
        <button type="button" disabled={busy || currentPage === 0} onClick={() => setPage(currentPage - 1)}>Previous</button>
        <span>Page {currentPage + 1} of {pages}</span>
        <button type="button" disabled={busy || currentPage + 1 >= pages} onClick={() => setPage(currentPage + 1)}>Next</button>
      </nav>}
    </>}
  </section>;
}

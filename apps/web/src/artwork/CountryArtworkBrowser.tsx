import { useEffect, useMemo, useRef, useState } from 'react';
import ArtworkThumbnail from './ArtworkThumbnail';
import type { Artwork, Manifest } from './catalog';
import { loadCountryArtwork, resolveArtScope, type ArtDestination, type CountryArtCache, type CountryArtLoad,type ArtScope,restoreCountryArtCache,persistCountryArtCache } from './country-art';

const PAGE_SIZE = 12;
const dateFormat=new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'short',year:'numeric'});
const dateLabel=(value:string)=>{const date=new Date(value.length===10?value+'T00:00:00':value);return Number.isFinite(date.getTime())?dateFormat.format(date):'Date not supplied';};
export interface CountryArtworkBrowserProps {
  manifest: Manifest; subject: string; countryCode?: string; destinations: readonly ArtDestination[];
  onPick: (artwork: Artwork) => void; busy?: boolean;preview?:boolean;scopeOverride?:ArtScope;mode?:'city'|'country';destinationCityId?:string;
}

/** Country browsing is explicit; fetching a collection never inserts art or changes the destination. */
export default function CountryArtworkBrowser({ manifest, subject, countryCode, destinations, onPick, busy = false,preview=false,scopeOverride,mode='country',destinationCityId }: CountryArtworkBrowserProps) {
  const resolved = useMemo(() => resolveArtScope({ countryCode, category: subject, mode: 'country', destinations, manifest }), [countryCode, subject, destinations, manifest]);
  const scope=scopeOverride??resolved;
  const [retries,setRetries]=useState({key:'',count:0});
  const [acceptedCopy,setAcceptedCopy]=useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const [state, setState] = useState<{ key: string; loading: boolean; result?: CountryArtLoad }>();
  const [cache] = useState<CountryArtCache>(restoreCountryArtCache);
  const loadingController = useRef<AbortController | null>(null);
  const key = JSON.stringify([manifest.styleId, subject, countryCode, scope.catalogPaths]);
  const attempt=retries.key===key?retries.count:0;
  const retry=()=>{setAcceptedCopy('');setRetries({key,count:attempt+1});};
  useEffect(() => {
    if (!scope.catalogs.length) return;
    const controller = new AbortController(); loadingController.current = controller;
    let live = true;
    setAcceptedCopy('');setState({ key, loading: true });
    void loadCountryArtwork({ scope, manifest, subject, signal: controller.signal, cache, offline: !navigator.onLine }).then(result => {
      if(live){setState({key,loading:false,result});if(result.status==='ready')persistCountryArtCache(cache);}
    });
    return () => { live = false; controller.abort(); if (loadingController.current === controller) loadingController.current = null; };
  }, [scope, manifest, subject, key, attempt]);
  if (!scope.catalogs.length) return <p className="artwork-message" role="status">{scope.message}</p>;
  const current = state?.key === key ? state : undefined;
  const result = current?.result;
  const usingCopy=!!result?.error&&result.status==='cached';
  const visible=!usingCopy||acceptedCopy===key;
  const items = (visible?result?.items??[]:[]).filter(item => `${item.artwork.label} ${item.originCityName}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const pages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const currentPage = Math.min(page, pages - 1);
  return <section aria-label={mode==='country'?'Country artwork':'City artwork'} aria-busy={current?.loading ?? true}>
    <p className="artwork-count">{scope.message} Art is decorative; it does not create places or stops.</p>
    <label className="field artwork-search"><span>{mode==='country'?'Search country artwork':'Search these images'}</span><input type="search" value={query} disabled={busy} onChange={event => { setQuery(event.target.value); setPage(0); }} /></label>
    {(!current || current.loading) && <div className="artwork-message" role="status">Loading artwork… <button type="button" onClick={() => loadingController.current?.abort()}>Stop</button></div>}
    {result?.status === 'cancelled' && <p className="artwork-message" role="status">Artwork loading stopped. {attempt<3&&<button type="button" onClick={retry}>Try again</button>}</p>}
    {result?.error && <p className="artwork-message" role="alert">{result.error} {attempt<3?<button type="button" disabled={busy} onClick={retry}>Try again</button>:<span> Three retries failed. Try when connected.</span>}{usingCopy&&acceptedCopy!==key&&<button type="button" onClick={()=>setAcceptedCopy(key)}>Use the {result.retrievedAt?dateLabel(result.retrievedAt):'dated'} copy</button>}</p>}
    {visible&&result?.retrievedAt && <p className="artwork-count" role="status">{result.status === 'cached' ? 'Cached collection' : 'Collection loaded'} · {dateLabel(result.retrievedAt)} · {items.length} {items.length===1?'picture':'pictures'}</p>}
    {visible&&result && !current?.loading && <>
      {items.length ? <div className="artwork-grid" aria-label="Country artwork images">
        {items.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE).map(item => <div className="artwork-result" key={`${item.originCityId}:${item.artwork.id}`}>
          <button type="button" className="artwork-tile" disabled={busy} aria-label={`${preview?'Preview':'Add'} ${item.artwork.label}${mode==='country'&&item.originCityId!==destinationCityId?' from '+item.originCityName:''}`} onClick={() => onPick(item.artwork)}>
            <ArtworkThumbnail artwork={item.artwork}/><span className="artwork-label">{item.artwork.label}</span>
            {item.originCityId!==destinationCityId?<span className="art-origin-chip">From {item.originCityName}</span>:<span className="artwork-label art-meta">{item.originCityName}</span>}
            {preview&&<span className="artwork-label art-meta">{item.artwork.artRef?.credit??'Credit not supplied'}</span>}
          </button>
          {item.artwork.artRef&&<a className="art-tile-source" href={item.artwork.artRef.source.canonicalUrl} target="_blank" rel="noopener noreferrer"><span>FCC source</span><time dateTime={item.artwork.artRef.source.retrievedAt}>{dateLabel(item.artwork.artRef.source.retrievedAt)}</time></a>}
        </div>)}
      </div> : result.status === 'ready' || result.status === 'cached' ? <p className="artwork-message">No images match this search. Normal image uploads remain available.</p> : null}
      {pages > 1 && <nav className="artwork-pagination" aria-label="Country artwork pages">
        <button type="button" disabled={busy || currentPage === 0} onClick={() => setPage(currentPage - 1)}>Previous</button>
        <span>Page {currentPage + 1} of {pages}</span>
        <button type="button" disabled={busy || currentPage + 1 >= pages} onClick={() => setPage(currentPage + 1)}>Next</button>
      </nav>}
    </>}
  </section>;
}

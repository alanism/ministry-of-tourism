import {useEffect,useRef,useState} from 'react';
import '@fontsource/ibm-plex-sans/600.css';
import {readAllCards,type Actor,type CityFetchOptions,type FccAlmanacSnapshot,type FccResult,type TripSession} from '@writers-board/core';
import {almanacPin,almanacRows} from './almanac-facts';
import {loadDestinations,type DestinationRow} from './destination';
import {sourceDate} from './source-card';
import {SourceLink} from './SourceContent';
import {FocusSheet} from './ui';
import './almanac.css';

type Load=(cityId:string,request?:CityFetchOptions)=>Promise<FccResult<FccAlmanacSnapshot>>;
interface Props {cityId:string;session:TripSession;actor:Actor;refresh:()=>void;notify:(message:string)=>void;load:Load;}
function CityAlmanac({cityId,session,actor,refresh,notify,load,canPin}:{canPin:boolean}&Props){
  const [result,setResult]=useState<FccResult<FccAlmanacSnapshot>>(),[pending,setPending]=useState(true),[failure,setFailure]=useState(''),[attempt,setAttempt]=useState(0),[offline,setOffline]=useState(false);
  useEffect(()=>{
    const controller=new AbortController();let live=true;const offline=!navigator.onLine;
    setPending(true);setFailure('');setOffline(offline);
    void load(cityId,{signal:controller.signal,offline}).then(value=>{if(live)setResult(value);},()=>{if(live)setFailure('The Almanac could not be reached. Retry to check this city.');}).finally(()=>{if(live)setPending(false);});
    return()=>{live=false;controller.abort();};
  },[cityId,attempt,load]);
  const loaded=result&&result.status!=='unavailable'&&result.value.slug===cityId?result:undefined,rows=loaded?almanacRows(loaded.value):[];
  const dates=[...new Set(rows.flatMap(row=>row.observedAt?[row.observedAt]:[]))].sort(),seen=dates.length?sourceDate(dates[0])+(dates.length>1?' – '+sourceDate(dates.at(-1)):''):'Not provided';
  const pinned=new Set(readAllCards(session.parts).map(card=>card.source?.id));
  const status=pending?'Loading dated listings…':failure||(result?.status==='unavailable'?result.reason:loaded?.status==='stale'?'Couldn’t refresh · saved copy kept':loaded?.status==='cached'?(offline?'Offline · saved copy':'Saved copy · revalidated'):'FCC dated listings');
  return <section className="mot-almanac-city" aria-label={loaded?.value.city?.n??cityId}>
    <div className="mot-almanac-city-head"><h3>{loaded?.value.city?.n??cityId}</h3><button type="button" className="m-btn" disabled={pending} onClick={()=>setAttempt(value=>value+1)} aria-label={`Refresh Almanac ${cityId}`}>Refresh</button></div>
    <div role="status" className="mot-almanac-status">{status}{loaded?.status==='stale'&&<p>{loaded.error?.message}</p>}</div>
    {loaded&&<><dl className="mot-almanac-dates"><div><dt>Prices seen</dt><dd>{seen}</dd></div><div><dt>Exchange rate</dt><dd>{sourceDate(loaded.value.city?.fx??undefined)}</dd></div><div><dt>FCC collected</dt><dd>{sourceDate(loaded.value.asOf??undefined)}</dd></div><div><dt>Retrieved</dt><dd>{sourceDate(loaded.retrievedAt)}</dd></div></dl>
      {!rows.length&&<p>No dated listings were published for this city.</p>}
      <div className="mot-almanac-tiles">{rows.map(row=><article key={row.id} data-almanac-row={row.id} className="mot-almanac-tile">
        <h4>{row.label}</h4><p className="mot-almanac-price">{row.value===null?'Not available':<>{row.currency} {row.value.toLocaleString('en-GB',{minimumFractionDigits:2,maximumFractionDigits:2})}</>}</p>
        {row.value!==null&&row.rate!==null&&row.fxDate&&<p className="mot-almanac-conversion">≈ US${(row.value*row.rate).toFixed(2)} at the {sourceDate(row.fxDate)} rate</p>}
        <p className="mot-almanac-seen">Seen {sourceDate(row.observedAt??undefined)}</p><SourceLink url={row.url??undefined} label={row.source??'Open source ↗'}/>{!row.url&&<span>Source not provided</span>}
        <details><summary>How comparable is this?</summary><p>{row.note||'No comparability note provided.'}</p></details>
        {canPin&&<button type="button" className="m-btn" disabled={pinned.has(`fcc:${loaded.value.slug}:almanac:${row.id}`)} onClick={()=>{try{session.execute(actor,'trip_card_create',almanacPin(row,loaded));refresh();notify('Pinned to Prepare with its date and source.');}catch(error){setFailure(error instanceof Error?error.message:'The listing could not be pinned. Retry.');}}}>{pinned.has(`fcc:${loaded.value.slug}:almanac:${row.id}`)?'On your board':'Pin to Prepare'}</button>}
      </article>)}</div>{loaded.value.city?.sourceNote&&<p className="mot-almanac-note">{loaded.value.city.sourceNote}</p>}{loaded.value.city?.fxNote&&<p className="mot-almanac-note">{loaded.value.city.fxNote}</p>}
    </>}
    {result?.status!=='unavailable'&&result?.value.status==='unavailable'&&<p>No Almanac publication is available for this city.</p>}
  </section>;
}
export function Almanac(props:Props){
  const [open,setOpen]=useState(false),[compareId,setCompareId]=useState(''),[cities,setCities]=useState<DestinationRow[]>([]),[registryError,setRegistryError]=useState('');
  const opener=useRef<HTMLButtonElement>(null),wasOpen=useRef(false);
  useEffect(()=>{if(wasOpen.current&&!open)opener.current?.focus({preventScroll:true});wasOpen.current=open;},[open]);
  useEffect(()=>{if(!open)return;const controller=new AbortController();void loadDestinations({signal:controller.signal,offline:!navigator.onLine}).then(registry=>{if(!controller.signal.aborted){setCities(registry.cities);setRegistryError(registry.error??'');}});return()=>controller.abort();},[open]);
  return <><button ref={opener} type="button" className="m-btn" onClick={()=>setOpen(true)}>FCC Almanac</button>{open&&<FocusSheet label="FCC Almanac" onClose={()=>setOpen(false)}><div className="mot-almanac">
    <header><div className="mot-almanac-heading"><h2>What things cost, when FCC looked</h2><button type="button" className="m-btn" aria-label="Close Almanac" onClick={()=>setOpen(false)}>×</button></div><p>Dated listings for comparison. Check before you pay.</p>
      <label className="mot-almanac-compare">Compare a city<select aria-label="Compare a city" value={compareId} onChange={event=>setCompareId(event.target.value)}><option value="">One city</option>{cities.filter(city=>city.id!==props.cityId).map(city=><option key={city.id} value={city.id}>{city.name}</option>)}</select></label>{registryError&&!cities.length&&<p className="mot-almanac-note">The comparison city list could not be loaded. This city’s listings remain available.</p>}</header>
    <div className="mot-almanac-body"><div className={'mot-almanac-cols'+(compareId?' comparing':'')}><CityAlmanac key={props.cityId} {...props} canPin/>{compareId&&<CityAlmanac key={compareId} {...props} cityId={compareId} canPin={false}/>}</div></div>
  </div></FocusSheet>}</>;
}

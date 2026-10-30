import {useMemo,useRef,useState} from 'react';
import type {Artwork,Manifest} from './catalog';
import {resolveArtScope,type ArtDestination} from './country-art';
import {countryChoices,countryName,foldDestination} from '../trip/destination';
import CountryArtworkBrowser from './CountryArtworkBrowser';
import ArtworkPreview from './ArtworkPreview';

const categories=[['city-illustrations','Scenes'],['city-ink','City ink'],['cafe','Café'],['portraits','Brush & fashion portraits'],['hotels','Hotels'],['restaurants','Restaurants'],['activities','Activities'],['people','People'],['objects','Objects'],['stickers','Stickers'],['maps','Maps']] as const;
interface TripContext{destination:{cityId?:string;city:string;countryCode?:string};destinations:readonly ArtDestination[];}
export default function TripArtworkBrowser({manifest,trip,onPick,busy,onUpload}:{manifest:Manifest;trip:TripContext;onPick:(art:Artwork)=>void;busy:boolean;onUpload?:()=>void}){
 const [mode,setMode]=useState<'city'|'country'>('city'),[category,setCategory]=useState('all'),[chosenCountry,setChosenCountry]=useState<string>(),[countryQuery,setCountryQuery]=useState(''),[selected,setSelected]=useState<Artwork|null>(null);
 const selectedButton=useRef<HTMLElement|null>(null);
 const cityId=trip.destination.cityId??trip.destinations.find(city=>[city.id,city.name,...(city.aliases??[])].some(name=>foldDestination(name)===foldDestination(trip.destination.city)))?.id;
 const countryCode=chosenCountry??trip.destination.countryCode,country=countryName(countryCode),tripName=trip.destination.city;
 const scope=useMemo(()=>resolveArtScope({cityId,countryCode,category,mode,destinations:trip.destinations,manifest}),[cityId,countryCode,category,mode,trip.destinations,manifest]);
 const pool=useMemo(()=>{
  const ids=new Set(trip.destinations.filter(city=>city.countryCode===countryCode).map(city=>city.id));
  return manifest.catalogs.filter(ref=>ref.subject!=='apparel'&&ref.count>0&&(mode==='city'?ref.city===cityId:!!ref.city&&ids.has(ref.city)));
 },[manifest,mode,cityId,countryCode,trip.destinations]);
 const counts=new Map<string,number>();for(const ref of pool)counts.set(ref.subject,(counts.get(ref.subject)??0)+ref.count);
 const countryRefs=manifest.catalogs.filter(ref=>ref.subject!=='apparel'&&ref.count>0&&trip.destinations.some(city=>city.id===ref.city&&city.countryCode===countryCode));
 const countryCount=countryRefs.reduce((sum,ref)=>sum+ref.count,0),cityCount=new Set(countryRefs.map(ref=>ref.city)).size;
 const offered=scope.catalogs.reduce((sum,ref)=>sum+ref.count,0),label=categories.find(([id])=>id===category)?.[1]??'art';
 const changeMode=(value:'city'|'country')=>{setMode(value);setSelected(null);};
 const select=(art:Artwork)=>{selectedButton.current=document.activeElement as HTMLElement;setSelected(art);};
 const back=()=>{setSelected(null);requestAnimationFrame(()=>selectedButton.current?.focus());};
 const unavailable=scope.state!=='cityavailable'&&scope.state!=='countryavailable';
 return <div className={'trip-art-panes'+(selected?' has-preview':'')}>
  <div className="trip-art-browse">
   <div className="art-scope" role="group" aria-label="Artwork origin scope">
    <button type="button" disabled={busy} aria-label="Back to city art" aria-pressed={mode==='city'} onClick={()=>changeMode('city')}>{tripName}</button>
    <button type="button" disabled={busy} aria-label="Browse this country" aria-pressed={mode==='country'} onClick={()=>changeMode('country')}>{countryCode?'All of '+country:'Choose country'}{countryCode&&<small>{countryCount} pictures · {cityCount} cities</small>}</button>
   </div>
   {scope.state!=='countryunknown'&&scope.state!=='cityabsent'&&!(scope.state==='countryempty'&&countryCount===0)&&<div className="art-categories" role="group" aria-label="Art categories">
    {[['all','All'],...categories,...(manifest.subjects.some(s=>s.id==='other')?[['other','Other drawings']]:[])].map(([id,name])=>{const count=id==='all'?pool.reduce((sum,ref)=>sum+ref.count,0):counts.get(id!)??0;return <button type="button" disabled={busy} className={count?'':'zero'} key={id} aria-pressed={category===id} onClick={()=>{setCategory(id!);setSelected(null);}}>{name} <b>{count}</b></button>;})}
   </div>}
   {scope.state==='countryunknown'?<section className="art-scope-notice" aria-label="Choose artwork country">
    <h3>Which country is {tripName} in?</h3><p>Choose where to browse. This keeps your trip destination unchanged.</p>
    <label className="field"><span>Country</span><input type="search" placeholder="Search countries by name" value={countryQuery} onChange={e=>setCountryQuery(e.target.value)}/></label>
    <div className="art-country-options">{countryChoices(countryQuery).slice(0,8).map(choice=><button type="button" disabled={busy} key={choice.code} onClick={()=>{setChosenCountry(choice.code);changeMode('country');}}>{choice.name}</button>)}</div>
    {countryQuery&&!countryChoices(countryQuery).length&&<p>No country matches. Try its full name.</p>}
   </section>:unavailable?<section className="art-scope-notice" role="status">
    <h3>{scope.state==='cityabsent'?`FCC hasn’t drawn ${tripName} yet`:scope.state==='categorygap'?`No ${label.toLowerCase()} drawn for ${tripName} yet`:scope.state==='countryempty'?`No ${label.toLowerCase()} from ${country} yet`:'Country artwork is unavailable'}</h3>
    <p>{scope.message}</p>
    {scope.state==='cityabsent'&&offered>0&&<p>{country} has {offered} pictures in this selection. Each keeps its original city.</p>}
    {category==='maps'&&<p>FCC map tees are clothing, not flat maps. They live in Wear the trip.</p>}
    <div className="art-notice-actions">{(scope.state==='cityabsent'||scope.state==='categorygap')&&offered>0&&<button type="button" className="m-btn ink" onClick={()=>changeMode('country')}>Browse {offered} across {country}</button>}{onUpload&&<button type="button" className="m-btn" onClick={onUpload}>Upload your photos</button>}</div>
   </section>:<CountryArtworkBrowser manifest={manifest} subject={category} countryCode={countryCode} destinations={trip.destinations} scopeOverride={scope} mode={mode} destinationCityId={cityId} onPick={select} busy={busy} preview/>}
  </div>
  {selected?<ArtworkPreview key={selected.id} artwork={selected} origin={trip.destinations.find(city=>city.id===selected.city)?.name??manifest.cities.find(city=>city.id===selected.city)?.label??selected.city??'Origin unknown'} away={!!selected.city&&selected.city!==cityId} busy={busy} onAdd={()=>onPick(selected)} onBack={back}/>:<aside className="trip-art-preview art-preview-empty"><h3>Pick a picture to preview it</h3><p>See who drew it, where it’s from and how large its pixels print.</p></aside>}
 </div>;
}

import type {TripCard} from '@writers-board/core';
import '@fontsource/ibm-plex-serif/600.css';
import {editedSourceCopy,sourceDate,sourceHref,sourceTextFor} from './source-card';
import {cardProvenanceLabel} from './sample';
import './content-cards.css';

export function SourceLink({url,label='Open source ↗'}:{url:string|undefined;label?:string}){
  const href=sourceHref(url);
  return href?<a className="mot-source-link" href={href} target="_blank" rel="noopener noreferrer">{label}</a>:null;
}
export function CheckedFacts({card}:{card:TripCard}){
  if(!card.currentFacts?.length)return card.source?.kind==='venue'?<p className="mot-source-unchecked">◌ Nothing checked yet · current hours and prices need a check.</p>:null;
  return <div className="mot-source-facts" aria-label="Checked facts">{card.currentFacts.map((fact,index)=><div key={index}><span className="mot-source-tick" aria-hidden="true">✓</span><div><b>{fact.field}</b><p>{fact.value}</p><small>Checked {sourceDate(fact.observedAt)}</small><SourceLink url={fact.evidenceUrl} label="Evidence ↗"/></div></div>)}</div>;
}
export function SourceRecord({card}:{card:TripCard}){
  const source=card.source;if(!source)return null;
  return <dl className="mot-source-record"><dt>Source</dt><dd>{source.provider==='fcc'||card.provenance==='fcc'?'Foreign Clubbers Correspondence':'Saved source'}{source.cityId?' · '+source.cityId:''}</dd>
    {source.publishedAt&&<><dt>Published</dt><dd>{sourceDate(source.publishedAt)}</dd></>}
    <dt>Retrieved</dt><dd>{sourceDate(source.retrievedAt)}</dd><dt>Version</dt><dd>{source.version??source.contentHash??'Not provided'}</dd><dt>Source identity</dt><dd>{source.id}</dd></dl>;
}
export function EditedExcerpt({card}:{card:TripCard}){
  const copy=editedSourceCopy(card);
  return copy?<div className="mot-source-note"><span>Your saved excerpt</span><p>{copy}</p></div>:null;
}
export function CardContent({card,updated=false}:{card:TripCard;updated?:boolean}){
  const quote=sourceTextFor(card),source=card.source,label=cardProvenanceLabel(card);
  return <div className="mot-card-content">
    {updated&&<span className="m-chip">Source updated · your note kept</span>}
    {card.provenance==='agent'?<div className="mot-source-muse"><b>{label==='Test adapter'?'Test adapter suggestion':label} · Not checked</b><p>{card.body}</p></div>:
      source?<>{quote&&<blockquote className="mot-source-quote compact">{quote.slice(0,2000)}</blockquote>}<div className="mot-source-attribution">{source.kind==='venue'?'Venue · ':''}{source.provider==='fcc'||card.provenance==='fcc'?'FCC':'Source'} · {source.publishedAt?'Published '+sourceDate(source.publishedAt):'Retrieved '+sourceDate(source.retrievedAt)}</div></>:
      card.body?<p className="m-card-body">{card.body}</p>:null}
    <EditedExcerpt card={card}/>{card.travelerNote&&<div className="mot-source-note"><span>Your note</span><p>{card.travelerNote}</p></div>}
    <CheckedFacts card={card}/>{source&&<SourceLink url={source.canonicalUrl??source.url}/>}
  </div>;
}

import {magazineReadingHtml,magazineSelectionSummary,type MagazineDocument} from '@writers-board/core';
import './magazine-reading.css';
export function MagazineReading({issue}:{issue:MagazineDocument}){
  return <section className="mot-complete-reading" id="trip-reading"><h2>Complete trip text</h2><p>Saved personal material and clearly identified sources. Page excerpts continue here without changing your original notes.</p>
    {issue.selection&&<section aria-label="Included and unresolved material"><h3>What this copy includes</h3>{magazineSelectionSummary(issue.selection).map(line=><p key={line}>{line}</p>)}</section>}
    {issue.reading?.map(item=><article id={`reading-${encodeURIComponent(item.id)}`} key={item.id}><h3>{item.title}</h3><p className="m-muted">{item.source?'Source material':'Your trip'}{item.day?` · ${item.day}${item.time?' · '+item.time:' · day only'}`:''}</p><div dangerouslySetInnerHTML={{__html:magazineReadingHtml(item.body)+(item.note?'<h4>Your note</h4>'+magazineReadingHtml(item.note):'')}} /></article>)}
    {!!issue.selection?.assets.length&&<section><h3>Saved pictures</h3><ul>{issue.selection.assets.map(asset=><li key={asset.id}>{asset.caption??asset.id}{asset.representedBy?` · same image as ${issue.selection!.assets.find(other=>other.id===asset.representedBy)?.caption??asset.representedBy}`:''}{asset.credit?` · ${asset.credit}`:''}</li>)}</ul></section>}
    {issue.selection&&<details><summary>Included material · revision {issue.selection.revision}</summary><p>{issue.selection.cards.length} cards · {issue.selection.assets.length} images · {issue.selection.excluded.cards} cards outside this copy’s scope</p><pre>{JSON.stringify(issue.selection,null,2)}</pre></details>}
  </section>;
}

import type {InstantRunoffResult} from '@writers-board/core';

/** Round-by-round instant-runoff reading of the same ranked replies. Advisory, like the points result. */
export function RunoffRounds({result,name}:{result:InstantRunoffResult;name:(optionId:string)=>string}){
 const {outcome,rounds}=result,last=rounds.at(-1);
 const headline=outcome.kind==='no_ballots'?'No ranked replies yet.'
  :outcome.kind==='winner'?`${name(outcome.option_id)} leads in round ${last!.round}: ${outcome.majority?`more than half of all ${result.ranked} ranked replies`:`more than half of the ${last!.active} replies still in the count; ${last!.exhausted} ran out of choices, so this is not a majority of all ${result.ranked}`}.`
  :`Tie between ${outcome.option_ids.map(name).join(' and ')} after ${rounds.length} round${rounds.length===1?'':'s'}. Ties stay tied.`;
 const options=rounds[0]?.counts.map(c=>c.option_id)??[];
 const votes=(round:InstantRunoffResult['rounds'][number],id:string)=>round.counts.find(c=>c.option_id===id)?.votes;
 return <div className="mot-runoff">
  <p><strong>{headline}</strong></p>
  {rounds.length>0&&<div className="mot-group-table" tabIndex={0}><table><caption>Instant-runoff · first choices still in the count, by round</caption>
   <thead><tr><th>Option</th>{rounds.map(r=><th key={r.round}>Round {r.round}</th>)}</tr></thead>
   <tbody>{options.map(id=><tr key={id}><th>{name(id)}</th>{rounds.map(r=>{const n=votes(r,id),out=r.eliminated.includes(id);return <td key={r.round} className={out?'mot-runoff-out':undefined}>{n===undefined?'–':`${n}${out?' · out':''}`}</td>;})}</tr>)}
    <tr><th>Exhausted (no choices left)</th>{rounds.map(r=><td key={r.round}>{r.exhausted}</td>)}</tr></tbody></table></div>}
  <p className="m-muted t-1">Each round, the option with the fewest first choices is dropped and those households' next choices move over, until one option has more than half of the replies still in the count. Options tied for fewest drop together; there is no hidden tie-break. Advisory only: nothing is chosen, changed or booked.</p>
 </div>;
}

export function VotingMethodNotice({legacy=false}:{legacy?:boolean}){
 return <div className="m-muted t-1">
  <p>Read the same ranked replies two ways. <strong>Positional points</strong> (mot-household-sticker-points@1) favour the option most households rank well. <strong>Instant-runoff</strong> (mot-household-instant-runoff@1) drops the least-favourite option each round and moves those households' next choices over, until one has more than half.</p>
  <p>One household, one response. Points: unranked options get zero and unused points are not redistributed. Ties remain tied in both counts. Results are advisory: no automatic winner, itinerary change or booking. Approved/Maybe/Denied stay separate from both counts. Closed rounds keep their sealed points; their instant-runoff view is recounted from the sealed replies.</p>
  {legacy&&<p>Legacy positional round · no recorded open/close lifecycle. Start a new declared round to use explicit opening and sealed results.</p>}
 </div>;
}

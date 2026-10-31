export function VotingMethodNotice({legacy=false}:{legacy?:boolean}){
 return <div className="m-muted t-1">
  <p><strong>Positional points</strong> · mot-household-sticker-points@1. This is not instant-runoff voting.</p>
  <p>One household, one response. Unranked options get zero points; unused points are not redistributed. Ties remain tied. Totals are advisory: no automatic winner, itinerary change or booking. Approved/Maybe/Denied stay separate from rank points.</p>
  {legacy&&<p>Legacy positional round · no recorded open/close lifecycle. Start a new declared round to use explicit opening and sealed results.</p>}
 </div>;
}

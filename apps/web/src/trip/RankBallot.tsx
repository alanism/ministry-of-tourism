import {useState} from 'react';
import {ballotKey,readAllCards,readTripMeta,type Actor,type GroupBallot,type GroupPreferences,type TripSession} from '@writers-board/core';
import {Icon} from './ui';
import './rank-ballot.css';

type Props={session:TripSession;actor:Actor;refresh:()=>void;notify:(message:string)=>void;onClose:()=>void;notice?:string;exportBusy?:boolean;onOrganizer?:()=>void;onExport?:(key:Pick<GroupBallot,'proposal_version'|'round_id'|'household_id'>,format:'json'|'zip')=>void};

/** Selects reorder an existing shortlist. Adding at capacity must never discard a choice. */
export function changeRank(ballot:GroupBallot,optionId:string,rank:number,K:3|5):GroupBallot{
 const ordered=[...ballot.rankings].sort((a,b)=>a.rank-b.rank).map(r=>r.option_id).filter(id=>id!==optionId);
 if(rank){if(ordered.length>=K)throw new Error('Clear a rank before adding another option');ordered.splice(Math.min(rank-1,ordered.length),0,optionId);}
 return {...ballot,rankings:ordered.map((option_id,index)=>({option_id,rank:index+1}))};
}

function RoundSetup({session,actor,refresh,notify}:Omit<Props,'onClose'>){
 const meta=readTripMeta(session.doc),cards=readAllCards(session.parts).filter(c=>c.kind!=='brief'&&c.scope!=='private');
 const [names,setNames]=useState(''),[K,setK]=useState<3|5>(5),[chosen,setChosen]=useState(()=>new Set(cards.map(c=>c.id)));
 const declare=()=>{try{
  session.execute(actor,'trip_group_configure',{version:1,trip_id:meta.boardId,households:names.split('\n').map(name=>name.trim()).filter(Boolean).map(display_name=>({household_id:crypto.randomUUID(),display_name})),rounds:[{proposal_version:1,round_id:crypto.randomUUID(),kind:'city_venue',city_id:meta.cityId??meta.boardId,option_ids:[...chosen],rank_limit:K,household_weighting:'one_household_one_vote'}]});refresh();notify('City round declared');
 }catch(error){notify(error instanceof Error?error.message:'Could not declare this round');}};
 return <div className="mot-ballot-setup">
  <p>Choose the households and board cards for this city round. Each household has one response. Declared options and scale stay fixed.</p>
  <label>Households · one per line<textarea className="m-field" rows={3} maxLength={20000} value={names} onChange={e=>setNames(e.target.value)} /></label>
  <label>Rank scale<select className="m-field" aria-label="Rank scale" value={K} onChange={e=>setK(Number(e.target.value) as 3|5)}><option value={5}>5, 4, 3, 2, 1 points · up to five choices</option><option value={3}>3, 2, 1 points · up to three choices</option></select></label>
  <fieldset><legend>Options from your board</legend>{cards.length?cards.map(card=><label className="mot-ballot-check" key={card.id}><input type="checkbox" checked={chosen.has(card.id)} onChange={e=>setChosen(old=>{const next=new Set(old);if(e.target.checked)next.add(card.id);else next.delete(card.id);return next;})} />{card.title||card.id}</label>):<p className="m-muted">Add shared board cards first. Private cards stay private.</p>}</fieldset>
  <button type="button" className="m-btn primary" disabled={!names.trim()||!chosen.size} onClick={declare}>Declare city round</button>
 </div>;
}

function BallotEditor({session,actor,refresh,notify,group,round,householdId,onExport,exportBusy}:{session:TripSession;actor:Actor;refresh:()=>void;notify:Props['notify'];group:GroupPreferences;round:GroupPreferences['rounds'][number];householdId:string;onExport?:Props['onExport'];exportBusy?:boolean}){
 const key={proposal_version:round.proposal_version,round_id:round.round_id,household_id:householdId},saved=readTripMeta(session.doc).groupBallots?.find(b=>ballotKey(b)===ballotKey(key));
 const ballot=saved??{...key,rankings:[],stamps:[],shared_note:''},[note,setNote]=useState<string|null>(null);
 const cards=new Map(readAllCards(session.parts).map(c=>[c.id,c])),household=group.households.find(h=>h.household_id===householdId)!;
 const update=(next:GroupBallot)=>{try{session.execute(actor,'trip_ballot_update',next);refresh();}catch(error){notify(error instanceof Error?error.message:'Response could not be saved');}};
 return <section aria-label={`${household.display_name} response`}>
  <p className="mot-ballot-scale">Rank points: {round.rank_limit===5?'5, 4, 3, 2, 1':'3, 2, 1'}. Choose up to {round.rank_limit}; fewer choices are welcome.</p>
  <p role="status" className="mot-ballot-status">{!saved?'No response':ballot.rankings.length===round.rank_limit?'Complete shortlist':`Partial response · ${ballot.rankings.length} of ${round.rank_limit} ranked`} · {household.display_name}</p>
  <p className="m-muted t-1">Ranks express preference. Stamps express acceptability. Approved does not book, pay or share anything. Denied means this household must not be assumed to attend.</p>
  <div className="mot-ballot-options">{round.option_ids.map(optionId=>{
   const card=cards.get(optionId),title=card&&card.scope!=='private'?card.title||optionId:optionId,rank=ballot.rankings.find(r=>r.option_id===optionId)?.rank,stamp=ballot.stamps.find(s=>s.option_id===optionId)?.value??'';
   return <article className="mot-ballot-option" key={optionId} aria-label={title}>
    <div className="mot-ballot-title"><span className={`mot-rank-sticker${rank?' ranked':''}`} aria-hidden="true">{rank??'–'}</span><h3>{title}</h3></div>
    <div className="mot-ballot-controls">
     <label>Rank<select className="m-field" aria-label={`Rank ${title}`} value={rank??0} disabled={!rank&&ballot.rankings.length>=round.rank_limit} onChange={e=>update(changeRank(ballot,optionId,Number(e.target.value),round.rank_limit))}>
      <option value={0}>Unranked</option>{Array.from({length:Math.min(round.rank_limit,ballot.rankings.length+(rank?0:1))},(_,i)=><option key={i+1} value={i+1}>{i+1} · {round.rank_limit-i} points</option>)}
     </select></label>
     <label>Stamp<select className={`m-field mot-ballot-stamp ${stamp}`} aria-label={`Stamp ${title}`} value={stamp} onChange={e=>{const value=e.target.value as GroupBallot['stamps'][number]['value']|'';update({...ballot,stamps:[...ballot.stamps.filter(s=>s.option_id!==optionId),...(value?[{option_id:optionId,value}]:[])]});}}><option value="">No stamp</option><option value="approved">Approved</option><option value="maybe">Maybe</option><option value="denied">Denied</option></select></label>
    </div>
    {!rank&&ballot.rankings.length>=round.rank_limit&&<p className="m-muted t-1">Clear a rank to add this option.</p>}
   </article>;
  })}</div>
  <label className="mot-ballot-note">Shared note · optional<textarea className="m-field" rows={3} maxLength={4000} value={note??ballot.shared_note} onChange={e=>setNote(e.target.value)} /></label>
  <p className="m-muted t-1">Only this note is marked for your household response. Editing here keeps it on this device and in personal backups.</p>
  <div className="mot-ballot-actions">
   <button type="button" className="m-btn" disabled={note===null} onClick={()=>{update({...ballot,shared_note:note??ballot.shared_note});setNote(null);}}>Save shared note</button>
   {!saved&&<button type="button" className="m-btn" onClick={()=>update(ballot)}>Respond without ranks</button>}
   {saved&&<button type="button" className="m-btn" onClick={()=>{session.execute(actor,'trip_ballot_clear',key);setNote(null);refresh();}}>Remove response</button>}
  </div>
  {onExport&&<div className="mot-ballot-actions"><button type="button" className="m-btn" disabled={!saved||exportBusy} onClick={()=>onExport(key,'json')}>Export response JSON</button><button type="button" className="m-btn" disabled={!saved||exportBusy} onClick={()=>onExport(key,'zip')}>Export response ZIP</button></div>}
 </section>;
}

export function RankBallot({session,actor,refresh,notify,onClose,notice,onOrganizer,onExport,exportBusy}:Props){
 const group=readTripMeta(session.doc).groupPreferences,[roundKey,setRoundKey]=useState(''),[householdId,setHouseholdId]=useState('');
 const round=group?.rounds.find(r=>`${r.proposal_version}:${r.round_id}`===roundKey)??group?.rounds.at(-1),household=group?.households.find(h=>h.household_id===householdId)??group?.households[0];
 return <aside className="m-panel mot-sheet mot-ballot" aria-label="Group preferences">
  <div className="mot-sheet-head"><h2>Group preferences</h2><button type="button" className="m-icon-btn" aria-label="Close" onClick={onClose}><Icon name="close" /></button></div>
  <div className="mot-sheet-scroll">
   {onOrganizer&&<button type="button" className="m-btn" onClick={onOrganizer}>Organizer summary</button>}{notice&&<p role="status">{notice}</p>}
   {group&&round&&household?<>
    <div className="mot-ballot-selectors"><label>Round<select className="m-field" aria-label="Round" value={`${round.proposal_version}:${round.round_id}`} onChange={e=>setRoundKey(e.target.value)}>{group.rounds.map(r=><option key={`${r.proposal_version}:${r.round_id}`} value={`${r.proposal_version}:${r.round_id}`}>{r.kind==='destination'?'Destinations':`City: ${r.city_id}`} · proposal {r.proposal_version} · {r.rank_limit} ranks</option>)}</select></label>
    <label>Responding household<select className="m-field" aria-label="Responding household" value={household.household_id} onChange={e=>setHouseholdId(e.target.value)}>{group.households.map(h=><option key={h.household_id} value={h.household_id}>{h.display_name}</option>)}</select></label></div>
    <p className="m-muted t-1">One household, one response. Household names are labels, not verified identities.</p>
    <BallotEditor key={`${round.proposal_version}:${round.round_id}:${household.household_id}`} session={session} actor={actor} refresh={refresh} notify={notify} group={group} round={round} householdId={household.household_id} onExport={onExport} exportBusy={exportBusy} />
   </>:<RoundSetup session={session} actor={actor} refresh={refresh} notify={notify} />}
  </div>
  <div className="mot-sheet-foot"><button type="button" className="m-btn" disabled={!session.canUndo(actor.id)} onClick={()=>{session.undo(actor.id);refresh();notify('Undone');}}>Undo</button><button type="button" className="m-btn primary" onClick={onClose}>Done</button></div>
 </aside>;
}

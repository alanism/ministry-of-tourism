import {useLayoutEffect,useRef,useState} from 'react';
import {ballotKey,declareManagedRound,readAllCards,readTripMeta,votingRoundState,type Actor,type GroupBallot,type GroupPreferences,type TripSession} from '@writers-board/core';
import {Icon} from './ui';
import {VotingMethodNotice} from './VotingMethodNotice';
import {VotingHistory,VotingRoundControls} from './VotingRoundControls';
import {coverAssetId,useAssetUrl} from './trip-assets';
import {CONCERN_LABELS,addFavorite,favorites,moveFavorite,orderAnnouncement,ordinal,rankPoints,removeFavorite,ruleSentence,setConcern,trayStatus,type Concern} from './ballot-tray';
import './rank-ballot.css';

type Props={session:TripSession;actor:Actor;refresh:()=>void;notify:(message:string)=>void;onClose:()=>void;notice?:string;exportBusy?:boolean;onOrganizer?:()=>void;onExport?:(key:Pick<GroupBallot,'proposal_version'|'round_id'|'household_id'>,format:'json'|'zip')=>void};

/** Selects reorder an existing shortlist. Adding at capacity must never discard a choice. */
export function changeRank(ballot:GroupBallot,optionId:string,rank:number,K:3|5):GroupBallot{
 const ordered=[...ballot.rankings].sort((a,b)=>a.rank-b.rank).map(r=>r.option_id).filter(id=>id!==optionId);
 if(rank){if(ordered.length>=K)throw new Error('Clear a rank before adding another option');ordered.splice(Math.min(rank-1,ordered.length),0,optionId);}
 return {...ballot,rankings:ordered.map((option_id,index)=>({option_id,rank:index+1}))};
}

/** Display names are labels, not identities: repeated names show their stable household ID so a response cannot be entered for the wrong household. */
export function householdLabels(households:readonly {household_id:string;display_name:string}[]){
 const count=new Map<string,number>();for(const h of households){const k=h.display_name.trim().toLowerCase();count.set(k,(count.get(k)??0)+1);}
 return new Map(households.map(h=>[h.household_id,(count.get(h.display_name.trim().toLowerCase())??0)>1?`${h.display_name} · ${h.household_id}`:h.display_name]));
}

function RoundSetup({session,actor,refresh,notify}:Omit<Props,'onClose'>){
 const meta=readTripMeta(session.doc),cards=readAllCards(session.parts).filter(c=>c.kind!=='brief'&&c.scope!=='private');
 const [names,setNames]=useState(''),[K,setK]=useState<3|5>(5),[chosen,setChosen]=useState(()=>new Set(cards.map(c=>c.id)));
 const declare=()=>{try{
  declareManagedRound(session,actor,{version:1,trip_id:meta.boardId,households:names.split('\n').map(name=>name.trim()).filter(Boolean).map(display_name=>({household_id:crypto.randomUUID(),display_name})),rounds:[{proposal_version:1,round_id:crypto.randomUUID(),kind:'city_venue',city_id:meta.cityId??meta.boardId,option_ids:[...chosen],rank_limit:K,household_weighting:'one_household_one_vote'}]});refresh();notify('City round declared as a draft. Open voting explicitly before responding.');
 }catch(error){notify(error instanceof Error?error.message:'Could not declare this round');}};
 return <div className="mot-ballot-setup">
  <VotingMethodNotice />
  <p>Choose the households and board cards for this city round. Each household has one response. Declared options and scale stay fixed.</p>
  <label>Households · one per line<textarea className="m-field" rows={3} maxLength={20000} value={names} onChange={e=>setNames(e.target.value)} /></label>
  <label>Rank scale<select className="m-field" aria-label="Rank scale" value={K} onChange={e=>setK(Number(e.target.value) as 3|5)}><option value={5}>5, 4, 3, 2, 1 points · up to five choices</option><option value={3}>3, 2, 1 points · up to three choices</option></select></label>
  <fieldset><legend>Options from your board</legend>{cards.length?cards.map(card=><label className="mot-ballot-check" key={card.id}><input type="checkbox" checked={chosen.has(card.id)} onChange={e=>setChosen(old=>{const next=new Set(old);if(e.target.checked)next.add(card.id);else next.delete(card.id);return next;})} />{card.title||card.id}</label>):<p className="m-muted">Add shared board cards first. Private cards stay private.</p>}</fieldset>
  <button type="button" className="m-btn primary" disabled={!names.trim()||!chosen.size} onClick={declare}>Declare city round</button>
 </div>;
}

type Card=Parameters<typeof coverAssetId>[0];
function PostcardImage({session,card,title}:{session:TripSession;card:Card|undefined;title:string}){
 const url=useAssetUrl(session,card?coverAssetId(card):undefined);
 if(!url)return <div className="mot-ballot-card-band" aria-hidden="true">{(title.match(/[A-Za-z0-9]/)?.[0]??'?').toUpperCase()}</div>;
 return <figure className="mot-ballot-card-figure"><img alt="" src={url} /><figcaption className="m-muted t-1">{card?.source?.kind==='artwork'||card?.source?.origin==='artwork'?'Artwork':'Photo from your board'}</figcaption></figure>;
}
function excerptOf(body:string):string{if(body.length<=160)return body;const cut=body.slice(0,160),at=cut.lastIndexOf(' ');return `${cut.slice(0,at>0?at:160).trimEnd()}…`;}
const points=(n:number)=>`${n} ${n===1?'point':'points'}`;

function BallotEditor({session,actor,refresh,notify,group,round,householdId,onExport,exportBusy}:{session:TripSession;actor:Actor;refresh:()=>void;notify:Props['notify'];group:GroupPreferences;round:GroupPreferences['rounds'][number];householdId:string;onExport?:Props['onExport'];exportBusy?:boolean}){
 const K=round.rank_limit,key={proposal_version:round.proposal_version,round_id:round.round_id,household_id:householdId},saved=readTripMeta(session.doc).groupBallots?.find(b=>ballotKey(b)===ballotKey(key));
 const ballot=saved??{...key,rankings:[],stamps:[],shared_note:''},[note,setNote]=useState<string|null>(null),[announcement,setAnnouncement]=useState(''),[,setTick]=useState(0);
 const pendingFocus=useRef<{key:string,block:'nearest'|'start'}|null>(null);
 useLayoutEffect(()=>{if(!pendingFocus.current)return;const {key:focusKey,block}=pendingFocus.current;const el=document.querySelector(`[data-focus="${focusKey}"]`) as HTMLElement|null;pendingFocus.current=null;if(el){el.focus();el.scrollIntoView?.({block});}});
 const status=votingRoundState(session,round),historical=status!=='legacy'&&round.proposal_version<Math.max(...group.rounds.map(r=>r.proposal_version)),readOnly=status==='draft'||status==='closed'||historical;
 const cards=new Map(readAllCards(session.parts).map(c=>[c.id,c])),household=group.households.find(h=>h.household_id===householdId)!,label=householdLabels(group.households).get(householdId)??household.display_name;
 const titleOf=(optionId:string)=>{const card=cards.get(optionId);return card&&card.scope!=='private'?card.title||optionId:optionId;};
 const update=(next:GroupBallot)=>{try{session.execute(actor,'trip_ballot_update',next);refresh();}catch(error){notify(error instanceof Error?error.message:'Response could not be saved');}};
 const act=(next:GroupBallot,message:string,focus?:string)=>{pendingFocus.current=focus?{key:focus,block:'nearest'}:null;try{session.execute(actor,'trip_ballot_update',next);setAnnouncement(message);refresh();}catch(error){pendingFocus.current=null;notify(error instanceof Error?error.message:'Response could not be saved');}};
 const fail=(error:unknown)=>setAnnouncement(error instanceof Error?error.message:'Something went wrong');
 const add=(optionId:string)=>{try{const next=addFavorite(ballot,optionId,K),rank=next.rankings.find(r=>r.option_id===optionId)!.rank;act(next,`${titleOf(optionId)} added as your ${ordinal(rank)} favorite, ${points(rankPoints(rank,K))}.`,`chip-${optionId}`);}catch(error){fail(error);}};
 const move=(optionId:string,direction:'earlier'|'later')=>{try{const next=moveFavorite(ballot,optionId,direction);if(next===ballot)return;act(next,orderAnnouncement(next,titleOf),`move-${direction}-${optionId}`);}catch(error){fail(error);}};
 const remove=(optionId:string,fromTray:boolean)=>{const before=favorites(ballot),index=before.indexOf(optionId),next=removeFavorite(ballot,optionId);if(next===ballot)return;const message=`${titleOf(optionId)} removed. ${orderAnnouncement(next,titleOf)}`;if(!fromTray){act(next,message,`add-${optionId}`);return;}const after=favorites(next),target=after[index]??after[after.length-1];act(next,message,target?`tray-remove-${target}`:'tray-heading');};
 const concern=(optionId:string,value:Concern|null)=>{const next=setConcern(ballot,optionId,value);act(next,value?`${titleOf(optionId)}: ${CONCERN_LABELS[value].plain}.`:`${titleOf(optionId)}: answer cleared.`);};
 const go=(focus:string)=>{pendingFocus.current={key:focus,block:'start'};setTick(t=>t+1);};
 const favs=favorites(ballot),answered=ballot.stamps.filter(s=>round.option_ids.includes(s.option_id)),notAnswered=round.option_ids.length-answered.length,firstId=round.option_ids[0];
 return <section aria-label={`${label} response`}>
  {readOnly&&<p role="status">{status==='closed'?'This round is closed. The sealed result is retained; start a new round for a fresh response.':historical?'This proposal is historical. Start a new round for fresh responses.':'This round is a draft. Open voting before responding.'}</p>}
  <div aria-live="polite" className="visually-hidden">{announcement}</div>
  <p className="mot-ballot-rule">{ruleSentence(K)}</p>
  <details className="mot-points"><summary>How points work</summary><p>Rank points: {K===5?'5, 4, 3, 2, 1.':'3, 2, 1.'}</p><p>Places you don't pick get 0 points; unused points aren't passed to anyone; tied totals stay tied; favorites and "Works for us?" answers are separate, so a favorite can still be something that doesn't work, and an unpicked place can still work fine.</p></details>
  <p role="status" className="mot-ballot-status">{!saved?'No response yet':trayStatus(ballot,K)} · {label}</p>
  <fieldset disabled={readOnly} className="mot-ballot-editable"><legend className="visually-hidden">Favorites and acceptability</legend><section className="mot-tray" data-test="tray" aria-labelledby="mot-tray-heading"><h3 id="mot-tray-heading" tabIndex={-1} data-focus="tray-heading">Your favorites</h3>{!favs.length&&<p className="m-muted t-1 mot-tray-hint">{trayStatus(ballot,K)}</p>}<ol className="mot-tray-list">{Array.from({length:K},(_,i)=>{const rank=i+1,optionId=favs[i];if(!optionId)return <li className="mot-tray-empty" key={rank}>{ordinal(rank)} · {points(rankPoints(rank,K))} · add a place below</li>;const title=titleOf(optionId);return <li className="mot-tray-item" data-test="tray-item" data-option={optionId} key={optionId}><div className="mot-tray-main"><span className="mot-tray-badge" aria-hidden="true">{ordinal(rank)}</span><span className="mot-tray-text"><span className="mot-tray-title">{title}</span><span className="m-muted t-1">{points(rankPoints(rank,K))}</span></span></div><span className="mot-tray-actions"><button type="button" className="m-btn" aria-label={`Move ${title} earlier`} data-focus={`move-earlier-${optionId}`} {...(rank===1?{'aria-disabled':true as const}:{})} onClick={()=>{if(rank!==1)move(optionId,'earlier');}}><span aria-hidden="true">↑</span> Earlier</button><button type="button" className="m-btn" aria-label={`Move ${title} later`} data-focus={`move-later-${optionId}`} {...(rank===favs.length?{'aria-disabled':true as const}:{})} onClick={()=>{if(rank!==favs.length)move(optionId,'later');}}><span aria-hidden="true">↓</span> Later</button><button type="button" className="m-btn" aria-label={`Remove ${title}`} data-focus={`tray-remove-${optionId}`} onClick={()=>remove(optionId,true)}>Remove</button></span></li>;})}</ol></section>
  <div className="mot-postcards">{round.option_ids.map(optionId=>{
   const card=cards.get(optionId),hidden=!card||card.scope==='private',title=titleOf(optionId),rank=ballot.rankings.find(r=>r.option_id===optionId)?.rank,stamp=ballot.stamps.find(s=>s.option_id===optionId)?.value,headingId=`postcard-title-${optionId}`,body=hidden?'':card.body.trim();
   return <article className={`mot-ballot-card${rank?' ranked':''}`} data-test="postcard" data-option={optionId} aria-labelledby={headingId} key={optionId}>
    <PostcardImage session={session} card={hidden?undefined:card} title={title} />
    <h3 id={headingId} tabIndex={-1} data-focus={`title-${optionId}`}>{title}</h3>
    {body&&<p className="mot-ballot-card-excerpt">{excerptOf(body)}</p>}
    {rank?<><div className="mot-fav-row"><p className="mot-fav-chip" tabIndex={-1} data-focus={`chip-${optionId}`}>Your {ordinal(rank)} favorite · {points(rankPoints(rank,K))}</p></div><div className="mot-remove-row"><button type="button" className="mot-text-btn" data-focus={`remove-postcard-${optionId}`} onClick={()=>remove(optionId,false)}>Remove from favorites</button></div></>:favs.length>=K?<p className="m-muted t-1">{trayStatus(ballot,K)}</p>:<button type="button" className="m-btn mot-add-btn" data-focus={`add-${optionId}`} onClick={()=>add(optionId)}><span aria-hidden="true">+</span> Add to favorites</button>}
    <details className="mot-concern"><summary>Works for us? <span className={stamp==='denied'?'mot-concern-denied':undefined}>{stamp?CONCERN_LABELS[stamp].plain:'Not answered'}</span></summary><fieldset><legend>{`Does ${title} work for your household?`}</legend><label className="mot-radio"><input type="radio" name={`concern-${optionId}`} checked={!stamp} onChange={()=>concern(optionId,null)} />No stamp (not answered)</label>{(Object.keys(CONCERN_LABELS) as Concern[]).map(value=><label className="mot-radio" key={value}><input type="radio" name={`concern-${optionId}`} checked={stamp===value} onChange={()=>concern(optionId,value)} />{CONCERN_LABELS[value].plain} <small>· {CONCERN_LABELS[value].stamp} stamp</small></label>)}</fieldset></details>
   </article>;
  })}</div></fieldset>
  <label className="mot-ballot-note">Shared note · optional<textarea disabled={readOnly} className="m-field" rows={3} maxLength={4000} value={note??ballot.shared_note} onChange={e=>setNote(e.target.value)} /></label>
  <p className="m-muted t-1">Only this note is marked for your household response. Editing here keeps it on this device and in personal backups.</p>
  <div className="mot-ballot-actions">
   <button type="button" className="m-btn" disabled={readOnly||note===null} onClick={()=>{update({...ballot,shared_note:note??ballot.shared_note});setNote(null);}}>Save shared note</button>
   {!saved&&<button type="button" className="m-btn" disabled={readOnly} onClick={()=>update(ballot)}>Respond without ranks</button>}
   {saved&&<button type="button" className="m-btn" disabled={readOnly} onClick={()=>{session.execute(actor,'trip_ballot_clear',key);setNote(null);refresh();}}>Remove response</button>}
  </div>
  <section className="mot-reply-review" data-test="review" aria-labelledby="mot-review-heading"><h3 id="mot-review-heading">Check your reply</h3><p>{label}</p>{favs.length?<ul className="mot-review-list">{favs.map((optionId,i)=><li key={optionId}>{ordinal(i+1)} · {titleOf(optionId)} · {points(rankPoints(i+1,K))}</li>)}</ul>:<p>No favorites picked</p>}{answered.length>0&&<ul className="mot-review-list">{answered.map(s=><li key={s.option_id}>{titleOf(s.option_id)}: {CONCERN_LABELS[s.value].plain}</li>)}</ul>}{notAnswered>0&&<p>{notAnswered} {notAnswered===1?'place':'places'} not answered</p>}<p>{ballot.shared_note||'No shared note'}</p><p>The reply file holds this household's favorites, answers and shared note for this round, with the IDs the organizer needs to count it. It doesn't book anything.</p><div className="mot-ballot-actions"><button type="button" className="m-btn" onClick={()=>go('tray-heading')}>Change favorites</button>{firstId&&<button type="button" className="m-btn" onClick={()=>go(`title-${firstId}`)}>Change answers</button>}</div>{onExport&&<div className="mot-ballot-actions"><button type="button" className="m-btn" disabled={readOnly||!saved||exportBusy} onClick={()=>onExport(key,'json')} aria-label="Export response JSON">Download reply file</button><button type="button" className="m-btn" disabled={readOnly||!saved||exportBusy} onClick={()=>onExport(key,'zip')} aria-label="Export response ZIP">Download as ZIP</button></div>}<p className="m-muted t-1">Downloading makes a file on this device. The organizer gets your reply only when you send it to them; MoT can't see whether they have.</p><details><summary>Technical details</summary><ul className="mot-review-list"><li>Round ID: {round.round_id}</li><li>Proposal version: {round.proposal_version}</li><li>Household ID: {householdId}</li>{ballot.stamps.map(s=><li key={s.option_id}>{s.option_id}: {s.value}</li>)}</ul></details></section>
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
    <label>Responding household<select className="m-field" aria-label="Responding household" value={household.household_id} onChange={e=>setHouseholdId(e.target.value)}>{(()=>{const labels=householdLabels(group.households);return group.households.map(h=><option key={h.household_id} value={h.household_id}>{labels.get(h.household_id)}</option>);})()}</select></label></div>
    <p className="m-muted t-1">One household, one response. Household names are labels, not verified identities.</p>
    <VotingRoundControls session={session} actor={actor} round={round} refresh={refresh} notify={notify} onRoundChange={key=>setRoundKey(`${key.proposal_version}:${key.round_id}`)} />
    <BallotEditor key={`${round.proposal_version}:${round.round_id}:${household.household_id}`} session={session} actor={actor} refresh={refresh} notify={notify} group={group} round={round} householdId={household.household_id} onExport={onExport} exportBusy={exportBusy} />
   </>:<RoundSetup session={session} actor={actor} refresh={refresh} notify={notify} />}
   <VotingHistory session={session} actor={actor} refresh={refresh} notify={notify} onRoundChange={key=>setRoundKey(`${key.proposal_version}:${key.round_id}`)} />
  </div>
  <div className="mot-sheet-foot"><button type="button" className="m-btn" disabled={!session.canUndo(actor.id)} onClick={()=>{session.undo(actor.id);refresh();notify('Undone');}}>Undo</button><button type="button" className="m-btn primary" onClick={onClose}>Done</button></div>
 </aside>;
}

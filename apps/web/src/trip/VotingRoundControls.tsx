import {useEffect,useRef,useState} from 'react';
import {cancelVotingClose,commitVotingClose,getVotingRoundView,openVotingRound,prepareVotingClose,readAllCards,readTripMeta,readVotingSeals,startNextVotingRound,votingRoundState,type Actor,type TripSession} from '@writers-board/core';
import {VotingMethodNotice} from './VotingMethodNotice';

export type VotingKey={proposal_version:number;round_id:string};
export type VotingView=Awaited<ReturnType<typeof getVotingRoundView>>;
type Preview=Awaited<ReturnType<typeof prepareVotingClose>>;
type Props={session:TripSession;actor:Actor;round:VotingKey;refresh:()=>void;notify:(message:string)=>void;onRoundChange?:(key:VotingKey)=>void};

export function useVotingRound(session:TripSession,round:VotingKey|undefined){
 const [view,setView]=useState<VotingView|null>(null),[error,setError]=useState('');
 const revision=session.boardRev,roundId=round?.round_id,proposal=round?.proposal_version;
 useEffect(()=>{
  let current=true;setView(null);setError('');
  if(roundId!==undefined&&proposal!==undefined)void getVotingRoundView(session,{round_id:roundId,proposal_version:proposal}).then(next=>{if(current)setView(next);},cause=>{if(current)setError(cause instanceof Error?cause.message:'Voting result unavailable.');});
  return()=>{current=false;};
 },[session,revision,roundId,proposal]);
 return {view,error};
}

function TallyTable({tally,session}:{tally:NonNullable<VotingView['tally']>;session:TripSession}){
 const cards=new Map(readAllCards(session.parts).filter(card=>card.scope!=='private').map(card=>[card.id,card]));
 return <div className="mot-group-table" tabIndex={0}><table><caption>Positional points · advisory result</caption><thead><tr><th>Option</th><th>Points</th><th>Approved</th><th>Maybe</th><th>Denied</th></tr></thead><tbody>{tally.options.map(option=><tr key={option.option_id}><th title={option.option_id}>{cards.get(option.option_id)?.title||option.option_id}</th><td>{option.points}</td><td>{option.stamps.approved.length}</td><td>{option.stamps.maybe.length}</td><td>{option.stamps.denied.length}</td></tr>)}</tbody></table></div>;
}

export function VotingRoundControls({session,actor,round,refresh,notify,onRoundChange}:Props){
 const key={proposal_version:round.proposal_version,round_id:round.round_id};
 const {view,error}=useVotingRound(session,round),status=votingRoundState(session,round);
 const historical=status!=='legacy'&&status!=='closed'&&round.proposal_version<Math.max(...(readTripMeta(session.doc).groupPreferences?.rounds.map(r=>r.proposal_version)??[]));
 const [busy,setBusy]=useState(false),[preview,setPreview]=useState<Preview|null>(null),[newRound,setNewRound]=useState(false);
 const pending=useRef<AbortController|null>(null),held=useRef<Preview|null>(null),origin=useRef<HTMLButtonElement|null>(null);
 const revision=session.boardRev;
 const cancel=()=>{pending.current?.abort();pending.current=null;if(held.current)cancelVotingClose(held.current);held.current=null;setPreview(null);setBusy(false);requestAnimationFrame(()=>origin.current?.focus());};
 useEffect(()=>{
  setPreview(null);setBusy(false);setNewRound(false);
  return()=>{pending.current?.abort();pending.current=null;if(held.current)cancelVotingClose(held.current);held.current=null;};
 },[session,actor.id,actor.kind,round.round_id,round.proposal_version,revision]);
 const run=(action:()=>unknown,message:string)=>{try{action();refresh();notify(message);}catch(cause){notify(cause instanceof Error?cause.message:'Voting update failed. Current data is retained.');}};
 const prepare=async()=>{
  const controller=new AbortController();pending.current=controller;setBusy(true);
  try{const next=await prepareVotingClose(session,actor,key,{signal:controller.signal});if(controller.signal.aborted){cancelVotingClose(next);return;}held.current=next;setPreview(next);}
  catch(cause){if(!controller.signal.aborted)notify(cause instanceof Error?cause.message:'Closing preview unavailable. Nothing closed.');}
  finally{if(pending.current===controller){pending.current=null;setBusy(false);}}
 };
 const close=()=>{if(!preview)return;try{commitVotingClose(session,actor,preview);held.current=null;setPreview(null);refresh();notify('Round closed in this tab. Its sealed result is retained; check the device-save status.');}catch(cause){cancel();notify(cause instanceof Error?cause.message:'Closing failed. Prepare a fresh preview.');}};
 return <section aria-label="Voting round controls">
  <VotingMethodNotice legacy={status==='legacy'} />
  {error&&<p role="alert">{error}</p>}
  {historical&&<p>Historical proposal · responses remain in history. Start a new round for fresh responses.</p>}
  {status==='draft'&&!historical&&<><p>Draft · no responses count until you explicitly open voting.</p><button type="button" className="m-btn" onClick={()=>run(()=>openVotingRound(session,actor,key),'Voting opened in this tab. Results remain provisional.')}>Open voting</button></>}
  {status==='open'&&!historical&&<><p>Open · provisional results. Pending or conflicted replies are not consent.</p><button ref={origin} type="button" className="m-btn" disabled={busy||!!preview} onClick={()=>void prepare()}>{busy?'Preparing close preview…':'Review closing'}</button></>}
  {status==='closed'&&<p><strong>Closed · sealed result.</strong> Ordinary Undo cannot reopen this result. Start a new round to revise.</p>}
  {!!view?.lateCount&&<p role="alert">{view.lateCount} late repl{view.lateCount===1?'y is':'ies are'} retained but uncounted. Review any new concerns in a fresh round before making a plan; the sealed result does not grant attendance or consent.</p>}
  {view?.lateHasDenied&&<p role="alert">A late reply includes Denied. Do not assume attendance; review this concern in a fresh round.</p>}
  {view?.seal&&<p>Closed by local actor {view.seal.closedBy} at {view.seal.closedAt}. This records closure in the document; check the device-save status.</p>}
  {preview&&<section aria-label="Close round preview"><h3>Confirm the final tally</h3><p>Closed results are retained. Ordinary Undo cannot erase or reopen them. Pending, partial and conflicting replies remain explicit; closing does not create agreement.</p><p>{preview.tally.coverage.responding} responding · {preview.tally.coverage.pending} pending · {preview.tally.coverage.conflicting} conflicting · {preview.tally.coverage.needs_resolution} needing resolution</p><TallyTable tally={preview.tally} session={session} /><div className="mot-ballot-actions"><button type="button" className="m-btn primary" onClick={close}>Close this round</button><button type="button" className="m-btn" onClick={cancel}>Cancel closing</button></div></section>}
  {(status==='legacy'||status==='closed'||status==='open')&&!preview&&<button type="button" className="m-btn" onClick={()=>setNewRound(true)}>{status==='legacy'?'Start a declared round':'Start a new round'}</button>}
  {newRound&&<section aria-label="New voting proposal"><p>This starts a new proposal version. All earlier-version rounds become historical, including other city rounds. No prior responses are copied or counted. The selected options and rank scale are retained in a new draft for fresh responses.</p><button type="button" className="m-btn primary" onClick={()=>run(()=>{const next=startNextVotingRound(session,actor,key);onRoundChange?.(next);setNewRound(false);},'New proposal draft created in this tab. Open it explicitly before responding.')}>Create new proposal draft</button><button type="button" className="m-btn" onClick={()=>setNewRound(false)}>Cancel new round</button></section>}
 </section>;
}

/** Seals remain visible even if ordinary Undo removed the live configuration. */
export function VotingHistory({session,actor,refresh,notify,onRoundChange}:Omit<Props,'round'>){
 const [seals,setSeals]=useState<Awaited<ReturnType<typeof readVotingSeals>>>([]),[error,setError]=useState('');const revision=session.boardRev;
 useEffect(()=>{let current=true;setError('');void readVotingSeals(session).then(rows=>{if(current)setSeals(rows);},cause=>{if(current)setError(cause instanceof Error?cause.message:'Closed result history unavailable.');});return()=>{current=false;};},[session,revision]);
 if(error)return <p role="alert">{error}</p>;
 if(!seals.length)return null;
 const rounds=readTripMeta(session.doc).groupPreferences?.rounds??[];
 return <section aria-label="Closed voting history"><h3>Closed voting history</h3>{seals.map(seal=><details key={`${seal.trip_id}:${seal.proposal_version}:${seal.round_id}`}><summary>Proposal {seal.proposal_version} · {seal.round_id} · sealed result</summary><p>Closed by local actor {seal.closedBy} at {seal.closedAt}.</p><p>{seal.tally.coverage.responding} responding · {seal.tally.coverage.pending} pending · {seal.tally.coverage.conflicting} conflicting · {seal.tally.coverage.needs_resolution} needing resolution</p><TallyTable tally={seal.tally} session={session} />{!rounds.some(round=>round.round_id===seal.round_id&&round.proposal_version===seal.proposal_version)&&<VotingRoundControls session={session} actor={actor} round={seal} refresh={refresh} notify={notify} onRoundChange={onRoundChange} />}</details>)}</section>;
}

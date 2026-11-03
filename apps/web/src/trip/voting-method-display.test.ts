import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,it,expect} from 'vitest';
import {createTrip,declareManagedRound,encodeTrip,openVotingRound,startNextVotingRound,TripSession,type Actor,type GroupPreferences} from '@mot/core';
import {RankBallot} from './RankBallot';
import {VotingRoundControls} from './VotingRoundControls';

const human:Actor={kind:'human',id:'organizer',name:'Organizer'};
const group:GroupPreferences={version:1,trip_id:'voting-display',households:[{household_id:'h1',display_name:'Family'}],rounds:[{round_id:'city-round',proposal_version:1,kind:'city_venue',city_id:'bangkok',option_ids:['a','b','c'],rank_limit:3,household_weighting:'one_household_one_vote'}]};
function render(groupPreferences?:GroupPreferences){
 const session=new TripSession(createTrip({boardId:'voting-display',title:'Holiday',city:'Bangkok',timeZone:'Asia/Bangkok',groupPreferences}));
 const before=encodeTrip(session.doc);
 try{
  const html=renderToStaticMarkup(React.createElement(RankBallot,{session,actor:human,refresh:()=>{},notify:()=>{},onClose:()=>{}}));
  expect(encodeTrip(session.doc)).toEqual(before);
  return html;
 }finally{session.destroy();session.doc.destroy();}
}
describe('declared voting method before response entry',()=>{
 it('names positional points and its version before declaring a new round',()=>{
  const html=render();
  expect(html).toContain('Positional points');
  expect(html).toContain('mot-household-sticker-points@1');
  expect(html).toContain('mot-household-instant-runoff@1');
  expect(html).toContain('Instant-runoff');
 });
 it('labels old rounds without inventing historical open or close events',()=>{
  const html=render(group);
  expect(html).toContain('Legacy positional round');
  expect(html).toContain('no recorded open/close lifecycle');
 });
 it('explains advisory totals, explicit ties and independent stamps before ranking',()=>{
  const html=render(group);
  expect(html).toContain('Ties remain tied');
  expect(html).toContain('advisory');
  expect(html).toContain('Denied');
  expect(html).toContain('no automatic winner');
 });
});

it('labels an older managed proposal as historical and does not offer Open or Close',()=>{
 const session=new TripSession(createTrip({boardId:group.trip_id,title:'Historical',city:'Bangkok',timeZone:null}));
 try{
  declareManagedRound(session,human,group);const key={proposal_version:1,round_id:'city-round'};openVotingRound(session,human,key);startNextVotingRound(session,human,key);
  const before=encodeTrip(session.doc),html=renderToStaticMarkup(React.createElement(VotingRoundControls,{session,actor:human,round:group.rounds[0]!,refresh:()=>{},notify:()=>{}}));
  expect(html).toContain('Historical proposal');expect(html).not.toContain('Review closing');expect(html).not.toContain('Open voting');expect(encodeTrip(session.doc)).toEqual(before);
 }finally{session.destroy();session.doc.destroy();}
});

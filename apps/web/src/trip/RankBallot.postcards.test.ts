import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {expect,it} from 'vitest';
import {createTrip,TripSession} from '@writers-board/core';
import {RankBallot} from './RankBallot';
const actor={kind:'human' as const,id:'person',name:'Person'};
type Seeded={session:TripSession;ids:Record<string,string>};
function seed(K:3|5=3,hostile=false):Seeded{
 const session=new TripSession(createTrip({title:'City trip',city:'Lisbon',timeZone:null,boardId:'ballot-trip'}));
 const create=(title:string,body:string,scope?:'private')=>session.execute<{id:string}>(actor,'trip_card_create',{kind:'place',title,body,stage:'explore',provenance:'traveler',...(scope?{scope}:{})}).id;
 const ids={porto:create(hostile?'<script>alert("x")</script> Porto':'Porto','Porto has trams, tiled streets and a long riverfront worth exploring on foot together.'),lisbon:create('Lisbon','Lisbon body for the household to read.'),seville:create('Seville','Seville body for the household to read.'),madrid:create('Madrid','Madrid body for the household to read.'),secret:create('Secret Hideaway','Private body that must never be shown', 'private')};
 const option_ids=[ids.seville!,ids.porto!,ids.lisbon!,'missing-option',ids.madrid!,ids.secret!].slice(0,K===3?5:6);
 session.execute(actor,'trip_group_configure',{version:1,trip_id:'ballot-trip',households:[{household_id:'household-a',display_name:'Family A'}],rounds:[{round_id:'venues',proposal_version:1,kind:'city_venue',city_id:'lisbon',option_ids,rank_limit:K,household_weighting:'one_household_one_vote'}]});
 return {session,ids};
}
function render(session:TripSession){return renderToStaticMarkup(createElement(RankBallot,{session,actor,refresh:()=>{},notify:()=>{},onClose:()=>{},onExport:()=>{}}));}
function save(session:TripSession,rankings:{option_id:string;rank:number}[],stamps:{option_id:string;value:'approved'|'maybe'|'denied'}[]=[],shared_note=''){
 session.execute(actor,'trip_ballot_update',{proposal_version:1,round_id:'venues',household_id:'household-a',rankings,stamps,shared_note});
}
function postcardIds(html:string){return [...html.matchAll(/data-test="postcard" data-option="([^"]+)"/g)].map(m=>m[1]!);}
function postcard(html:string,id:string){const start=html.indexOf(`data-test="postcard" data-option="${id}"`);expect(start).toBeGreaterThanOrEqual(0);const next=html.indexOf('data-test="postcard"',start+1);return html.slice(start,next<0?html.length:next);}
function buttonTag(html:string,label:string){return [...html.matchAll(/<button[^>]*>/g)].map(m=>m[0]).find(tag=>tag.includes(`aria-label="${label}"`))??'';}
it('renders the K=3 rule, points explanation, status and empty tray slots',()=>{
 const {session}=seed(3),html=render(session);
 expect(html).toContain('Pick up to three favorites: 1st gets 3 points, then 2 and 1. Your household has one reply.');
 expect(html).toContain('How points work');expect(html).toContain('Rank points: 3, 2, 1.');
 expect(html).toContain('get 0 points');expect(html).toContain('passed to anyone');expect(html).toContain('tied');expect(html).toContain('separate');
 expect(html).toContain('No response yet · Family A');expect(html).toContain('data-test="tray"');expect(html).toContain('Your favorites');
 expect(html).toContain('1st · 3 points · add a place below');expect(html).toContain('2nd · 2 points · add a place below');
 expect(html).not.toContain('data-test="tray-item"');
});
it('renders the K=5 rule and points explanation',()=>{
 const {session}=seed(5),html=render(session);
 expect(html).toContain('Pick up to five favorites: 1st gets 5 points, then 4, 3, 2 and 1. Your household has one reply.');
 expect(html).toContain('Rank points: 5, 4, 3, 2, 1.');expect(html).toContain('No favorites yet. Pick up to five.');
 expect(html).toContain('5th');expect(html).toContain('add a place below');
});
it('keeps postcards in declared order, including a missing card, and offers Add to favorites',()=>{
 const {session,ids}=seed(3),html=render(session),declared=[ids.seville!,ids.porto!,ids.lisbon!,'missing-option',ids.madrid!];
 expect(postcardIds(html)).toEqual(declared);
 expect(html.match(/Add to favorites/g)).toHaveLength(declared.length);
 expect(postcard(html,'missing-option')).toContain('missing-option');
 expect(postcard(html,ids.porto!)).toContain('Porto has trams, tiled streets');
 expect(html).toContain('aria-live="polite"');
});
it('shows a short no-image band with the place initial instead of a large empty frame',()=>{
 const {session,ids}=seed(3),html=render(session),card=postcard(html,ids.porto!);
 expect(card).toMatch(/>[P]</);expect(card).not.toContain('<img');expect(html).not.toContain('<img');
 expect(postcard(html,ids.lisbon!)).toMatch(/>[L]</);expect(postcard(html,ids.seville!)).toMatch(/>[S]</);
});
it('renders filled tray slots with points, named controls and aria-disabled only at the edges',()=>{
 const {session,ids}=seed(3);save(session,[{option_id:ids.porto!,rank:1},{option_id:ids.lisbon!,rank:2}]);
 const html=render(session),tray=html.slice(html.indexOf('data-test="tray"'),html.indexOf('mot-postcards'));
 expect(tray.match(/data-test="tray-item"/g)).toHaveLength(2);
 expect(tray.indexOf(`data-option="${ids.porto!}"`)).toBeLessThan(tray.indexOf(`data-option="${ids.lisbon!}"`));
 expect(tray).toContain('1st');expect(tray).toContain('3 points');expect(tray).toContain('Porto');
 expect(tray).toContain('2nd');expect(tray).toContain('2 points');expect(tray).toContain('Lisbon');expect(tray).toContain('3rd · 1 point');
 expect(buttonTag(html,'Move Porto earlier')).toContain('aria-disabled="true"');expect(buttonTag(html,'Move Porto later')).not.toContain('aria-disabled="true"');
 expect(buttonTag(html,'Move Lisbon earlier')).not.toContain('aria-disabled="true"');expect(buttonTag(html,'Move Lisbon later')).toContain('aria-disabled="true"');
 for(const label of ['Move Porto earlier','Move Porto later','Remove Porto','Move Lisbon earlier','Move Lisbon later','Remove Lisbon'])expect(buttonTag(html,label)).not.toBe('');
 expect(buttonTag(html,'Move Porto earlier')).not.toContain('disabled=""');expect(buttonTag(html,'Move Porto earlier')).not.toMatch(/ disabled( |>)/);
 expect(html).toContain('Two favorites picked. You can stop here or add one more. · Family A');
});
it('shows ranked chips and Remove from favorites on ranked postcards only',()=>{
 const {session,ids}=seed(3);save(session,[{option_id:ids.porto!,rank:1},{option_id:ids.lisbon!,rank:2}]);
 const html=render(session);
 expect(postcard(html,ids.porto!)).toContain('Your 1st favorite · 3 points');expect(postcard(html,ids.lisbon!)).toContain('Your 2nd favorite · 2 points');
 expect(postcard(html,ids.porto!)).toContain('Remove from favorites');expect(postcard(html,ids.seville!)).toContain('Add to favorites');
 expect(postcard(html,ids.seville!)).not.toContain('Your 3rd favorite');
});
it('replaces every Add button with the full-tray message when the tray is full',()=>{
 const {session,ids}=seed(3);save(session,[{option_id:ids.porto!,rank:1},{option_id:ids.lisbon!,rank:2},{option_id:ids.seville!,rank:3}]);
 const html=render(session);
 expect(html).not.toContain('Add to favorites');expect(postcard(html,ids.madrid!)).toContain('Three favorites picked. Remove one to choose another.');
 expect(postcard(html,'missing-option')).toContain('Three favorites picked. Remove one to choose another.');
 expect(html.match(/Remove from favorites/g)).toHaveLength(3);
});
it('keeps concerns inside a disclosure with four radios, plain labels and stamp names',()=>{
 const {session,ids}=seed(3);save(session,[{option_id:ids.porto!,rank:1}],[{option_id:ids.porto!,value:'denied'}]);
 const html=render(session),card=postcard(html,ids.porto!);
 expect(card).toContain('mot-concern');expect(card).toContain('Works for us?');expect(card).toContain('Doesn&#x27;t work for us');
 expect(card).toContain(`Does Porto work for your household?`);
 expect(card.match(new RegExp(`name="concern-${ids.porto!}"`, 'g'))).toHaveLength(4);
 for(const text of ['No stamp (not answered)','Works for us','Approved stamp','Question or condition','Maybe stamp','Denied stamp'])expect(card).toContain(text);
 expect(postcard(html,ids.lisbon!)).toContain('Not answered');
 expect(html.match(/type="radio"/g)?.length).toBeGreaterThanOrEqual(20);
});
it('shows a private card by option ID only and never leaks its title or body',()=>{
 const {session,ids}=seed(5),html=render(session),card=postcard(html,ids.secret!);
 expect(card).toContain(ids.secret!);expect(html).not.toContain('Secret Hideaway');expect(html).not.toContain('Private body that must never be shown');
});
it('reviews exactly the saved favorites, concerns, note and honest download wording',()=>{
 const {session,ids}=seed(3);save(session,[{option_id:ids.porto!,rank:1},{option_id:ids.lisbon!,rank:2}],[{option_id:ids.porto!,value:'denied'}],'Window seats please');
 const html=render(session),review=html.slice(html.indexOf('data-test="review"'));
 expect(html).toContain('data-test="review"');expect(review).toContain('Check your reply');expect(review).toContain('Family A');
 expect(review).toContain('1st · Porto · 3 points');expect(review).toContain('2nd · Lisbon · 2 points');
 expect(review).toContain('Porto: Doesn&#x27;t work for us');expect(review).toContain('4 places not answered');
 expect(review).toContain('Window seats please');
 expect(review).toContain('The reply file holds this household&#x27;s favorites, answers and shared note for this round, with the IDs the organizer needs to count it.');expect(review).toContain('It doesn&#x27;t book anything.');
 expect(review).toContain('Change favorites');expect(review).toContain('Change answers');
 expect(review).toContain('Download reply file');expect(review).toContain('Download as ZIP');
 expect(review).toContain('Downloading makes a file on this device. The organizer gets your reply only when you send it to them; MoT can&#x27;t see whether they have.');
 expect(review).toContain('Technical details');expect(review).toContain('venues');expect(review).toContain('household-a');expect(review).toContain('denied');
 for(const word of ['Sent','Delivered','Received'])expect(html).not.toContain(word);
});
it('reviews an empty reply plainly and keeps the shared-note controls',()=>{
 const {session}=seed(3),html=render(session),review=html.slice(html.indexOf('data-test="review"'));
 expect(review).toContain('No favorites picked');expect(review).toContain('No shared note');
 expect(html).toContain('Shared note');expect(html).toContain('Save shared note');expect(html).toContain('Respond without ranks');
 expect(html).not.toContain('Remove response');
});
it('escapes a hostile card title as text in headings and accessible names',()=>{
 const {session,ids}=seed(3,true),html=render(session),card=postcard(html,ids.porto!);
 expect(html).toContain('&lt;script&gt;alert');expect(html).not.toContain('<script>alert');expect(html).not.toContain('<script');
 expect(card).toContain('Porto');
});

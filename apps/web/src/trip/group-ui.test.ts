import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {expect,it} from 'vitest';
import {createTrip,TripSession} from '@writers-board/core';
import {GroupPreferences,GroupOrganizer} from './GroupPreferences';
const actor={kind:'human' as const,id:'owner',name:'Owner'};
function setup(){const session=new TripSession(createTrip({title:'Trip',city:'Bangkok',timeZone:'Asia/Bangkok',boardId:'trip'}));session.execute(actor,'trip_group_configure',{version:1,trip_id:'trip',households:[{household_id:'a',display_name:'Household A'}],rounds:[{round_id:'venues',proposal_version:1,kind:'city_venue',city_id:'bangkok',option_ids:['boat','garden'],rank_limit:3,household_weighting:'one_household_one_vote'}]});return{session,actor,tick:0,refresh:()=>{},notify:()=>{},onClose:()=>{},whenSaved:async()=>{}};}
it('connects the household ballot to the organizer view and actual response file buttons',()=>{const html=renderToStaticMarkup(createElement(GroupPreferences,setup()));expect(html).toContain('Organizer summary');expect(html).toContain('Export response JSON');expect(html).toContain('Export response ZIP');expect(html).toContain('No response');});
it('renders organizer controls, visible policy and explicit empty fact entry without invented hours or prices',()=>{const html=renderToStaticMarkup(createElement(GroupOrganizer,{...setup(),onHousehold:()=>{}}));for(const text of ['Import responses','Planning facts','Fairness first','Propose a plan','Booking attention','Household A'])expect(html).toContain(text);expect(html).not.toContain('All households approved');expect(html).toContain('No plan has been applied');});

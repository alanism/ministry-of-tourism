import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { createTrip, readAllCards } from './model.ts';
import { TripSession } from './session.ts';
import { buildMagazine } from './magazine.ts';
import { PRESENTATION_PATTERNS } from './schema.ts';

const owner={kind:'human' as const,id:'owner',name:'Owner'},png='data:image/png;base64,iVBORw0KGgo=';
function trip(){let n=0;return new TripSession(createTrip({title:'Bangkok, our way',city:'Bangkok',cityId:'bangkok',timeZone:null}),{newId:()=>`card-${++n}`});}
const visible=(svg:string)=>svg.replace(/<style>[\s\S]*?<\/style>/g,'').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();
const coverLines=(svg:string)=>[...svg.matchAll(/<text[^>]+y="(?:1265|1330|1395)"[^>]*>[\s\S]*?<\/text>/g)].map(m=>visible(m[0]));
function art(assetId:string,role:string,width=1200,height=1200){return {assetId,role,kind:'original-art',label:'Actual selected art',category:'explicit',originCityId:'bangkok',width,height,credit:'FCC',rightsStatus:'approved',source:{sourceId:assetId,canonicalUrl:`https://foreignclubberscorespondence.web.app/art/${assetId}.png`}};}
function render(session:TripSession,refs:ReturnType<typeof art>[]){return buildMagazine(session.doc,{artwork:refs,assetUrls:new Map(refs.map(a=>[a.assetId,png]))});}

describe('MOT-89 R6 surgical layout corrections',()=>{
  it('uses complete visible place/activity cover lines rather than story headlines',()=>{
    const s=trip();
    s.execute(owner,'trip_card_create',{kind:'note',title:'Bangkok: choose a district, then a reason to linger',body:'Actual editorial text',provenance:'fcc',source:{id:'article',kind:'article',retrievedAt:'2026-10-29'},scope:'guide'});
    for(const title of ['Thipsamai','Hotel Thomas Bangkok'])s.execute(owner,'trip_card_create',{kind:'place',title,scope:'guide'});
    s.execute(owner,'trip_card_create',{kind:'task',title:'River crossing',scope:'guide'});
    s.execute(owner,'trip_card_create',{kind:'place',title:'PRIVATE PLACE',scope:'private'});
    const before=Y.encodeStateAsUpdate(s.doc),lines=coverLines(buildMagazine(s.doc).pages[0]!.svg);
    expect(lines).toEqual(['Thipsamai','Hotel Thomas Bangkok','River crossing']);
    expect(Y.encodeStateAsUpdate(s.doc)).toEqual(before);
  });
  it('ends a long cover label with an intentional word-boundary ellipsis and preserves its source title',()=>{
    const s=trip(),title='A deliberately long museum and riverside activity name with another complete phrase';
    s.execute(owner,'trip_card_create',{kind:'place',title,scope:'guide'});
    const line=coverLines(buildMagazine(s.doc).pages[0]!.svg)[0]!;
    expect(line.endsWith('…')).toBe(true);expect(Array.from(line).length).toBeLessThanOrEqual(38);
    const prefix=line.slice(0,-1);expect(title.startsWith(prefix)).toBe(true);expect(title.slice(prefix.length)).toMatch(/^\s/);
    expect(readAllCards(s.parts)[0]!.title).toBe(title);
  });
  it('anchors the specimen leader to the placed crop center and omits it when the specimen slot is absent',()=>{
    const issue=render(trip(),[art('dish','specimen',1600,1200)]),svg=issue.pages.find(p=>p.section==='plate'&&p.side==='left')!.svg;
    const image=svg.slice(svg.indexOf('data-art="dish"')).match(/<svg x="(-?[\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)"/)!;
    const dot=svg.match(/<circle cx="([\d.]+)" cy="([\d.]+)" r="4"/)!;
    expect(Number(dot[1])).toBeCloseTo(Number(image[1])+Number(image[3])/2);expect(Number(dot[2])).toBeCloseTo(Number(image[2])+Number(image[4])/2);
    const fallback=render(trip(),[art('venue','facade')]).pages.find(p=>p.section==='plate'&&p.side==='left')!.svg;
    expect(fallback).not.toMatch(/<circle[^>]*r="4"/);expect(fallback).not.toContain('M910 285');
  });
  it('gives the calm final page a distinct rendered back-cover pattern without changing stored patterns',()=>{
    const s=trip();s.execute(owner,'trip_card_create',{kind:'place',title:'A real place',scope:'guide'});
    const issue=buildMagazine(s.doc);
    expect(issue.pages[0]!.pattern).toBe('personal-cover');expect(issue.pages.at(-1)!.pattern).toBe('back-cover');
    expect(PRESENTATION_PATTERNS).toEqual(['personal-cover','city-feature','food-culture','map','correspondence']);
  });
  it('groups low-resolution warnings once while retaining unique picture/crop/placed-size details',()=>{
    const issue=render(trip(),[art('front','backdrop',600,600),art('wide','city-ink',800,400),art('dish','specimen',900,900)]) as ReturnType<typeof buildMagazine>&{pictureDpi:{assetId:string;identity:string;effectiveDpi:number;crop:number[];placedWidthMm:number;placedHeightMm:number}[]};
    const warnings=issue.warnings.filter(w=>/300 dpi/.test(w));expect(warnings).toHaveLength(1);
    expect(issue.pictureDpi).toHaveLength(3);expect(new Set(issue.pictureDpi.map(p=>p.identity)).size).toBe(3);
    const lowest=Math.floor(Math.min(...issue.pictureDpi.map(p=>p.effectiveDpi)));
    expect(warnings[0]).toContain('3 pictures print below 300 dpi');expect(warnings[0]).toContain(`lowest ${lowest}`);
    const panorama=issue.pictureDpi.find(p=>p.assetId==='wide')!;
    expect(panorama.crop).toEqual([0,0,1,1]);expect(panorama.placedWidthMm).toBeCloseTo(296);expect(panorama.placedHeightMm).toBeCloseTo(94.5);
  });
});

import {describe,expect,it} from 'vitest';
import {createTrip} from './model.ts';
import {TripSession} from './session.ts';
import {buildMagazine} from './magazine.ts';
const owner={kind:'human' as const,id:'owner',name:'Owner'};
const decode=(s:string)=>s.replace(/&#10;/g,'\n').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&');
const sources=(svg:string)=>[...svg.matchAll(/<text[^>]+font-family="IBM Plex Sans"[^>]+data-flow-source="([^"]*)"/g)].map(m=>decode(m[1]!));
describe('exact source behind phone text reflow',()=>{
  it('preserves paragraphs and unspaced URLs across consumed article regions',()=>{
    const s=new TripSession(createTrip({title:'Source test',city:'Test',timeZone:null}));
    const url='https://example.test/'+('long-unbroken-path-'.repeat(12))+'?one=1&two=2',body='First paragraph.\n\n'+url+'\n\nLast paragraph.';
    s.execute(owner,'trip_card_create',{kind:'note',title:'Source article',body,provenance:'fcc',source:{id:'article',kind:'article',retrievedAt:'2026-10-29'},scope:'guide'});
    const printed=buildMagazine(s.doc).pages.flatMap(p=>sources(p.svg));
    expect(printed.some(text=>text.includes('First paragraph.\n\n'))).toBe(true);
    expect(printed.join('')).toContain(url);expect(printed.join('')).toContain('Last paragraph.');
  });
  it('keeps an exact long source URL in notebook metadata instead of inserting soft-wrap spaces',()=>{
    const s=new TripSession(createTrip({title:'Notebook test',city:'Test',timeZone:null}));
    const url='https://foreignclubberscorespondence.web.app/'+('long-source-path-'.repeat(18))+'story.html';
    s.execute(owner,'trip_card_create',{kind:'place',title:'A source place',source:{id:'place',kind:'venue',url,retrievedAt:'2026-10-29'},scope:'guide'});
    const printed=buildMagazine(s.doc).pages.filter(p=>p.section==='appendix').flatMap(p=>sources(p.svg));
    expect(printed.join('')).toContain(url);
  });
});

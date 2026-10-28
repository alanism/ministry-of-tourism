import {describe,expect,it} from 'vitest';
import {createTrip,readAllCards} from './model.ts';
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
  it('keeps an exact source URL on the credited title, with source and retrieval date instead of raw URL prose',()=>{
    const s=new TripSession(createTrip({title:'Notebook test',city:'Test',timeZone:null}));
    const url='https://foreignclubberscorespondence.web.app/'+('long-source-path-'.repeat(18))+'story.html';
    s.execute(owner,'trip_card_create',{kind:'place',title:'A source place',source:{id:'place',kind:'venue',url,retrievedAt:'2026-10-29'},scope:'guide'});
    const issue=buildMagazine(s.doc),appendix=issue.pages.filter(p=>p.section==='appendix');
    expect(appendix.some(p=>p.links?.some(link=>link.url===url))).toBe(true);
    expect(appendix.map(p=>p.svg).join('')).toContain('A source place');
    expect(appendix.map(p=>p.svg).join('')).toContain('Retrieved 2026-10-29');
    expect(appendix.flatMap(p=>sources(p.svg)).join('')).not.toContain(url);
  });
  it('paginates long source titles and retains their exact links without changing source cards',()=>{
    const s=new TripSession(createTrip({title:'Credits test',city:'Test',timeZone:null}));
    for(let i=0;i<18;i++)s.execute(owner,'trip_card_create',{kind:'place',title:`Place ${i} `+'A complete long source title '.repeat(7),source:{id:`place-${i}`,kind:'venue',url:`https://example.org/source/${i}`,retrievedAt:'2026-10-29',publishedAt:'2026-10-19'},scope:'guide'});
    const before=JSON.stringify([...s.parts.cards.values()].map(card=>card.toJSON()));
    const issue=buildMagazine(s.doc),pages=issue.pages.filter(p=>p.title==='Sources');
    expect(issue.pages.some(p=>p.section==='appendix'&&p.title?.startsWith('Trip notebook'))).toBe(false);
    expect(pages.length).toBeGreaterThan(1);
    const links=pages.flatMap(p=>p.links??[]);
    expect(links).toHaveLength(18);expect(new Set(links.map(link=>link.url)).size).toBe(18);
    expect(links.every(link=>link.y+link.height<.9)).toBe(true);
    expect(JSON.stringify([...s.parts.cards.values()].map(card=>card.toJSON()))).toBe(before);
  });
  it('excludes private source credits and keeps invalid link targets as plain source labels',()=>{
    const s=new TripSession(createTrip({title:'Shared credits',city:'Test',timeZone:null}));
    s.execute(owner,'trip_card_create',{kind:'place',title:'Private source',source:{id:'private',url:'https://example.org/private',retrievedAt:'2026-10-29'},scope:'private'});
    s.execute(owner,'trip_card_create',{kind:'place',title:'Local source',source:{id:'local',url:'https://localhost/private',retrievedAt:'2026-10-29'},scope:'guide'});
    const issue=buildMagazine(s.doc),svg=issue.pages.map(p=>p.svg).join('');
    expect(svg).not.toContain('Private source');expect(svg).not.toContain('https://localhost');
    expect(svg).toContain('Local source');expect(issue.pages.flatMap(p=>p.links??[])).toEqual([]);
  });
  it('omits unresolved FCC citation markers from notebook prose while preserving the saved source',()=>{
    const s=new TripSession(createTrip({title:'Editorial credits',city:'Test',timeZone:null}));
    for(const [id,body] of [['lead','A source paragraph. [S1]\n\nAnother paragraph. [C]'],['tail','A source paragraph. [S1]\n\nAnother paragraph. [C]']])s.execute(owner,'trip_card_create',{kind:'note',title:id!,body,provenance:'fcc',source:{id:id!,kind:'article',provider:'fcc',url:`https://example.org/${id}`,retrievedAt:'2026-10-29'},scope:'guide'});
    const notebook=buildMagazine(s.doc).pages.filter(p=>p.title?.startsWith('Trip notebook')).flatMap(p=>sources(p.svg)).join('');
    expect(notebook).toContain('A source paragraph.');expect(notebook).not.toMatch(/\[(?:S1|C)\]/);
    expect(readAllCards(s.parts).find(c=>c.title==='tail')!.body).toBe('A source paragraph. [S1]\n\nAnother paragraph. [C]');
  });
});

import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { buildMagazine } from './magazine.ts';
import { createTrip, readAllCards } from './model.ts';
import { TripSession } from './session.ts';
import { exportTripPackage } from './package.ts';
import { importTripPackage } from './import.ts';

const human={kind:'human' as const,id:'owner',name:'Owner'};
const png='data:image/png;base64,iVBORw0KGgo=';
const visible=(svg:string)=>[...svg.matchAll(/<tspan\b[^>]*>([^<]*)<\/tspan>/g)].map(match=>match[1]).join(' ');
function fixture(city:string,body:string){
  const session=new TripSession(createTrip({title:'Boundary proof',city,timeZone:null}));
  session.execute(human,'trip_card_create',{kind:'note',title:'An editorial opening',body,sourceText:'The complete original source snapshot.',provenance:'fcc',scope:'guide',source:{id:'article',provider:'fcc',kind:'article',retrievedAt:'2026-10-30'}});
  const artwork=[{assetId:'panorama',role:'city-ink',kind:'original-art',label:'City panorama',width:2368,height:756,credit:'FCC',rightsStatus:'approved',source:{sourceId:'panorama',canonicalUrl:'https://foreignclubberscorespondence.web.app/art/panorama.png'}}];
  return {session,options:{artwork,assetUrls:new Map([['panorama',png]])}};
}

describe('R8-2 feature and contents boundary',()=>{
  it.each(['Kyoto','Bangkok','Lisbon','San Sebastián'])('keeps %s article overflow in the notebook and out of contents',async city=>{
    const words=Array.from({length:250},(_,i)=>`sourceword${String(i).padStart(3,'0')}`),body=words.join(' ');
    const {session,options}=fixture(city,body),before=Y.encodeStateAsUpdate(session.doc),cards=readAllCards(session.parts);
    try{
      const issue=buildMagazine(session.doc,options),left=issue.pages.find(page=>page.section==='feature'&&page.side==='left')!,right=issue.pages.find(page=>page.section==='feature'&&page.side==='right')!;
      expect(visible(right.svg)).not.toMatch(/sourceword\d+/);
      expect(visible(left.svg)).toMatch(/sourceword\d+…/);
      const printed=[left,...issue.pages.filter(page=>page.section==='appendix')].map(page=>visible(page.svg)).join(' ');
      expect(printed.match(/sourceword\d+/g)).toEqual(words);
      expect(issue.pages.filter(page=>page.section==='appendix').some(page=>visible(page.svg).includes(words.at(-1)!))).toBe(true);
      expect(right.svg).toContain('IN THIS ISSUE');
      expect(Y.encodeStateAsUpdate(session.doc)).toEqual(before);
      const opened=await importTripPackage(await exportTripPackage(session.doc,new Map(),{includePrivate:false}));
      try{expect(readAllCards(new TripSession(opened.doc).parts)).toEqual(cards);}finally{opened.doc.destroy();}
    }finally{session.destroy();}
  });
  it('does not add an ellipsis or a body continuation when the entire article fits',()=>{
    const {session,options}=fixture('Kyoto','A short complete article.');
    try{
      const issue=buildMagazine(session.doc,options),left=issue.pages.find(page=>page.section==='feature'&&page.side==='left')!,right=issue.pages.find(page=>page.section==='feature'&&page.side==='right')!;
      expect(visible(left.svg)).toContain('A short complete article.');
      expect(visible(left.svg)).not.toContain('…');
      expect(visible(right.svg)).not.toContain('A short complete article.');
      expect(issue.pages.filter(page=>page.section==='appendix').some(page=>visible(page.svg).includes('A short complete article.'))).toBe(false);
    }finally{session.destroy();}
  });
});

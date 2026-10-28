import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { buildMagazine } from './render.ts';
import { createTrip, readAllCards, readPresentations } from './model.ts';
import { TripSession } from './session.ts';
import { exportTripPackage, sha256Hex } from './package.ts';
import { importTripPackage } from './import.ts';
import { buildApparelPages } from './merch.ts';

const human={kind:'human' as const,id:'owner',name:'Owner'};
const png='data:image/png;base64,iVBORw0KGgo=';
const roles=['backdrop','foreground','city-ink','specimen','facade','specimen','interior','vehicle','vignette','portrait','postcard','stamp','tag'];
function fixture(){
  const session=new TripSession(createTrip({title:'River notebook',city:'Bangkok',cityId:'bangkok',timeZone:'Asia/Bangkok',dates:{start:'2026-10-28',end:'2026-11-01'}}));
  session.execute(human,'trip_card_create',{kind:'place',title:'Along the river',body:'Actual source paragraph, with café and ink.',sourceText:'The complete saved FCC source.',travelerNote:'My own words.',day:'2026-10-28',time:'10:30',scope:'guide'});
  session.execute(human,'trip_card_create',{kind:'note',title:'A letter',body:'Only the words I really wrote.',scope:'guide'});
  return session;
}
function artwork(){return roles.map((role,i)=>({assetId:`art-${i}`,kind:'original-art',category:'explicit-fixture',role,label:i===4?'Hotel Maria Cristina A Luxury Collection Hotel Hotel Exterio Â· Version 1':`City drawing ${i}`,originCityId:i===4?'san-sebastian':'bangkok',width:2200,height:1800,rightsStatus:'approved',credit:'FCC',hash:(i+1).toString(16).padStart(64,'0'),source:{sourceId:`source-${i}`,canonicalUrl:`https://foreignclubberscorespondence.web.app/art/${i}.png`}}));}
function teeArtwork(){return ['apparel-brush','apparel-map-color'].map((role,i)=>({assetId:`tee-${i}`,category:'tee',role,kind:'apparel-mockup',originCityId:'bangkok',label:'Bangkok tee',thumbnailUrl:'https://foreignclubberscorespondence.web.app/tee.webp',renditionUrl:'https://foreignclubberscorespondence.web.app/tee.webp',width:2200,height:2800,mimeType:'image/webp',rightsStatus:'restricted',credit:'FCC photographer',hash:(i+100).toString(16).padStart(64,'0'),source:{provider:'fcc',sourceId:`tee-${i}`,canonicalUrl:'https://foreignclubberscorespondence.web.app/bangkok.html',cityId:'bangkok',kind:'artwork',retrievedAt:'2026-10-28',origin:'artwork'}}));}
describe('R4 real editorial spreads',()=>{
  it('fixes the jacket order, pairs the named sections, and records distinct first-unused slots',()=>{
    const session=fixture(), refs=artwork(), before=Y.encodeStateAsUpdate(session.doc);
    const issue=buildMagazine(session.doc,{artwork:refs,assetUrls:new Map(refs.map(a=>[a.assetId,png]))} as any) as any;
    expect(issue.pages[0].section).toBe('front-cover');expect(issue.pages.at(-1).section).toBe('back-cover');
    expect(issue.spreads.map((s:any)=>s.section).filter((s:string)=>s!=='appendix')).toEqual(['front-cover','feature','plate','route','style','letters','back-cover']);
    for(const section of ['feature','plate','route','letters'])expect(issue.pages.filter((p:any)=>p.section===section).map((p:any)=>p.side)).toEqual(['left','right']);
    expect(issue.pages.filter((p:any)=>p.section==='style').map((p:any)=>p.side)).toEqual(['left']);
    const used=issue.spreads.flatMap((s:any)=>s.usedSlots);
    expect(new Set(used.map((s:any)=>s.identity)).size).toBe(used.length);
    const panorama=issue.spreads.find((s:any)=>s.section==='feature').usedSlots[0];
    expect(panorama.sharedAcrossPages).toBe(true);
    expect(issue.pages.filter((p:any)=>p.assetIds.includes(panorama.assetId))).toHaveLength(2);
    expect(Y.encodeStateAsUpdate(session.doc)).toEqual(before);
    const svg=issue.pages.map((p:any)=>p.svg).join('');
    expect(svg).toContain('Hotel María Cristina');expect(svg).toContain('Origin: San Sebastian');
    expect(svg).not.toMatch(/Version 1|Â|Arial|Georgia|foreignObject/);
    expect(svg).toContain('font-family:IBM Plex Sans');expect(svg).toContain('data:font/woff2;base64,');
    expect(svg.toLowerCase().includes('not to scale · not geographic')).toBe(true);
    const readable=svg.replace(/<style>[\s\S]*?<\/style>/g,'').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ');
    for(const text of ['My own words.','Only the words I really wrote.'])expect(readable.includes(text)).toBe(true);
  });
  it('prints one shared luggage tag across the correct back/front jacket seam with its real source and credits',()=>{
    const refs=artwork(),tag=refs.find(a=>a.role==='tag')!,issue=buildMagazine(fixture().doc,{artwork:refs,assetUrls:new Map(refs.map(a=>[a.assetId,png]))});
    const front=issue.pages[0]!,back=issue.pages.at(-1)!,slots=issue.spreads.flatMap(s=>s.usedSlots).filter(s=>s.assetId===tag.assetId);
    expect(slots).toHaveLength(1);expect(slots[0]!.sharedAcrossPages).toBe(true);
    for(const cover of [front,back]){
      expect(cover.assetIds).toContain(tag.assetId);expect(cover.credits).toContain('FCC');
      expect(cover.slots?.find(s=>s.assetId===tag.assetId)).toEqual(slots[0]);
      expect(cover.svg.includes(`data-art="${tag.assetId}"`)).toBe(true);expect(cover.svg.includes(png)).toBe(true);
      const box=cover.svg.slice(cover.svg.indexOf(`data-art="${tag.assetId}"`)).match(/<svg x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)"/)!;
      [935.36,789.6,426.24,426.24].forEach((n,i)=>expect(Number(box[i+1])).toBeCloseTo(n));
    }
    expect(front.svg.includes('data-jacket-side="front" transform="translate(-1184 0)"')).toBe(true);
    expect(back.svg.includes('data-jacket-side="back" transform="translate(0 0)"')).toBe(true);
    expect(issue.pages.filter(p=>p.assetIds.includes(tag.assetId))).toHaveLength(2);
  });
  it('continues the no-tag type postmark across the same physical jacket seam without inventing artwork',()=>{
    const refs=artwork().filter(a=>a.role!=='tag'),issue=buildMagazine(fixture().doc,{artwork:refs,assetUrls:new Map(refs.map(a=>[a.assetId,png]))});
    const front=issue.pages[0]!,back=issue.pages.at(-1)!;
    for(const cover of [front,back]){
      expect(cover.svg.includes('data-jacket-spine="postmark"')).toBe(true);
      expect(cover.svg.includes('rotate(-14 1184 786.4)')).toBe(true);
    }
    expect(front.svg.includes('data-jacket-side="front" transform="translate(-1184 0)"')).toBe(true);
    expect(back.svg.includes('data-jacket-side="back" transform="translate(0 0)"')).toBe(true);
    expect(issue.spreads[0]!.droppedSlots).toContain('spine-tag');
  });
  it('deduplicates aliases by source identity or content hash and recomposes sparse art without filler',()=>{
    const session=fixture(), refs=artwork().slice(0,2);refs[1]!.hash=refs[0]!.hash;
    const issue=buildMagazine(session.doc,{artwork:refs,assetUrls:new Map(refs.map(a=>[a.assetId,png]))} as any) as any;
    expect(issue.spreads.flatMap((s:any)=>s.usedSlots)).toHaveLength(1);
    expect(issue.spreads.flatMap((s:any)=>s.droppedSlots).length).toBeGreaterThan(0);
    expect(issue.pages.map((p:any)=>p.svg).join('')).not.toMatch(/placeholder|personal food-culture page|unavailable|<image[^>]*href=""/i);
    expect(buildMagazine(new TripSession(createTrip({title:'Empty',city:'Test',timeZone:null})).doc).pages).toEqual([]);
  });
  it('drops unused fallback art instead of appending generic image pages',()=>{
    const refs=artwork();refs.push({...refs.at(-1)!,assetId:'unused',role:'portrait',hash:'f'.repeat(64),source:{sourceId:'unused',canonicalUrl:'https://foreignclubberscorespondence.web.app/art/unused.png'},credit:'full-credit-start '+Array.from({length:80},(_,i)=>`credit${i}`).join(' ')+' full-credit-end'});
    const issue=buildMagazine(fixture().doc,{artwork:refs,assetUrls:new Map(refs.map(a=>[a.assetId,png]))}) as any;
    expect(issue.pages.filter((p:any)=>p.section==='appendix').every((p:any)=>p.assetIds.length===0)).toBe(true);
    expect(issue.unusedAssetIds).toContain('unused');
  });
  it('prints selected body and traveler words once, leaves full source evidence in the trip, and groups overflow',()=>{
    const session=fixture();const issue=buildMagazine(session.doc);
    const text=issue.pages.map(p=>p.svg.replace(/<style>[\s\S]*?<\/style>/g,'').replace(/<[^>]*>/g,' ')).join(' ').replace(/\s+/g,' ');
    expect((text.match(/Actual source paragraph/g)??[]).length).toBe(1);
    expect((text.match(/Only the words I really wrote/g)??[]).length).toBe(1);
    expect(text.includes('The complete saved FCC source.')).toBe(false);
    expect(session.parts.cards.size).toBe(2);
  });
  it('renders an explicitly sourced FCC article note as the feature, retaining overflow and editable evidence',async()=>{
    const session=new TripSession(createTrip({title:'Sparse issue',city:'San Sebastián',cityId:'san-sebastian',timeZone:null}));
    const body='FCC_EDITORIAL_OPENING '+Array.from({length:300},(_,i)=>`sourceword${i}`).join(' '),sourceText='Original saved source evidence.';
    const source={id:'fcc-article',provider:'fcc',sourceId:'sparse-article',kind:'article',canonicalUrl:'https://foreignclubberscorespondence.web.app/magazine/san-sebastian/city-edit.html',retrievedAt:'2026-10-28'};
    const {id}=session.execute<{id:string}>(human,'trip_card_create',{kind:'note',provenance:'fcc',title:'A real editorial feature',body,sourceText,source,scope:'guide'});
    const issue=buildMagazine(session.doc),features=issue.pages.filter(p=>p.section==='feature');
    expect(features).toHaveLength(2);expect(features.some(p=>p.svg.includes('FCC_EDITORIAL_OPENING'))).toBe(true);
    const opening=features[0]!.svg.match(/<text[^>]+y="([\d.]+)"[^>]*><tspan[^>]*>FCC_EDITORIAL_OPENING/);
    expect(Number(opening?.[1])).toBeLessThan(700);
    expect(features.some(p=>p.sourceCardIds?.includes(id))).toBe(true);
    expect(issue.pages.filter(p=>p.section==='letters')).toHaveLength(0);
    expect(issue.pages.filter(p=>p.section==='appendix').some(p=>p.svg.includes('sourceword299'))).toBe(true);
    const reopened=await importTripPackage(await exportTripPackage(session.doc,new Map(),{includePrivate:false}));
    expect(readAllCards(new TripSession(reopened.doc).parts)[0]).toMatchObject({body,sourceText,provenance:'fcc',source});
  });
  it('keeps an article body out of correspondence while allowing its explicit traveler note',()=>{
    const session=new TripSession(createTrip({title:'Personal issue',city:'Bangkok',cityId:'bangkok',timeZone:null}));
    session.execute(human,'trip_card_create',{kind:'note',provenance:'fcc',title:'FCC article',body:'EDITORIAL_ONLY_TEXT',travelerNote:'MY_OWN_TRAVELER_WORDS',source:{id:'article',kind:'article',retrievedAt:'2026-10-28'},scope:'guide'});
    const issue=buildMagazine(session.doc),letterText=issue.pages.filter(p=>p.section==='letters').map(p=>p.svg).join('');
    expect(issue.pages.filter(p=>p.section==='feature').some(p=>p.svg.includes('EDITORIAL_ONLY_TEXT'))).toBe(true);
    expect(letterText.includes('MY_OWN_TRAVELER_WORDS')).toBe(true);expect(letterText.includes('EDITORIAL_ONLY_TEXT')).toBe(false);
    expect(issue.pages.filter(p=>p.section==='letters')).toHaveLength(1);
  });
  it('recomposes postcard-only art as one front card without an invented message or blank facing letter',()=>{
    const session=new TripSession(createTrip({title:'City issue',city:'Bangkok',cityId:'bangkok',timeZone:null}));
    session.execute(human,'trip_card_create',{kind:'note',provenance:'fcc',title:'FCC article',body:'SOURCE_ARTICLE_BODY',source:{id:'article',kind:'article',retrievedAt:'2026-10-28'},scope:'guide'});
    const refs=artwork().filter(a=>a.role==='postcard'),issue=buildMagazine(session.doc,{artwork:refs,assetUrls:new Map(refs.map(a=>[a.assetId,png]))}),letters=issue.pages.filter(p=>p.section==='letters');
    expect(letters).toHaveLength(1);expect(letters[0]!.assetIds).toEqual([refs[0]!.assetId]);
    expect(letters[0]!.svg.includes('data-postcard-face="front"')).toBe(true);expect(letters[0]!.svg.includes('data-postcard-face="back"')).toBe(false);
    expect(letters[0]!.svg.includes('SOURCE_ARTICLE_BODY')).toBe(false);
  });
  it('fits the complete normal four-line source headline and keeps the body below its final baseline',()=>{
    for(const panorama of [false,true]){
      const session=new TripSession(createTrip({title:'Source issue',city:'San Sebastián',cityId:'san-sebastian',timeZone:null}));
      const title='A convent and an extension tell different parts of the story';
      session.execute(human,'trip_card_create',{kind:'note',provenance:'fcc',title,body:'HEADLINE_BODY_MARKER',source:{id:'article',kind:'article',retrievedAt:'2026-10-28'},scope:'guide'});
      const refs=panorama?artwork().filter(a=>a.role==='city-ink'):[],issue=buildMagazine(session.doc,{artwork:refs,assetUrls:new Map(refs.map(a=>[a.assetId,png]))});
      const svg=issue.pages.find(p=>p.section==='feature'&&p.side==='left')!.svg,heading=svg.match(/<text[^>]+font-family="IBM Plex Serif"[^>]*>[\s\S]*?<\/text>/)![0];
      expect(heading.replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim()).toBe(title);
      expect((heading.match(/<tspan /g)??[]).length).toBe(4);
      const headingY=Number(heading.match(/ y="([\d.]+)"/)![1]),leading=Number([...heading.matchAll(/ dy="([\d.]+)"/g)].at(-1)![1]);
      const bodyY=Number(svg.match(/<text[^>]+y="([\d.]+)"[^>]*><tspan[^>]*>HEADLINE_BODY_MARKER/ )![1]);
      expect(leading).toBeCloseTo(2*4*11.84);expect(bodyY).toBeGreaterThanOrEqual(headingY+3*leading+4*11.84);
    }
  });
  it('groups a long notebook into physical page pairs without filler or losing its last word',()=>{
    const session=fixture();session.execute(human,'trip_card_create',{kind:'brief',title:'A long selected story',body:Array.from({length:1400},(_,i)=>`word${i}`).join(' '),scope:'guide'});
    const issue=buildMagazine(session.doc),continuations=issue.spreads.filter(s=>s.section==='appendix');
    expect(continuations.length).toBeGreaterThan(1);
    expect(continuations.every(s=>s.pageIds.length<=2)).toBe(true);
    expect(issue.pages.some(p=>p.svg.includes('word1399'))).toBe(true);
    expect(issue.pages.map(p=>p.folio)).toEqual(issue.pages.map((_,i)=>i+1));
  });
  it('opens on the actual editorial article and fills the reference panorama, portrait and giant specimen slots',()=>{
    const session=fixture();session.execute(human,'trip_card_create',{kind:'brief',title:'The actual city feature',body:'Real editorial opening.',scope:'guide',source:{id:'article',kind:'article',url:'https://foreignclubberscorespondence.web.app/bangkok.html',retrievedAt:'2026-10-28'}});
    const refs=artwork(),issue=buildMagazine(session.doc,{artwork:refs,assetUrls:new Map(refs.map(a=>[a.assetId,png]))});
    const feature=issue.pages.find(p=>p.section==='feature'&&p.side==='left')!;
    expect(feature.svg.includes('The actual city feature')).toBe(true);
    for(const section of ['feature','style'])expect(issue.pages.find(p=>p.section===section&&p.side==='left')!.svg.includes('data-fit="slice"')).toBe(true);
    expect(issue.pages.find(p=>p.section==='plate'&&p.side==='left')!.svg.includes('width="1397" height="1397"')).toBe(true);
    const date=issue.pages[0]!.svg.match(/<text[^>]+y="([\d.]+)"[^>]*>2026-10-28 — 2026-11-01<\/text>/);
    expect(Number(date?.[1])).toBeLessThan(120);
    expect(issue.pages.find(p=>p.section==='plate'&&p.side==='right')!.svg.includes('>Food and culture</tspan>')).toBe(true);
    expect(issue.pages.find(p=>p.section==='style'&&p.side==='left')!.svg.includes('>The brush portrait</tspan>')).toBe(true);
    const postcard=issue.pages.find(p=>p.section==='letters'&&p.side==='left')!.svg;
    expect(postcard.includes('data-postcard-face="front"')).toBe(true);
    expect(postcard.includes('data-postcard-face="back"')).toBe(true);
  });
  it('keeps owner roles through ZIP, caps them by private ownership, and retains crop/lock provenance',async()=>{
    const session=fixture(), bytes=new TextEncoder().encode('source bytes'),hash=await sha256Hex(bytes);
    const {id}=session.execute<{id:string}>(human,'trip_card_create',{kind:'note',title:'Private artwork',body:'PRIVATE WORDS',scope:'private'});
    session.execute(human,'trip_asset_register',{asset:{id:'private-art',hash,mime:'image/png',role:'original',credit:'FCC',width:2000,height:1600}});
    session.execute(human,'trip_presentation_create',{cardId:id,assetId:'private-art',magazineRole:'specimen',pattern:'food-culture',x:.1,y:.2,width:.5,height:.4,crop:[.1,.1,.7,.7],rotation:13,zIndex:3,locked:true,scope:'guide'});
    const back=await importTripPackage(await exportTripPackage(session.doc,new Map([['private-art',bytes]]),{includePrivate:true}));
    expect(readPresentations(new TripSession(back.doc).parts)[0]).toMatchObject({magazineRole:'specimen',locked:true,crop:[.1,.1,.7,.7]});
    const publicIssue=buildMagazine(back.doc,{assetUrls:new Map([['private-art',png]]),artwork:[{...artwork()[0],assetId:'private-art',role:'specimen'}]} as any);
    expect(JSON.stringify(publicIssue)).not.toContain('private-art');expect(JSON.stringify(publicIssue)).not.toContain('PRIVATE WORDS');
    const personal=buildMagazine(back.doc,{includePrivate:true,assetUrls:new Map([['private-art',png]])});
    const output=personal.pages.map(p=>p.svg).join('');
    expect(output).toContain('data-crop="0.1,0.1,0.7,0.7"');expect(output).toContain('data-locked="true"');expect(output).toContain('rotate(13 ');
    expect(output).toContain('data-source-geometry="0.1,0.2,0.5,0.4"');
  });
  it('rejects out-of-original crop bounds before producing a blank clipped page',()=>{
    const session=fixture();session.doc.getMap('tripPresentations').set('bad',{id:'bad',boardId:session.boardId,assetId:'cropped',magazineRole:'backdrop',x:0,y:0,width:1,height:1,crop:[.8,0,.5,1],rotation:0,zIndex:0,locked:false,scope:'guide'});
    expect(()=>buildMagazine(session.doc,{assetUrls:new Map([['cropped',png]]),assetDimensions:new Map([['cropped',{width:1000,height:1000}]])})).toThrow(/crop/i);
  });
  it('warns about effective cropped resolution rather than calling a large cropped original print-ready',()=>{
    const session=fixture();session.doc.getMap('tripPresentations').set('crop',{id:'crop',boardId:session.boardId,assetId:'cropped',magazineRole:'backdrop',x:0,y:0,width:1,height:1,crop:[.1,.1,.1,.1],rotation:0,zIndex:0,locked:false,scope:'guide'});
    const issue=buildMagazine(session.doc,{assetUrls:new Map([['cropped',png]]),assetDimensions:new Map([['cropped',{width:5000,height:5000}]])});
    expect(issue.warnings.some(w=>/cropped.*300 dpi/.test(w))).toBe(true);
  });
  it('reserves a distinct labelled jacket photo and never repeats a tee as illustration',()=>{
    const tees=teeArtwork();
    const urls=new Map(tees.map(t=>[t.assetId,png]));
    const pages=buildApparelPages({cityId:'bangkok',cityName:'Bangkok',artwork:tees,embeddedUrls:urls,widthPx:1184,heightPx:1680,startFolio:1});
    expect(pages.flatMap(p=>p.assetIds)).toEqual(['tee-0','tee-1']);
    expect(pages.at(-1)!.svg.includes('ADVERTISEMENT')).toBe(true);
    expect(pages.every(p=>p.svg.includes('data:font/woff2;base64,'))).toBe(true);
    const issue=buildMagazine(fixture().doc,{artwork:[...artwork(),...tees],assetUrls:new Map([...artwork().map(a=>[a.assetId,png] as const),...urls])});
    expect(issue.pages.at(-1)!.assetIds).toEqual(['tee-1','art-12']);
    expect(issue.pages.find(p=>p.section==='style'&&p.side==='right')!.assetIds).toEqual(['tee-0']);
    expect(issue.pages.filter(p=>p.section!=='style'&&p.section!=='back-cover').some(p=>p.assetIds.some(id=>id.startsWith('tee-')))).toBe(false);
    expect(issue.pages.flatMap(p=>p.links??[]).every(link=>link.x>=0&&link.y>=0&&link.width>0&&link.height>0&&link.x+link.width<=1&&link.y+link.height<=1)).toBe(true);
    const credit=issue.pages.at(-1)!.svg.match(/<text[^>]+y="([\d.]+)"[^>]*><tspan[^>]*>FCC photographer<\/tspan>/);
    expect(Number(credit?.[1])).toBeLessThan(1500);
  });
  it('uses the saved owner tee choice in the worn slot and reserves a different jacket photo',()=>{
    for(const count of [1,2]){
      const session=fixture(),tees=teeArtwork().slice(0,count),chosen=tees.at(-1)!;
      session.execute(human,'trip_magazine_tee_select',{assetId:chosen.assetId,assets:tees.map(a=>({id:a.assetId,hash:a.hash,mime:a.mimeType,role:'original',credit:a.credit,rightsStatus:a.rightsStatus,apparel:a}))});
      const issue=buildMagazine(session.doc,{artwork:tees,assetUrls:new Map(tees.map(t=>[t.assetId,png]))});
      expect(issue.pages.find(p=>p.section==='style'&&p.side==='right')?.assetIds).toEqual([chosen.assetId]);
      expect(issue.pages.filter(p=>p.section==='style')).toHaveLength(1);
      expect(issue.pages.at(-1)!.assetIds).toEqual(count===1?[]:[tees[0]!.assetId]);
      expect(issue.pages.flatMap(p=>p.assetIds).filter(id=>id===chosen.assetId)).toHaveLength(1);
    }
  });
});

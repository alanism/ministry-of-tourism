import { describe, expect, it } from 'vitest';
import * as render from './render.ts';
import { createTrip, readPresentations } from './model.ts';
import { TripSession } from './session.ts';
import { exportTripPackage, sha256Hex } from './package.ts';
import { importTripPackage } from './import.ts';

const owner={kind:'human' as const,id:'owner',name:'Owner'};
const image='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
const bytes=new TextEncoder().encode('fictional-art');
const placement=(pattern:render.SpreadPattern)=>(render as typeof render & {magazinePatternPlacement:(pattern:render.SpreadPattern)=>{pattern:render.SpreadPattern;x:number;y:number;width:number;height:number}}).magazinePatternPlacement(pattern);
async function fixture(pattern:render.SpreadPattern,linked=true){
  const session=new TripSession(createTrip({title:'Art journal',city:'Test',timeZone:null}));
  const card=linked?session.execute<{id:string}>(owner,'trip_card_create',{kind:'place',title:'A city story',body:'Native art and readable text',scope:'guide'}):undefined;
  session.execute(owner,'trip_asset_register',{asset:{id:'art',hash:await sha256Hex(bytes),mime:'image/png',role:'original',credit:'FCC artist',width:2000,height:3000}});
  session.execute(owner,'trip_presentation_create',{assetId:'art',cardId:card?.id,...placement(pattern),crop:[.1,.2,.7,.6],rotation:17,scope:'guide'});
  return session;
}
describe('MOT-89 actual native art spread presets',()=>{
  it('provides five distinct image placements within the page',()=>{
    const presets=render.SPREAD_PATTERNS.map(placement);
    expect(new Set(presets.map(({x,y,width,height})=>JSON.stringify({x,y,width,height}))).size).toBe(5);
    presets.forEach(preset=>{expect(preset.x).toBeGreaterThanOrEqual(0);expect(preset.y).toBeGreaterThanOrEqual(0);expect(preset.width).toBeGreaterThan(0);expect(preset.height).toBeGreaterThan(0);expect(preset.x+preset.width).toBeLessThanOrEqual(1);expect(preset.y+preset.height).toBeLessThanOrEqual(1);});
  });
  it('keeps a fixed cover and preserves native preset intent and geometry when composing editorial slots',async()=>{
    for(const pattern of render.SPREAD_PATTERNS){
      const session=await fixture(pattern);const preset=placement(pattern);
      const issue=render.buildMagazine(session.doc,{assetUrls:new Map([['art',image]])});
      expect(issue.pages[0]!.section).toBe('front-cover');
      const svg=issue.pages.map(p=>p.svg).join('');
      expect(svg.includes(`data-pattern="${pattern}"`)).toBe(true);expect(svg.includes('data-crop="0.1,0.2,0.7,0.6"')).toBe(true);expect(svg.includes('rotate(17 ')).toBe(true);
      expect(svg.includes(`data-source-geometry="${[preset.x,preset.y,preset.width,preset.height].join(',')}"`)).toBe(true);
    }
  });
  it('preserves an explicit unowned-art pattern through the ZIP schema and rendered page',async()=>{
    const session=await fixture('correspondence',false);
    const back=await importTripPackage(await exportTripPackage(session.doc,new Map([['art',bytes]]),{includePrivate:true}));
    expect(readPresentations(new TripSession(back.doc).parts)[0]).toMatchObject({pattern:'correspondence',crop:[.1,.2,.7,.6],rotation:17});
    const issue=render.buildMagazine(back.doc,{assetUrls:new Map([['art',image]])});
    expect(issue.pages[0]!.section).toBe('front-cover');
    expect(issue.pages.some(p=>p.svg.includes('data-pattern="correspondence"'))).toBe(true);
  });
  it('preserves cropped image aspect ratio inside a differently shaped preset',async()=>{
    const session=await fixture('food-culture');
    const page=render.buildMagazine(session.doc,{assetUrls:new Map([['art',image]])}).pages[0]!;
    expect(page.svg).not.toContain('preserveAspectRatio="none"');
  });
});

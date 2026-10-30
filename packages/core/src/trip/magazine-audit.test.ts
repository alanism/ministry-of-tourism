import {describe,expect,it} from 'vitest';
import {auditMagazinePages} from './magazine-audit.ts';
import type {MagazineDocument,MagazinePage,MagazineSlot} from './magazine.ts';
const slot=(name:string,assetId:string,sharedAcrossPages=false):MagazineSlot=>({name,assetId,identity:'hash:'+assetId,sharedAcrossPages});
const page=(section:MagazinePage['section'],side:MagazinePage['side'],slots:MagazineSlot[]=[]):MagazinePage=>({id:`${section}:${side}`,spreadId:section,section,side,pattern:section==='front-cover'?'personal-cover':section==='back-cover'?'back-cover':'city-feature',folio:1,svg:'',assetIds:slots.map(s=>s.assetId),credits:[],slots});
const fixture=()=>{
  const tag=slot('spine-tag','tag',true),panorama=slot('panorama','panorama',true);
  return {pages:[page('front-cover','single',[tag]),page('feature','left',[panorama]),page('feature','right',[panorama]),page('back-cover','single',[tag])],spreads:[{id:'front-cover',section:'front-cover',pageIds:['front-cover:single'],usedSlots:[tag]},{id:'feature',section:'feature',pageIds:['feature:left','feature:right'],usedSlots:[panorama]}]} as MagazineDocument;
};
describe('magazine physical page gates',()=>{
  it('accepts only the recorded single jacket tag and panorama on their two intended physical halves',()=>{
    const result=auditMagazinePages(fixture());expect(result).toEqual({frontFirst:true,backLast:true,repeats:[]});
  });
  it('rejects a third tag use, a shared flag on ordinary art, or a panorama on a different section',()=>{
    const three=fixture();three.pages.splice(3,0,page('plate','left',[slot('spine-tag','tag',true)]));expect(auditMagazinePages(three).repeats).not.toEqual([]);
    const ordinary=fixture(),art=slot('portrait','other',true);ordinary.pages[1]!.assetIds.push('other');ordinary.pages[1]!.slots!.push(art);ordinary.pages[2]!.assetIds.push('other');ordinary.pages[2]!.slots!.push(art);expect(auditMagazinePages(ordinary).repeats).not.toEqual([]);
    const elsewhere=fixture();elsewhere.pages[2]!.section='style';expect(auditMagazinePages(elsewhere).repeats).not.toEqual([]);
  });
  it('rejects two allocations of the same source and a calm back mislabeled as a personal cover',()=>{
    const duplicate=fixture();duplicate.spreads.push({usedSlots:[slot('new-slot','panorama',true)]} as any);expect(auditMagazinePages(duplicate).repeats).not.toEqual([]);
    const cover=fixture();cover.pages.at(-1)!.pattern='personal-cover';expect(auditMagazinePages(cover).backLast).toBe(false);
  });
  it('rejects one printed asset disguised under two identities',()=>{
    const issue=fixture();issue.pages[2]!.slots![0]={...issue.pages[2]!.slots![0]!,identity:'disguised-source'};
    expect(auditMagazinePages(issue).repeats).not.toEqual([]);
  });
  it('rejects panorama halves assigned to unrelated spreads or separated by another page',()=>{
    const unrelated=fixture();unrelated.pages[2]!.spreadId='feature-other';expect(auditMagazinePages(unrelated).repeats).not.toEqual([]);
    const separated=fixture();separated.pages.splice(2,0,page('plate','left'));expect(auditMagazinePages(separated).repeats).not.toEqual([]);
  });
});

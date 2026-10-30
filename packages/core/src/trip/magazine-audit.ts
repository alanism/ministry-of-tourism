import type {MagazineDocument} from './magazine.ts';
export function auditMagazinePages(magazine:MagazineDocument):{frontFirst:boolean;backLast:boolean;repeats:string[]}{
  const {pages,spreads}=magazine,first=pages[0],last=pages.at(-1),repeats:string[]=[];
  const slots=spreads.flatMap(spread=>spread.usedSlots),allocated=new Map<string,typeof slots>();
  for(const slot of slots)allocated.set(slot.identity,[...(allocated.get(slot.identity)??[]),slot]);
  for(const [identity,uses] of allocated)if(uses.length!==1)repeats.push(`${identity}: allocated to multiple slots`);
  const printed=new Map<string,{page:typeof first;slot:typeof slots[number]}[]>(),assetIdentities=new Map<string,Set<string>>();
  for(const page of pages)for(const assetId of page.assetIds){
    const slot=page.slots?.find(s=>s.assetId===assetId)??slots.find(s=>s.assetId===assetId);
    if(!slot){repeats.push(`${assetId}: missing slot record`);continue;}
    const identities=assetIdentities.get(assetId)??new Set<string>();identities.add(slot.identity);assetIdentities.set(assetId,identities);
    printed.set(slot.identity,[...(printed.get(slot.identity)??[]),{page,slot}]);
  }
  for(const [assetId,identities] of assetIdentities)if(identities.size>1)repeats.push(`${assetId}: printed under different identities`);
  for(const [identity,uses] of printed){
    if(uses.length===1)continue;
    const recorded=allocated.get(identity);
    const shared=uses.length===2&&recorded?.length===1&&recorded[0]!.sharedAcrossPages===true&&uses.every(use=>use.slot.sharedAcrossPages===true&&use.slot.name===recorded[0]!.name&&use.slot.assetId===recorded[0]!.assetId);
    const jacket=shared&&recorded[0]!.name==='spine-tag'&&uses.every(use=>use.page?.side==='single')&&uses.some(use=>use.page===first)&&uses.some(use=>use.page===last)&&first?.section==='front-cover'&&last?.section==='back-cover';
    const feature=spreads.find(spread=>spread.usedSlots.some(slot=>slot.identity===identity));
    const left=uses.find(use=>use.page?.side==='left')?.page,right=uses.find(use=>use.page?.side==='right')?.page;
    const panorama=shared&&recorded[0]!.name==='panorama'&&feature?.section==='feature'&&spreads.filter(spread=>spread.id===feature.id).length===1&&uses.every(use=>use.page?.section==='feature'&&use.page.spreadId===feature.id&&feature.pageIds.includes(use.page.id))&&!!left&&!!right&&pages.indexOf(left)+1===pages.indexOf(right);
    if(!jacket&&!panorama)repeats.push(`${identity}: repeated outside the two permitted physical halves`);
  }
  return {frontFirst:first?.section==='front-cover'&&first.pattern==='personal-cover',backLast:last?.section==='back-cover'&&['back-cover','tee-advert'].includes(last.pattern),repeats};
}

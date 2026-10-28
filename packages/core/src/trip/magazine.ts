// Digital A5 editorial layout. Pure, offline, audience-filtered; no producer classification inference.
import type * as Y from 'yjs';
import { readAllCards, readTripMeta, tripParts } from './model.ts';
import { cropSchema, MAGAZINE_ART_ROLES, PRESENTATION_PATTERNS, type MagazineArtRole, type Presentation, type TripCard } from './schema.ts';
import { fccShopUrl, selectCityApparel, type ApparelArtRef } from './merch.ts';
import { isPublicFccUrl } from './city-source.ts';
import { MAGAZINE, PAPER, INK, RED, BLUSH, BLUE, TAUPE, PU, M, L, G, COL, column, escapeXml as esc, magazineLabel, wrap, flowText, rows, kicker, shell } from './magazine-style.ts';
export { MAGAZINE, magazineLabel } from './magazine-style.ts';
export const SPREAD_PATTERNS=PRESENTATION_PATTERNS;
export type SpreadPattern=(typeof SPREAD_PATTERNS)[number];
export type MagazineSection='front-cover'|'feature'|'plate'|'route'|'style'|'letters'|'appendix'|'back-cover';
export interface MagazineSlot { name:string;assetId:string;identity:string;sharedAcrossPages?:boolean; }
export interface MagazineSpread { id:string;section:MagazineSection;title:string;pageIds:string[];usedSlots:MagazineSlot[];droppedSlots:string[]; }
export interface MagazinePage {id:string;pattern:SpreadPattern|'merch'|'tee-advert';folio:number;svg:string;assetIds:string[];credits:string[];links?:{url:string;x:number;y:number;width:number;height:number}[];spreadId?:string;side?:'single'|'left'|'right';section?:MagazineSection;title?:string;slots?:MagazineSlot[];sourceCardIds?:string[];artworkLabels?:{assetId:string;label:string}[];}
export interface MagazineDocument {title:string;boardId:string;revision:number;pages:MagazinePage[];warnings:string[];spreads:MagazineSpread[];unusedAssetIds:string[];apparel?:ApparelArtRef[];cityId?:string;cityName?:string;}
export interface MagazineOptions {assetUrls?:ReadonlyMap<string,string>;assetDimensions?:ReadonlyMap<string,{width:number;height:number}>;includePrivate?:boolean;variant?:'guide'|'stay'|'personal';artwork?:readonly unknown[];}
interface Box{x:number;y:number;width:number;height:number;}
const PRESETS:Record<SpreadPattern,Box>={
 'personal-cover':{x:80,y:350,width:1024,height:630},'city-feature':{x:80,y:400,width:1024,height:620},
 'food-culture':{x:640,y:350,width:464,height:1050},map:{x:80,y:330,width:1024,height:860},correspondence:{x:80,y:1030,width:1024,height:430},
};
/** Composition's persisted presets remain stable. Editorial slots retain their geometry as provenance. */
export function magazinePatternPlacement(pattern:SpreadPattern){const b=PRESETS[pattern];return {pattern,x:b.x/1184,y:b.y/1680,width:b.width/1184,height:b.height/1680};}
const RASTER=/^data:image\/(?:png|jpeg|webp|avif);base64,[a-z\d+/=]+$/i;
export class MissingMagazineAssetError extends Error {readonly assetId:string;constructor(assetId:string){super(`Image asset ${assetId} is unavailable. Restore its bytes and retry.`);this.name='MissingMagazineAssetError';this.assetId=assetId;}}
type Role=MagazineArtRole|'apparel-brush'|'apparel-map-mono'|'apparel-map-color';
interface Candidate {assetId:string;identity:string;identities:string[];kind:string;role?:Role;label:string;originCityId?:string;credit?:string;width:number;height:number;layer?:Presentation;}
const patternRole:Record<SpreadPattern,MagazineArtRole>={'personal-cover':'backdrop','city-feature':'city-ink','food-culture':'specimen',map:'map',correspondence:'postcard'};
const titleCase=(value:string)=>value.split('-').map(s=>s[0]?.toUpperCase()+s.slice(1)).join(' ');

export function buildMagazine(doc:Y.Doc,options:MagazineOptions={}):MagazineDocument{
  const parts=tripParts(doc),meta=readTripMeta(doc),personal=options.includePrivate===true||options.variant==='personal';
  const visible=(scope:string)=>personal||(scope!=='private'&&(options.variant!=='guide'||scope==='guide'));
  const cards=readAllCards(parts).filter(c=>visible(c.scope)),visibleIds=new Set(cards.map(c=>c.id));
  const layers=[...doc.getMap<Presentation>('tripPresentations').values()].filter(p=>p.boardId===meta.boardId&&visible(p.scope)&&(!p.cardId||visibleIds.has(p.cardId))).sort((a,b)=>a.zIndex-b.zIndex||a.id.localeCompare(b.id));
  const selected=new Set([...cards.flatMap(c=>c.assetIds),...layers.flatMap(p=>p.assetId?[p.assetId]:[])]);
  const allOwned=new Set([...readAllCards(parts).flatMap(c=>c.assetIds),...[...doc.getMap<Presentation>('tripPresentations').values()].flatMap(p=>p.assetId?[p.assetId]:[])]);
  const pages:MagazinePage[]=[],spreads:MagazineSpread[]=[],warnings:string[]=[],creditAppendix:string[]=[];
  const result=():MagazineDocument=>({title:meta.title,boardId:meta.boardId,revision:Number(parts.clock.get('boardRev')??0),pages,spreads,unusedAssetIds:[],warnings:[...new Set(warnings)],cityId:meta.cityId,cityName:meta.city});
  const sourceData=(raw:unknown):Record<string,unknown>=>raw&&typeof raw==='object'?raw as Record<string,unknown>:{};
  const rawRefs=(options.artwork??[]).map(sourceData);
  const apparel=meta.cityId?selectCityApparel(meta.cityId,rawRefs):[];
  const candidates:Candidate[]=[];
  function add(assetId:string,raw:Record<string,unknown>,layer?:Presentation){
    const existing=candidates.find(a=>a.assetId===assetId);if(existing)return;
    const stored=parts.assets.get(assetId),source=sourceData(raw.source??stored?.get('source'));
    const credit=typeof raw.credit==='string'?raw.credit:stored?.get('credit');
    const rights=raw.rightsStatus??stored?.get('rightsStatus');
    if((!personal&&['unknown','restricted'].includes(String(rights)))&&!(typeof credit==='string'&&credit.trim()))throw new Error(`Artwork ${assetId} needs its actual credit before a shared export. Add the source credit and retry.`);
    const href=options.assetUrls?.get(assetId);if(!href||!RASTER.test(href))throw new MissingMagazineAssetError(assetId);
    const supplied=options.assetDimensions?.get(assetId),width=supplied?.width??Number(raw.width??stored?.get('width')),height=supplied?.height??Number(raw.height??stored?.get('height'));
    if(layer&&!cropSchema.safeParse(layer.crop).success)throw new Error(`Artwork placement ${layer.id} has invalid crop`);
    if(layer&&![layer.x,layer.y,layer.width,layer.height,layer.rotation].every(Number.isFinite))throw new Error(`Artwork placement ${layer.id} has invalid geometry`);
    if(layer&&!(width>0&&height>0)&&layer.crop.some((v,i)=>v!==[0,0,1,1][i]))throw new Error(`Artwork ${assetId} needs original dimensions to preserve its crop`);
    const hash=raw.hash??stored?.get('hash')??source.contentHash;
    const sourceId=source.sourceId??source.id,sourceUrl=source.canonicalUrl??source.url;
    const identities=[...(typeof hash==='string'&&hash?['hash:'+hash]:[]),...(typeof sourceId==='string'?['source:'+String(source.provider??'fcc')+':'+sourceId]:typeof sourceUrl==='string'?['url:'+sourceUrl]:[])];
    if(!identities.length)identities.push('asset:'+assetId);
    const rawRole=raw.role,role=layer?.magazineRole??(typeof rawRole==='string'&&[...MAGAZINE_ART_ROLES,'apparel-brush','apparel-map-mono','apparel-map-color'].includes(rawRole)?rawRole as Role:layer?.pattern?patternRole[layer.pattern]:undefined);
    candidates.push({assetId,identity:identities[0]!,identities,kind:typeof raw.kind==='string'?raw.kind:'selected-art',role,label:magazineLabel(String(raw.label??stored?.get('caption')??cards.find(c=>c.assetIds.includes(assetId))?.title??meta.city)),originCityId:typeof raw.originCityId==='string'?raw.originCityId:typeof source.cityId==='string'?source.cityId:undefined,credit:typeof credit==='string'&&credit.trim()?credit.trim():undefined,width:width>0?width:1184,height:height>0?height:1680,layer});
  }
  // Selected private ownership cannot be bypassed by passing an approved public ref with the same id.
  for(const layer of layers)if(layer.assetId)add(layer.assetId,rawRefs.find(r=>r.assetId===layer.assetId)??{},layer);
  for(const id of selected)add(id,rawRefs.find(r=>r.assetId===id)??{});
  for(const raw of rawRefs){
    if(typeof raw.assetId!=='string'||(allOwned.has(raw.assetId)&&!selected.has(raw.assetId)))continue;
    if(!['original-art','map','sticker','photo','apparel-mockup'].includes(String(raw.kind)))continue;
    if(raw.kind==='apparel-mockup'&&!apparel.some(a=>a.assetId===raw.assetId))continue;
    const source=sourceData(raw.source);
    if(!selected.has(raw.assetId)&&![source.canonicalUrl,source.url,raw.originalUrl,raw.renditionUrl].some(url=>typeof url==='string'&&isPublicFccUrl(url)))continue;
    if(raw.scope==='private')continue;
    if(['unknown','restricted'].includes(String(raw.rightsStatus))&&!(typeof raw.credit==='string'&&raw.credit.trim()))throw new Error(`Artwork ${raw.assetId} needs its actual credit before export.`);
    add(raw.assetId,raw);
  }
  if(!cards.length&&!candidates.length)return result();
  const used=new Set<string>();
  let current!:MagazineSpread;
  function spread(section:MagazineSection,title:string){current={id:section,section,title,pageIds:[],usedSlots:[],droppedSlots:[]};spreads.push(current);}
  function take(name:string,pool:Candidate[],sharedAcrossPages=false):Candidate|undefined{
    const candidate=pool.find(c=>!c.identities.some(id=>used.has(id)));
    if(!candidate){current.droppedSlots.push(name);return;}
    candidate.identities.forEach(id=>used.add(id));current.usedSlots.push({name,assetId:candidate.assetId,identity:candidate.identity,...(sharedAcrossPages?{sharedAcrossPages:true}:{})});return candidate;
  }
  const role=(...roles:Role[])=>roles.flatMap(r=>candidates.filter(c=>c.role===r&&c.kind!=='apparel-mockup'));
  const art=candidates.filter(c=>c.kind!=='apparel-mockup');
  const tees=candidates.filter(c=>c.kind==='apparel-mockup');
  const chosenTee=tees.find(c=>c.assetId===meta.magazine?.wornTeeAssetId);
  const jacketTees=tees.filter(c=>!chosenTee||!c.identities.some(id=>chosenTee.identities.includes(id)));
  function picture(c:Candidate|undefined,b:Box,rotation=0,clipCircle=false,fit:'meet'|'slice'='meet'):string{
    if(!c)return '';
    const p=c.layer,crop=p?.crop??[0,0,1,1],angle=(p?.rotation??0)+rotation;
    const cropWidth=c.width*crop[2]!,cropHeight=c.height*crop[3]!;
    const scale=fit==='slice'?Math.max(b.width/cropWidth,b.height/cropHeight):Math.min(b.width/cropWidth,b.height/cropHeight);
    if(1184/(148/25.4)/scale<300)warnings.push(`Artwork ${c.assetId} is below 300 dpi after crop and placement; digital output is not print-ready.`);
    const provenance=p?` data-placement="${esc(p.id)}" data-crop="${crop.join(',')}" data-locked="${p.locked}" data-pattern="${p.pattern??''}" data-source-geometry="${[p.x,p.y,p.width,p.height].join(',')}"`:'';
    const clip=`round-${pages.length}-${current.usedSlots.findIndex(s=>s.assetId===c.assetId)}`;
    return `<g data-art="${esc(c.assetId)}" data-fit="${fit}"${provenance} transform="rotate(${angle} ${b.x+b.width/2} ${b.y+b.height/2})"${c.kind==='photo'||c.kind==='apparel-mockup'?'':' style="mix-blend-mode:multiply"'}>${clipCircle?`<defs><clipPath id="${clip}"><ellipse cx="${b.x+b.width/2}" cy="${b.y+b.height/2}" rx="${b.width/2}" ry="${b.height/2}"/></clipPath></defs><g clip-path="url(#${clip})">`:''}<svg x="${b.x}" y="${b.y}" width="${b.width}" height="${b.height}" viewBox="${crop[0]!*c.width} ${crop[1]!*c.height} ${crop[2]!*c.width} ${crop[3]!*c.height}" preserveAspectRatio="xMidYMid ${fit}" overflow="hidden"><image href="${options.assetUrls!.get(c.assetId)}" width="${c.width}" height="${c.height}" preserveAspectRatio="xMidYMid meet"/></svg>${clipCircle?'</g>':''}</g>`;
  }
  const origin=(c:Candidate)=>c.originCityId&&c.originCityId!==meta.cityId&&c.originCityId!==meta.city?`Origin: ${titleCase(c.originCityId)}`:undefined;
  const caption=(c:Candidate|undefined,n:number,x:number,y:number,width=1018)=>!c?'':rows(wrap(`Nº ${n} ${c.label}`,Math.floor(width/15)),x,y,2.1*PU,L,'IBM Plex Sans',400,INK);
  const text=(value:string,x:number,y:number,width=1018,size=2.5*PU,limit=99,family='IBM Plex Sans',weight:400|600=400)=>rows(wrap(value,Math.max(1,Math.floor(width/(size*.57)))).slice(0,limit),x,y,size,size>=10*PU?3*L:size>=6*PU?2*L:size>=4*PU?1.5*L:L,family,weight);
  const head=(value:string,x=M,y=3*L,width=1018,size=6.55*PU,limit=3)=>text(value,x,y,width,size,limit,'IBM Plex Serif',600);
  function page(side:'single'|'left'|'right',pattern:MagazinePage['pattern'],content:string,images:(Candidate|undefined)[]=[],sourceCards:TripCard[]=[],paper=PAPER,title=current.title,links?:MagazinePage['links']){
    const usedImages=[...new Map(images.filter((c):c is Candidate=>!!c).map(c=>[c.assetId,c])).values()];
    const credits=[...new Set(usedImages.flatMap(c=>[c.credit,origin(c)].filter((s):s is string=>!!s)))];
    const creditLines=credits.flatMap(c=>wrap(c,70));
    const folio=pages.length+1,id=`${current.id}:${side}${current.pageIds.length>1?':'+current.pageIds.length:''}`;
    const textProvenance=layers.filter(p=>!p.assetId&&sourceCards.some(c=>c.id===p.cardId)).map(p=>`<g data-placement="${esc(p.id)}" data-locked="${p.locked}" data-source-geometry="${[p.x,p.y,p.width,p.height].join(',')}" transform="rotate(${p.rotation} 592 840)"/>`).join('');
    const creditY=usedImages.some(c=>c.kind==='apparel-mockup')?1480:1540;
    const svg=shell(content+textProvenance+rows(creditLines.slice(0,3),M,creditY,1.9*PU,26,'IBM Plex Mono'),title,current.section.endsWith('cover')?undefined:folio,side,paper);
    const normalizedLinks=links?.map(link=>({...link,x:link.x/1184,y:link.y/1680,width:link.width/1184,height:link.height/1680}));
    current.pageIds.push(id);pages.push({id,pattern,folio,svg,assetIds:usedImages.map(c=>c.assetId),credits,spreadId:current.id,side,section:current.section,title,slots:spreads.flatMap(s=>s.usedSlots).filter(s=>usedImages.some(c=>c.assetId===s.assetId)),sourceCardIds:sourceCards.map(c=>c.id),artworkLabels:usedImages.map(c=>({assetId:c.assetId,label:c.label})),...(normalizedLinks?{links:normalizedLinks}:{})});
  }
  const dates=meta.dates?`${meta.dates.start} — ${meta.dates.end}`:'';
  const isArticle=(c:TripCard)=>c.source?.kind==='article';
  const featureLead=cards.find(c=>isArticle(c)&&c.body.trim())??cards.find(c=>c.kind!=='note'&&c.body.trim())??cards.find(c=>c.kind!=='note');
  const first=featureLead??cards[0],notes=cards.filter(c=>c.travelerNote?.trim()||(c.kind==='note'&&c.provenance!=='fcc'&&!isArticle(c)&&c.body.trim())),places=cards.filter(c=>c.kind==='place');
  const noteField=(c:TripCard)=>c.travelerNote?.trim()?'travelerNote':'body';
  const remainingText=new Map(cards.flatMap(c=>[[c.id+':body',c.body],[c.id+':travelerNote',c.travelerNote??'']]));
  function body(card:TripCard|undefined,x:number,y:number,width:number,max:number,field:'body'|'travelerNote'='body',size=2.5*PU){
    if(!card)return '';const key=card.id+':'+field,chunk=flowText(remainingText.get(key)??'',Math.floor(width/(size*.57)),max);remainingText.set(key,chunk.rest);return rows(chunk.lines,x,y,size,L);
  }
  function letters(x:number,y:number,width:number,max:number){
    let output='',usedLines=0;
    for(const c of notes){const field=noteField(c);if(!(remainingText.get(c.id+':'+field)??'').trim()||usedLines+3>=max)continue;const heading=[c.day,c.title].filter(Boolean).join(' · ');output+=text(heading,x,y+usedLines*L,width,2.1*PU,2,'IBM Plex Mono',600);usedLines+=2;const chunk=flowText(remainingText.get(c.id+':'+field)??'',Math.floor(width/(2.5*PU*.57)),max-usedLines);remainingText.set(c.id+':'+field,chunk.rest);output+=rows(chunk.lines,x,y+usedLines*L,2.5*PU,L);usedLines+=chunk.lines.length+1;}
    return output;
  }

  // Reserve the jacket photo first, exactly once. Its slot belongs to the final back cover.
  spread('front-cover',meta.city);
  const backTee=take('back-cover-tee',[...jacketTees.filter(c=>c.role==='apparel-map-color'),...jacketTees.slice().reverse()]);
  const backSlot=current.usedSlots.pop();
  current.droppedSlots=current.droppedSlots.filter(n=>n!=='back-cover-tee');
  const backdrop=take('backdrop',[...role('backdrop'),...art.filter(c=>!c.role)]),foreground=take('foreground',role('foreground')),tag=take('spine-tag',role('tag'),true);
  const mastheadSize=Math.min(17.1*PU,86*PU/(Math.max(1,Array.from(meta.city).length)*.6));
  const issueTitle=meta.title!==meta.city?meta.title:first?.title??'';
  const dateHeader=dates?`<text x="${1184-M}" y="${1.2*L}" text-anchor="end" font-family="IBM Plex Mono" font-size="${2.1*PU}" font-weight="600" fill="${INK}">${esc(dates)}</text>`:'';
  // One flat-jacket drawing in back-left/front-right coordinates. Each physical page clips its half.
  const stampY=.38*1680+148,stampLines=[meta.city.toUpperCase(),...wrap(dates,16)].filter(Boolean),stampLeading=2.1*PU*1.35;
  const spine=tag?picture(tag,{x:1184-.21*1184,y:.47*1680,width:.36*1184,height:.36*1184},-9):`<g transform="rotate(-14 1184 ${stampY})" style="mix-blend-mode:multiply"><circle cx="1184" cy="${stampY}" r="148" fill="none" stroke="${RED}" stroke-width="${.006*1184}"/><circle cx="1184" cy="${stampY}" r="${148-1.6*PU}" fill="none" stroke="${RED}" stroke-width="1"/><text x="1184" y="${stampY-(stampLines.length-1)*stampLeading/2+2.1*PU/3}" text-anchor="middle" font-family="IBM Plex Mono" font-size="${2.1*PU}" font-weight="600" fill="${RED}">${stampLines.map((line,i)=>`<tspan x="1184" dy="${i?stampLeading:0}">${esc(line)}</tspan>`).join('')}</text></g>`;
  const jacketSpine=(side:'front'|'back')=>`<g data-jacket-spine="${tag?'tag':'postmark'}" data-jacket-side="${side}" transform="translate(${side==='front'?-1184:0} 0)">${spine}</g>`;
  const tagMark=jacketSpine('front');
  page('single','personal-cover',picture(backdrop,{x:0,y:0,width:1184,height:1680},0,false,'slice')+kicker('Ministry of Tourism · personal issue',M,1.2*L)+dateHeader+rows([meta.city.toUpperCase()],M,2.1*L+mastheadSize*.86,mastheadSize,mastheadSize,'IBM Plex Sans Condensed',600)+rows(wrap(issueTitle,45).slice(0,2),M,4.2*L+mastheadSize*.7,3.2*PU,L,'IBM Plex Serif',400,INK,true)+picture(foreground,{x:0,y:504,width:1184,height:1176})+tagMark+cards.slice(0,3).map((c,i)=>`<rect x="${column(3)}" y="${1230+i*65}" width="${1184-M-column(3)}" height="52" fill="${PAPER}"/>${rows(wrap(c.title,38).slice(0,1),column(3)+12,1265+i*65,2.5*PU,L,'IBM Plex Serif',600)}`).join(''),[backdrop,foreground,tag],cards.slice(0,3));

  if(featureLead||role('city-ink').length){
    spread('feature',meta.city);
    const panorama=take('panorama',role('city-ink','backdrop'),true),panoramaHeight=756;
    const panoramaImage=(right:boolean)=>picture(panorama,{x:right?-1184:0,y:0,width:2368,height:panoramaHeight},0,false,'slice');
    const opening=featureLead?.title??meta.title;
    const headingColumns=Math.floor(1018/(6.55*PU*.57)),headingLines=wrap(opening,headingColumns),visibleHeading=headingLines.slice(0,panorama?5:12),headingY=panorama?970:4*L;
    if(visibleHeading.length<headingLines.length)visibleHeading[visibleHeading.length-1]=Array.from(visibleHeading.at(-1)!).slice(0,headingColumns-1).join('')+'…';
    const leadBodyY=Math.max(panorama?1260:0,headingY+visibleHeading.length*2*L),bodyLines=Math.min(panorama?4:Infinity,Math.max(0,Math.floor((1490-leadBodyY)/L)+1));
    page('left','city-feature',panoramaImage(false)+kicker(meta.city,M,panorama?850:2*L)+rows(visibleHeading,M,headingY,6.55*PU,2*L,'IBM Plex Serif',600)+body(featureLead,M,leadBodyY,1018,bodyLines),[panorama],featureLead?[featureLead]:[]);
    const facts=cards.flatMap(c=>(c.currentFacts??[]).filter(()=>c.source?.kind==='almanac').map(f=>({f,c}))).slice(0,3);
    const factsSvg=facts.map(({f},i)=>kicker(f.field,M,1260+i*86,RED)+text(`${f.value} · ${f.observedAt}`,M,1298+i*86,1018,2.1*PU,1)).join('');
    const contents=cards.slice(0,5).map((c,i)=>`${i+1}. ${c.title}`).join('\n');
    page('right','city-feature',panoramaImage(true)+kicker('In this issue',M,panorama?850:2*L)+body(featureLead,M,panorama?925:4*L,3*COL+2*G,facts.length?6:10)+text(contents,column(4),panorama?925:4*L,3*COL+2*G,2.5*PU,10)+(facts.length?factsSvg:''),[panorama],cards.slice(0,5));
  }

  const hasPlate=role('specimen','facade','interior').some(c=>!c.identities.some(id=>used.has(id)));
  if(hasPlate){
    spread('plate','Food and culture');
    const specimen=take('specimen-1',role('specimen'));
    const facade=take('facade',role('facade'));
    const second=take('specimen-2',role('specimen'));
    const interior=take('interior',role('interior'));
    const lead=specimen??facade??interior??second;
    const leadLabel=lead?.label??'';
    const leader=specimen?`<path d="M910 285 Q920 435 780 480" fill="none" stroke="${INK}" stroke-width="2"/><circle cx="780" cy="480" r="4" fill="${INK}"/>${rows(['Nº 1'],910,260,3.2*PU,L,'IBM Plex Serif',400,INK,true)}`:'';
    page('left','food-culture',kicker('Eat and look')+picture(lead,specimen?{x:-308,y:16*PU,width:1397,height:1397}:{x:0,y:0,width:1184,height:1350},0,false,specimen?'meet':'slice')+leader+(!specimen?`<rect x="${M}" y="1195" width="1018" height="280" fill="${PAPER}"/>`:'')+rows(['Nº 1'],M,1400,10.6*PU,L,'IBM Plex Sans Condensed',600,RED)+head(leadLabel,M,1490,1018,4.05*PU,1),[lead],[],specimen?BLUSH:PAPER);
    const rightArt=[facade,second,interior].filter((c):c is Candidate=>!!c&&c!==lead);
    const right=rightArt.length?head('Food and culture',M,2.5*L,1018,4.05*PU,2)
      +(facade&&facade!==lead?picture(facade,{x:M,y:220,width:1018,height:605},0,false,'slice')+caption(facade,2,M,875):'')
      +(second&&second!==lead?picture(second,{x:M,y:970,width:494,height:400},0,true)+caption(second,3,M,1420,494):'')
      +(interior&&interior!==lead?picture(interior,{x:column(4),y:970,width:494,height:400})+caption(interior,4,column(4),1420,494):'')
      :kicker('Places in the notebook')+head(leadLabel,M,4*L)+text(places.map((c,i)=>`Nº ${i+1} ${c.title}`).join('\n\n'),M,8*L,1018,2.5*PU,22);
    page('right','food-culture',right,rightArt,places);
  }

  const stops=cards.filter(c=>c.kind==='place'||c.day||c.location).slice().sort((a,b)=>(a.day??'').localeCompare(b.day??'')||(a.time??'').localeCompare(b.time??''));
  if(stops.length){
    spread('route','The route');
    const marker=take('route-marker',role('vehicle','map','stamp')),vignette=take('route-vignette',role('vignette'));
    // The route is explicitly a diagram: no guessed coordinates or geographic map background.
    const shown=stops.slice(0,8),step=Math.min(142,900/Math.max(1,shown.length-1));
    const points=shown.map((c,i)=>({c,x:i%2?column(5)+COL/2:column(2)+COL/2,y:400+i*step}));
    const path=points.map((p,i)=>`${i?'L':'M'}${p.x} ${p.y}`).join(' ');
    const grid=`<defs><pattern id="route-dots" width="${L}" height="${L}" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="2" fill="${TAUPE}"/></pattern></defs><rect width="1184" height="1680" fill="url(#route-dots)"/>`;
    const route=points.map((p,i)=>{const dayFirst=i===0||p.c.day!==shown[i-1]?.day;return `<circle cx="${p.x}" cy="${p.y}" r="29" fill="${dayFirst?RED:INK}"/>${rows([String(i+1)],p.x-10,p.y+10,2.5*PU,L,'IBM Plex Sans Condensed',600,PAPER)}${text(p.c.title,p.x+(i%2?-245:48),p.y-40,240,2.5*PU,2)}`;}).join('');
    page('left','map',grid+kicker('The route')+head(meta.city,M,4*L)+`<path d="M-90 1140 C260 1370 700 850 1270 1190" fill="none" stroke="${BLUE}" stroke-width="120"/><path d="${path}" fill="none" stroke="${INK}" stroke-width="3" stroke-dasharray="12 12"/>`+route+picture(marker,{x:785,y:1250,width:300,height:190},marker?.role==='vehicle'?45:0)+kicker('not to scale · not geographic',M,1490),[marker],shown);
    const blockHeight=Math.min(5*L,850/Math.max(1,shown.length));
    const timetable=shown.map((c,i)=>{const y=7*L+i*blockHeight,dayFirst=i===0||c.day!==shown[i-1]?.day;return `<circle cx="${M+27}" cy="${y-11}" r="27" fill="${dayFirst?RED:INK}"/>`+rows([String(i+1)],M+17,y,2.5*PU,L,'IBM Plex Sans Condensed',600,PAPER)+text(c.title,M+80,y,938,2.5*PU,shown.length>4?1:2,'IBM Plex Sans',600)+text([c.day,c.time].filter(Boolean).join(' · '),M+80,y+(shown.length>4?L:2*L),938,2.1*PU,1)+body(c,M+80,y+3*L,938,Math.max(0,Math.floor(blockHeight/L)-3));}).join('');
    page('right','map',kicker('Days and places')+head('The route',M,4*L)+timetable+picture(vignette,{x:column(2),y:1230,width:668,height:260}),[vignette],shown);
  }

  const styleCandidates=role('portrait').filter(c=>!c.identities.some(id=>used.has(id))),remainingTees=tees.filter(c=>!c.identities.some(id=>used.has(id)));
  if(styleCandidates.length||remainingTees.length){
    spread('style','Style, and the tee');
    const portrait=take('portrait',styleCandidates),tee=take('worn',[...(chosenTee?[chosenTee]:[]),...remainingTees.filter(c=>c.role==='apparel-brush'),...remainingTees.filter(c=>c.role==='apparel-map-mono'),...remainingTees]);
    const arrow=portrait&&tee?`<path d="M1000 1180 C1080 930 1480 960 1600 1050 M1000 1180 L1034 1125 M1000 1180 L1058 1170" fill="none" stroke="${RED}" stroke-width="4"/>`:'';
    const fade=`<defs><linearGradient id="portrait-fade" x1="0" y1="0" x2="0" y2="1"><stop offset=".66" stop-color="#FFFFFF"/><stop offset=".98" stop-color="#000000"/></linearGradient><mask id="portrait-paper"><rect width="1184" height="1176" fill="url(#portrait-fade)"/></mask></defs>`;
    if(portrait)page('left','city-feature',fade+`<g mask="url(#portrait-paper)">${picture(portrait,{x:0,y:0,width:1184,height:1176},0,false,'slice')}</g>`+arrow+kicker(`Style · ${meta.city}`,M,1245,RED)+head('The brush portrait',M,1330,1018,6.55*PU,2),[portrait]);
    const shop=meta.cityId?fccShopUrl(meta.cityId):undefined;
    const order=shop?`<a href="${esc(shop)}">${kicker('Order on FCC →',M+30,1430)}</a>`:'';
    if(tee)page('right','merch',picture(tee,{x:0,y:0,width:1184,height:1680},0,false,'slice')+`<g transform="translate(-1184 0)">${arrow}</g>`+`<rect x="${M}" y="1250" width="1018" height="300" fill="${PAPER}"/>`+head('Wear the trip',M+30,1330,958,4.05*PU,2)+order,[tee],[],PAPER,'Wear the trip',shop?[{url:shop,x:M,y:1380,width:1018,height:95}]:undefined);
  }

  const postPool=role('postcard').filter(c=>!c.identities.some(id=>used.has(id)));
  if(notes.length||postPool.length){
    spread('letters','Correspondence');
    const hasWords=notes.length>0,postcard=take('postcard-front',postPool),stamp=hasWords?take('stamp',role('stamp')):undefined;
    const frontY=hasWords?150:(1680-655)/2;
    const front=postcard?`<g data-postcard-face="front" transform="rotate(-4 570 ${hasWords?500:840})"><rect x="105" y="${frontY}" width="924" height="655" fill="${PAPER}"/>${picture(postcard,{x:105,y:frontY,width:924,height:655},0,false,'slice')}</g>`:'';
    const stampBox={x:835,y:1080,width:150,height:145};
    const back=hasWords?`<g data-postcard-face="back" transform="rotate(2.5 590 1220)"><rect x="154" y="940" width="924" height="655" fill="${PAPER}"/><path d="M686 1020V1480 M730 1300H1005 M730 1390H1005 M730 1480H1005" stroke="${TAUPE}" stroke-width="2"/>${body(notes[0],195,1040,440,10,noteField(notes[0]!))}${stamp?picture(stamp,stampBox):`<rect x="835" y="1080" width="150" height="145" fill="none" stroke="${RED}" stroke-width="3"/>${kicker(meta.city.split(/\s+/).map(s=>s[0]).join('').slice(0,3),859,1165,RED)}`}</g>`:'';
    const hasLetterPage=notes.some(c=>(remainingText.get(c.id+':'+noteField(c))??'').trim()),vignette=hasLetterPage?take('letter-vignette',role('vignette')):undefined;
    if(!hasWords)current.droppedSlots.push('postcard-back','stamp');
    if(!hasLetterPage)current.droppedSlots.push('facing-letter','letter-vignette');
    const postmark=hasLetterPage?`<g transform="rotate(-9 1100 1180)"><circle cx="1100" cy="1180" r="98" fill="none" stroke="${RED}" stroke-width="3"/>${kicker('MoT',1065,1190,RED)}<path d="M1180 1120h90 M1190 1160h90 M1195 1200h90" stroke="${RED}" stroke-width="3"/></g>`:'';
    page('left','correspondence',front+back+postmark,[postcard,stamp],notes.slice(0,1),TAUPE);
    if(hasLetterPage)page('right','correspondence',`<g transform="translate(-1184 0)">${postmark}</g>`+kicker('Correspondence')+head(meta.city,M,4*L)+letters(M,7*L,1018,vignette?18:25)+picture(vignette,{x:column(2),y:1230,width:668,height:260}),[vignette],notes);
  }

  // Full editorial sourceText stays in the editable trip/ZIP. Only unprinted traveler text continues.
  for(const c of candidates.filter(c=>c.identities.some(id=>used.has(id))))if(c.credit&&wrap(c.credit,70).length>3)creditAppendix.push(c.label+'\n'+c.credit);
  const notebook=cards.map(c=>{
    const tail=remainingText.get(c.id+':body')??'',note=remainingText.get(c.id+':travelerNote')??'';
    const title=isArticle(c)?`${c.provenance==='fcc'||c.source?.provider==='fcc'?'FCC article':'Source article'} · ${c.title}`:c.title;
    return [tail||note||c.title.length>40?title:'',tail,note?`Traveler note\n${note}`:'',...(c.currentFacts??[]).map(f=>`${f.field}: ${f.value}\nObserved ${f.observedAt}\nSource ${f.evidenceUrl}`),c.source?.canonicalUrl??c.source?.url??''].filter(Boolean).join('\n\n');
  }).filter(Boolean).join('\n\n');
  const notebookLines=wrap([notebook,...creditAppendix].filter(Boolean).join('\n\n'),60);
  if(notebookLines.some(s=>s.trim())){
    const count=Math.ceil(notebookLines.length/27);
    for(let i=0;i<count;i++){
      if(i%2===0){spread('appendix',i?'Trip notebook · continued':'Trip notebook');current.id=`appendix-${i/2+1}`;}
      page(count===1||(i===count-1&&count%2)?'single':i%2?'right':'left','correspondence',kicker(i?'Trip notebook · continued':'Trip notebook')+rows(notebookLines.slice(i*27,(i+1)*27),M,4*L,2.5*PU,L),[],cards);
    }
  }
  spread('back-cover',backTee?'Advertisement':meta.city);
  if(backTee&&backSlot)current.usedSlots.push(backSlot);else current.droppedSlots.push('back-cover-tee');
  const shop=backTee&&meta.cityId?fccShopUrl(meta.cityId):undefined;
  page('single',backTee?'tee-advert':'personal-cover',(backTee?picture(backTee,{x:0,y:0,width:1184,height:1680},0,false,'slice')+`<rect x="${M}" y="1230" width="1018" height="320" fill="${PAPER}"/>`+kicker('FCC · Advertisement',M,2*L)+head(`Take ${meta.city} with you.`,M+24,1320,970,4.05*PU,2)+(shop?`<a href="${esc(shop)}">${kicker('Order on FCC →',M+24,1430)}</a>`:''):kicker('Ministry of Tourism')+head(meta.city,M,7*L,1018,10.6*PU,4)+(dates?text(dates,M,13*L):'')+text(cards.map(c=>c.title).join('\n'),M,18*L,1018,2.5*PU,10))+jacketSpine('back'),[backTee,tag],[],PAPER,backTee?'Advertisement':meta.city,shop?[{url:shop,x:M,y:1380,width:1018,height:95}]:undefined);
  const output=result();output.apparel=apparel;output.unusedAssetIds=candidates.filter(c=>!c.identities.some(id=>used.has(id))).map(c=>c.assetId);return output;
}

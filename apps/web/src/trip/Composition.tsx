import { useRef, useState, type PointerEvent } from 'react';
import { magazinePatternPlacement, PRESENTATION_PATTERNS, readAllCards, readAsset, readPresentation, readPresentations, type Actor, type Presentation, type TripSession } from '@writers-board/core';
import { useAssetUrl } from './trip-assets';

const clamp=(n:number)=>Math.max(0,Math.min(1,n));
const ROLE_LABELS:Record<NonNullable<Presentation['magazineRole']>,string>={backdrop:'Cover backdrop',foreground:'Cover foreground','city-ink':'City panorama',specimen:'Food or culture specimen',facade:'Venue façade',interior:'Venue interior',postcard:'Postcard front',portrait:'Brush portrait',tag:'Luggage tag',stamp:'Postcard stamp',vehicle:'Route vehicle',vignette:'Small vignette',map:'Map illustration'};
function ObjectView({object,session,selected,onSelect,onMove}:{object:Presentation;session:TripSession;selected:boolean;onSelect:()=>void;onMove:(x:number,y:number)=>void}) {
  const url=useAssetUrl(session,object.assetId);
  const card=object.cardId?readAllCards(session.parts).find(card=>card.id===object.cardId):undefined;
  const asset=object.assetId?readAsset(session.parts,object.assetId):undefined;
  const drag=useRef<{x:number;y:number;left:number;top:number;w:number;h:number}|null>(null);
  const start=(event:PointerEvent<HTMLButtonElement>)=>{onSelect();if(object.locked)return;const rect=event.currentTarget.parentElement!.getBoundingClientRect();drag.current={x:event.clientX,y:event.clientY,left:object.x,top:object.y,w:rect.width,h:rect.height};event.currentTarget.setPointerCapture(event.pointerId);};
  const end=(event:PointerEvent<HTMLButtonElement>)=>{const from=drag.current;drag.current=null;if(from)onMove(clamp(from.left+(event.clientX-from.x)/from.w),clamp(from.top+(event.clientY-from.y)/from.h));};
  const [cx,cy,cw,ch]=object.crop;
  return <button type="button" className={`mot-composition-object${selected?' selected':''}`} aria-label={`Select ${card?.title??'artwork'}${object.locked?' (locked)':''}`} aria-pressed={selected}
    style={{left:`${object.x*100}%`,top:`${object.y*100}%`,width:`${object.width*100}%`,height:`${object.height*100}%`,transform:`rotate(${object.rotation}deg)`,zIndex:object.zIndex,touchAction:object.locked?'auto':'none'}} onPointerDown={start} onPointerUp={end} onPointerCancel={()=>{drag.current=null;}}
    onClick={onSelect} onKeyDown={event=>{if(object.locked)return;const directions:Record<string,[number,number]>={ArrowLeft:[-.01,0],ArrowRight:[.01,0],ArrowUp:[0,-.01],ArrowDown:[0,.01]};const delta=directions[event.key];if(delta){event.preventDefault();onMove(clamp(object.x+delta[0]),clamp(object.y+delta[1]));}}}>
    {url&&<span className="mot-composition-crop"><svg width="100%" height="100%" viewBox={`${cx*(asset?.width??1000)} ${cy*(asset?.height??1000)} ${cw*(asset?.width??1000)} ${ch*(asset?.height??1000)}`} preserveAspectRatio="xMidYMid meet" aria-hidden="true"><image href={url} width={asset?.width??1000} height={asset?.height??1000} preserveAspectRatio="xMidYMid meet" /></svg></span>}
    {card&&!object.assetId&&<span className="mot-composition-text"><strong>{card.title}</strong><span>{card.body}</span></span>}
  </button>;
}

export function Composition({session,actor,refresh,notify}:{session:TripSession;actor:Actor;refresh:()=>void;notify:(message:string)=>void}) {
  const [selected,setSelected]=useState<string|null>(null),[cardId,setCardId]=useState('');
  const objects=readPresentations(session.parts),current=selected?readPresentation(session.parts,selected):undefined,cards=readAllCards(session.parts);
  const linked=current?.cardId?cards.find(card=>card.id===current.cardId):undefined;
  const execute=(name:string,input:Record<string,unknown>)=>{try{session.execute(actor,name,input);refresh();}catch(error){notify(error instanceof Error?error.message:'The placement could not be changed.');}};
  const update=(patch:Partial<Presentation>)=>{if(current)execute('trip_presentation_update',{id:current.id,...patch});};
  return <section className="mot-composition" aria-label="Trip composition">
    <div className="mot-action-row"><label>Card to place<select className="m-field" value={cardId} onChange={event=>setCardId(event.target.value)}><option value="">Choose a card</option>{cards.map(card=><option value={card.id} key={card.id}>{card.title}</option>)}</select></label><button className="m-btn" type="button" disabled={!cardId} onClick={()=>execute('trip_presentation_create',{cardId,x:.08,y:.08,width:.5,height:.18})}>Place card</button><button className="m-btn" type="button" onClick={()=>{session.undo(actor.id);refresh();}}>Undo</button><button className="m-btn" type="button" onClick={()=>{session.redo(actor.id);refresh();}}>Redo</button></div>
    <div className="mot-composition-layout"><div className="mot-composition-sheet">{objects.map(object=><ObjectView key={object.id} object={object} session={session} selected={selected===object.id} onSelect={()=>setSelected(object.id)} onMove={(x,y)=>{if(!object.locked)execute('trip_presentation_update',{id:object.id,x,y});}} />)}{!objects.length&&<p className="m-muted">Place a card, or add FCC art from the Add menu.</p>}</div>
      <aside className="m-panel mot-composition-tools" aria-label="Placement controls">{current?<>
        <h2>Selected object</h2>{(['x','y','width','height','rotation','zIndex'] as const).map(key=><label key={key}>{key}<input type="number" className="m-field" aria-label={`Object ${key}`} value={current[key]} step={key==='rotation'||key==='zIndex'?1:.01} disabled={current.locked} onChange={event=>update({[key]:Number(event.target.value)})} /></label>)}
        <label>Linked card<select className="m-field" value={current.cardId??''} onChange={event=>update({cardId:event.target.value||undefined})}><option value="" disabled={!current.assetId}>No linked card · decoration</option>{cards.map(card=><option key={card.id} value={card.id}>{card.title}</option>)}</select></label>
        {current.assetId&&<label>Spread pattern<select className="m-field" value={current.pattern??''} disabled={current.locked} onChange={event=>{if(event.target.value)update(magazinePatternPlacement(event.target.value as typeof PRESENTATION_PATTERNS[number]));}}><option value="">Custom placement</option>{PRESENTATION_PATTERNS.map(pattern=><option key={pattern} value={pattern}>{pattern.replace(/-/g,' ')}</option>)}</select></label>}
        {current.assetId&&<label>Magazine slot<select className="m-field" value={current.magazineRole??''} disabled={current.locked} onChange={event=>update({magazineRole:(event.target.value||undefined) as Presentation['magazineRole']})}><option value="">Use spread pattern</option>{Object.entries(ROLE_LABELS).map(([role,label])=><option key={role} value={role}>{label}</option>)}</select></label>}
        {linked&&<><label>Card title<input className="m-field" key={`${linked.id}:${linked.title}`} defaultValue={linked.title} onBlur={event=>{if(event.target.value!==linked.title)execute('trip_card_update',{id:linked.id,title:event.target.value});}} /></label><label>Card notes<textarea className="m-field" key={`${linked.id}:${linked.body}`} defaultValue={linked.body} onBlur={event=>{if(event.target.value!==linked.body)execute('trip_card_update',{id:linked.id,body:event.target.value});}} /></label></>}
        {current.assetId&&current.crop.map((value,index)=><label key={index}>Crop {['left','top','width','height'][index]}<input type="number" className="m-field" step="0.01" min="0" max="1" value={value} disabled={current.locked} onChange={event=>{const crop=[...current.crop] as Presentation['crop'];crop[index]=Number(event.target.value);update({crop});}} /></label>)}
        <label>Visibility<select className="m-field" value={current.scope} onChange={event=>update({scope:event.target.value as Presentation['scope']})}>{['guide','stay','private'].map(scope=><option key={scope}>{scope}</option>)}</select></label>
        <button className="m-btn" type="button" onClick={()=>update({locked:!current.locked})}>{current.locked?'Unlock object':'Lock object'}</button><button className="m-btn" type="button" onClick={()=>{execute('trip_presentation_delete',{id:current.id});setSelected(null);}}>Remove placement</button>
      </>:<p className="m-muted">Select an object to resize, rotate, crop, reorder or lock it. Arrow keys move an unlocked selection.</p>}</aside>
    </div>
  </section>;
}

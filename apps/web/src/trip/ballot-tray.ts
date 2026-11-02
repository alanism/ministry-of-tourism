import type {GroupBallot} from '@writers-board/core';
export type Concern='approved'|'maybe'|'denied';
export const CONCERN_LABELS:Record<Concern,{plain:string;stamp:string}>={approved:{plain:'Works for us',stamp:'Approved'},maybe:{plain:'Question or condition',stamp:'Maybe'},denied:{plain:"Doesn't work for us",stamp:'Denied'}};
const WORDS=['zero','one','two','three','four','five'];
const cap=(s:string)=>s.charAt(0).toUpperCase()+s.slice(1);
export function ordinal(rank:number):string{const suffix=rank===1?'st':rank===2?'nd':rank===3?'rd':'th';return `${rank}${suffix}`;}
export function numberWord(n:number):string{return WORDS[n]??String(n);}
export function rankPoints(rank:number,K:3|5):number{return K+1-rank;}
export function favorites(ballot:GroupBallot):string[]{return [...ballot.rankings].sort((a,b)=>a.rank-b.rank).map(r=>r.option_id);}
const renumber=(ids:string[])=>ids.map((option_id,index)=>({option_id,rank:index+1}));
export function addFavorite(ballot:GroupBallot,optionId:string,K:3|5):GroupBallot{const ids=favorites(ballot);if(ids.includes(optionId))throw new Error('Already one of your favorites');if(ids.length>=K)throw new Error(`${cap(numberWord(K))} favorites picked. Remove one to choose another.`);return {...ballot,rankings:renumber([...ids,optionId])};}
export function moveFavorite(ballot:GroupBallot,optionId:string,direction:'earlier'|'later'):GroupBallot{const ids=favorites(ballot),index=ids.indexOf(optionId);if(index<0)throw new Error('Not one of your favorites');const swap=direction==='earlier'?index-1:index+1;if(swap<0||swap>=ids.length)return ballot;const next=[...ids],a=next[index]!,b=next[swap]!;next[index]=b;next[swap]=a;return {...ballot,rankings:renumber(next)};}
export function removeFavorite(ballot:GroupBallot,optionId:string):GroupBallot{const ids=favorites(ballot);if(!ids.includes(optionId))return ballot;return {...ballot,rankings:renumber(ids.filter(id=>id!==optionId))};}
export function setConcern(ballot:GroupBallot,optionId:string,value:Concern|null):GroupBallot{const stamps=ballot.stamps.filter(s=>s.option_id!==optionId);if(value)stamps.push({option_id:optionId,value});stamps.sort((a,b)=>a.option_id<b.option_id?-1:a.option_id>b.option_id?1:0);return {...ballot,stamps};}
export function trayStatus(ballot:GroupBallot,K:3|5):string{const n=ballot.rankings.length;if(n===0)return `No favorites yet. Pick up to ${numberWord(K)}.`;if(n>=K)return `${cap(numberWord(K))} favorites picked. Remove one to choose another.`;const remaining=K-n;return `${cap(numberWord(n))} ${n===1?'favorite':'favorites'} picked. You can stop here or ${remaining===1?'add one more':`add up to ${numberWord(remaining)} more`}.`;}
export function orderAnnouncement(ballot:GroupBallot,titleOf:(optionId:string)=>string):string{const ids=favorites(ballot);if(!ids.length)return 'No favorites picked.';return ids.map((id,i)=>i===0?`${titleOf(id)} is now ${ordinal(i+1)}`:`${titleOf(id)} ${ordinal(i+1)}`).join('; ')+'.';}
export function ruleSentence(K:3|5):string{const points=Array.from({length:K},(_,i)=>K-i);const rest=points.slice(1),list=rest.length===1?`${rest[0]}`:`${rest.slice(0,-1).join(', ')} and ${rest[rest.length-1]}`;return `Pick up to ${numberWord(K)} favorites: 1st gets ${K} points, then ${list}. Your household has one reply.`;}

import type {FccCityContent,FccError,FccResult} from '@writers-board/core';
import {sourceKey} from './source-card';

export interface SourceLoadState {result?:FccResult<FccCityContent>;pending:boolean;offline:boolean;updatedKeys:string[];failure?:FccError;}
export function finishSourceLoad(previous:SourceLoadState,next:FccResult<FccCityContent>,cityId:string,offline:boolean):SourceLoadState{
  const prior=previous.result&&previous.result.status!=='unavailable'&&previous.result.value.city.id===cityId?previous.result:undefined;
  const updatedKeys=new Set(prior?previous.updatedKeys:[]);
  const wrongCity=next.status!=='unavailable'&&next.value.city.id!==cityId;
  const invalidFeed:FccError={code:'invalid_feed',message:'FCC returned content for another city. It was rejected for the selected city.'};
  if(prior&&next.status==='ready'&&!wrongCity){
    const old=new Map(prior.value.articles.map(a=>[a.id,a])),fresh=new Map(next.value.articles.map(a=>[a.id,a]));
    for(const id of new Set([...old.keys(),...fresh.keys()])){
      const before=old.get(id),after=fresh.get(id);
      if(before?.body!==after?.body||before?.title!==after?.title)updatedKeys.add(sourceKey((after??before)!.source)!);
    }
  }
  return {result:wrongCity?(prior??{status:'unavailable',reason:invalidFeed.message,error:invalidFeed}):next.status==='unavailable'&&prior?prior:next,pending:false,offline,updatedKeys:[...updatedKeys],failure:wrongCity?invalidFeed:next.status==='unavailable'||next.status==='stale'?next.error:undefined};
}

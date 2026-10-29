import {describe,expect,it} from 'vitest';
import type {FccCityContent,FccResult} from '@writers-board/core';
import {finishSourceLoad} from './fcc-state';
const loaded=(body='Before',city='san-sebastian'):FccResult<FccCityContent>=>({status:'ready',retrievedAt:'2026-10-28',sourceVersion:'v1',value:{city:{id:city,name:city,countryCode:null,timeZone:null},articles:[{id:city+':11',cityId:city,title:'Article',body,source:{id:city+':11',sourceId:'11',provider:'fcc',url:'https://example.org/story',canonicalUrl:'https://example.org/story',cityId:city,kind:'article',retrievedAt:'2026-10-28',version:'v1',origin:'editorial'}}],places:[],almanac:[]}});
const unavailable:FccResult<FccCityContent>={status:'unavailable',reason:'Timed out',error:{code:'cancelled',message:'Timed out'}};
describe('FCC source refresh state',()=>{
  it('keeps the last loaded same-city copy when refresh times out',()=>{
    const previous={result:loaded(),pending:true,offline:false,updatedKeys:[]};
    const next=finishSourceLoad(previous,unavailable,'san-sebastian',false);
    expect(next.result).toBe(previous.result);expect(next.failure?.code).toBe('cancelled');expect(next.pending).toBe(false);
  });
  it('never substitutes a previous city for an unavailable destination',()=>{
    const next=finishSourceLoad({result:loaded(),pending:true,offline:false,updatedKeys:[]},unavailable,'bangkok',false);
    expect(next.result).toBe(unavailable);expect(next.updatedKeys).toEqual([]);
  });
  it('marks the changed article, keeping its namespace distinct from a venue ID',()=>{
    const previous={result:loaded(),pending:true,offline:false,updatedKeys:[]};
    const next=finishSourceLoad(previous,loaded('After'),'san-sebastian',false);
    expect(next.updatedKeys).toEqual(['article:san-sebastian:11']);
    expect(previous.result.status==='ready'&&previous.result.value.articles[0]!.body).toBe('Before');
  });
  it('keeps prior update markers through cache revalidation without inventing new changes',()=>{
    const next=finishSourceLoad({result:loaded(),pending:true,offline:false,updatedKeys:['article:earlier']},loaded(),'san-sebastian',false);
    expect(next.updatedKeys).toEqual(['article:earlier']);
  });
});

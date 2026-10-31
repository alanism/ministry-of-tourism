import {expect,it,vi} from 'vitest';
import type {MagazineDocument} from '@writers-board/core';
vi.mock('./standalone-media',()=>({HTML_LIMITS:{pages:128,outputBytes:1024}}));
import {standaloneMagazineHtml} from './standalone-html';
it('identifies source-SVG working rejection separately from measured serialized HTML size',async()=>{
  const issue:MagazineDocument={title:'London',boardId:'fixture',revision:0,pages:[{id:'cover',folio:1,pattern:'personal-cover',svg:'<svg xmlns="http://www.w3.org/2000/svg"/>',assetIds:[],credits:[]}],warnings:[],pictureDpi:[],spreads:[],unusedAssetIds:[]};
  await expect(standaloneMagazineHtml(issue)).rejects.toThrow(/source-SVG working budget/i);
});

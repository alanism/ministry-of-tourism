import {afterEach,expect,it,vi} from 'vitest';
import type {MagazineDocument} from '@writers-board/core';
import {magazinePdf} from './artifacts';

afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});
it('cancels an in-flight image decode without waiting for its result or advertising bytes',async()=>{
  let began!:()=>void;
  const started=new Promise<void>(resolve=>{began=resolve;}),images:{src:string}[]=[];
  vi.stubGlobal('Image',class{src='';constructor(){images.push(this);}decode(){began();return new Promise<void>(()=>{});}});
  const revoke=vi.spyOn(URL,'revokeObjectURL'),controller=new AbortController();
  const magazine:MagazineDocument={title:'Cancellation fixture',boardId:'test',revision:0,warnings:[],pictureDpi:[],spreads:[],unusedAssetIds:[],pages:[{id:'cover',pattern:'personal-cover',folio:1,svg:'<svg xmlns="http://www.w3.org/2000/svg"/>',assetIds:[],credits:[]}]};
  const pending=magazinePdf(magazine,controller.signal).then(()=> 'bytes',()=> 'cancelled');
  await started;controller.abort();
  expect(await Promise.race([pending,new Promise(resolve=>setTimeout(()=>resolve('still decoding'),30))])).toBe('cancelled');
  expect(images[0]?.src).toBe('');expect(revoke).toHaveBeenCalledOnce();
});
it('refuses decoding when image initialization has already cancelled the export',async()=>{
  const controller=new AbortController(),decode=vi.fn(()=>new Promise<void>(()=>{})),images:{src:string}[]=[];
  vi.stubGlobal('Image',class{src='';constructor(){images.push(this);controller.abort();}decode=decode;});
  const revoke=vi.spyOn(URL,'revokeObjectURL');
  const magazine:MagazineDocument={title:'Cancellation fixture',boardId:'test',revision:0,warnings:[],pictureDpi:[],spreads:[],unusedAssetIds:[],pages:[{id:'cover',pattern:'personal-cover',folio:1,svg:'<svg xmlns="http://www.w3.org/2000/svg"/>',assetIds:[],credits:[]}]};
  const pending=magazinePdf(magazine,controller.signal).then(()=> 'bytes',()=> 'cancelled');
  expect(await Promise.race([pending,new Promise(resolve=>setTimeout(()=>resolve('still decoding'),30))])).toBe('cancelled');
  expect(decode).not.toHaveBeenCalled();expect(images[0]?.src).toBe('');expect(revoke).toHaveBeenCalledOnce();
});

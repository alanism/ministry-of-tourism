import {expect,it} from 'vitest';
import {PublicCatalogueReader} from './public-catalogue-browser';
it('explains an unavailable JSON catalogue without exposing returned HTML as a parser error',async()=>{
 const reader=new PublicCatalogueReader(async()=>new Response('<!doctype html><title>App fallback</title>'));
 await expect(reader.manifest(new AbortController().signal)).rejects.toThrow('Catalogue data is unavailable or invalid. Retry when connected.');
});

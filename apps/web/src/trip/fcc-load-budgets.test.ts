import {afterEach,expect,it,vi} from 'vitest';
afterEach(()=>vi.unstubAllGlobals());
it('keeps the FCC three-attempt load and Muse four-attempt initial-plus-manual budgets independent',async()=>{
 const fetcher=vi.fn(async()=>new Response(null,{status:503}));vi.stubGlobal('fetch',fetcher);
 const {browserFcc,browserMuseFcc}=await import('./FccBrowser');
 expect((await browserFcc.getCity('san-sebastian')).status).toBe('unavailable');expect(fetcher).toHaveBeenCalledTimes(3);fetcher.mockClear();
 expect((await browserMuseFcc.getCity('san-sebastian')).status).toBe('unavailable');expect(fetcher).toHaveBeenCalledTimes(2);
 expect((await browserMuseFcc.getCity('san-sebastian')).status).toBe('unavailable');expect(fetcher).toHaveBeenCalledTimes(4);
});

import {expect,it} from 'vitest';
import {createPublicMcpServer,type PublicCatalogue} from './public-mcp.ts';
import {validatePublicDefinition} from './public-mcp-contract.ts';

const catalogue:PublicCatalogue={snapshotId:null,search(){return null;},city(){return null;},item(){return null;},asset(){return null;},validateResult(_name,value){return value;}};
async function request(method:string,id:string|number=1,guide='"'.repeat(1200)){
 const server=createPublicMcpServer({allowedHosts:['127.0.0.1'],catalogue,limits:{maxResponseBytes:4096},documents:{guide:{text:guide,version:'synthetic'}}});
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  const response=await fetch(`http://127.0.0.1:${(server.address() as {port:number}).port}/mcp`,{method:'POST',headers:{'content-type':'application/json',accept:'application/json, text/event-stream'},body:JSON.stringify({jsonrpc:'2.0',id,method,...(method==='tools/call'?{params:{name:'mot_get_capabilities',arguments:{document:'guide'}}}:{})})});
  const text=await response.text();return{status:response.status,text,body:JSON.parse(text)};
 }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));}
}
it('caps the actual SDK JSON-RPC response after nested text escaping, preserving a small request ID',async()=>{
 const response=await request('tools/call','synthetic-id');
 expect(Buffer.byteLength(response.text)).toBeLessThanOrEqual(4096);
 expect(response.body.id).toBe('synthetic-id');expect(response.body.error).toBeDefined();
 expect(response.text).not.toContain('"status":"available"');
});
it('caps discovery and safely refuses an ID that cannot fit a bounded protocol error',async()=>{
 const listing=await request('tools/list');expect(Buffer.byteLength(listing.text)).toBeLessThanOrEqual(4096);expect(listing.body.id).toBe(1);
 const response=await request('tools/call','PRIVATE-ID-CANARY'+ 'x'.repeat(6000),'small guide');
 expect(Buffer.byteLength(response.text)).toBeLessThanOrEqual(4096);expect(response.status).toBe(413);
 expect(response.body.code).toBe('LIMIT_EXCEEDED');expect(response.text).not.toContain('PRIVATE-ID-CANARY');
});
it('requires enough configured response budget for a safe error',()=>{
 expect(()=>createPublicMcpServer({allowedHosts:['127.0.0.1'],catalogue,limits:{maxResponseBytes:255}})).toThrow(/response.*256/i);
});
const item={id:'synthetic',type:'art',title:'"'.repeat(490),originCityId:'kyoto',countryCode:'JP',sourceId:'synthetic-source',sourceVersion:'v1',catalogSnapshot:'snapshot',retrievedAt:'2026-11-02T00:00:00Z',freshness:'ready',rights:{credit:'Synthetic public source',evidence:'documented',policyRef:'fixture'},eligibility:Object.fromEntries(['discover','preview','insert','share','embed','shop'].map(name=>[name,{allowed:false,reason:'Synthetic public metadata'}]))};
const page={contractVersion:1,status:'ready',catalogSnapshot:'snapshot',items:[item],nextCursor:null,coverage:{sourceRows:1,unresolvedRows:0,excludedRows:0}};
async function searchRequest(id:string|number,cap:number,args:Record<string,unknown>={purpose:'personal-trip'}){
 const server=createPublicMcpServer({allowedHosts:['127.0.0.1'],catalogue:{...catalogue,snapshotId:'snapshot',search:()=>page},limits:{maxResponseBytes:8192,maxSearchResponseBytes:cap}});
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{const response=await fetch(`http://127.0.0.1:${(server.address() as {port:number}).port}/mcp`,{method:'POST',headers:{'content-type':'application/json',accept:'application/json, text/event-stream'},body:JSON.stringify({jsonrpc:'2.0',id,method:'tools/call',params:{name:'fcc_search_catalog',arguments:args}})});const text=await response.text();return{status:response.status,text,body:JSON.parse(text)};}
 finally{await new Promise<void>(resolve=>server.close(()=>resolve()));}
}
it('uses the smaller advertised search cap for the complete escaped page rather than only its inner JSON',async()=>{
 const cap=Buffer.byteLength(JSON.stringify(page))+10,response=await searchRequest('search-id',cap);
 expect(Buffer.byteLength(response.text)).toBeLessThanOrEqual(cap);expect(response.body.id).toBe('search-id');
 expect(response.body.error||response.body.result?.isError).toBeTruthy();
});
it('keeps versioned search failures under the global cap, including small search budgets and long IDs',async()=>{
 for(const cap of [128,2362]){
  const small=await searchRequest(1,cap,{purpose:'personal-trip',privateCanary:'PRIVATE-ARG-CANARY'});
  expect(Buffer.byteLength(small.text)).toBeLessThanOrEqual(8192);expect(small.text).not.toContain('PRIVATE-ARG-CANARY');expect(small.body.result.isError).toBe(true);expect(validatePublicDefinition('failure',JSON.parse(small.body.result.content[0].text))).toBe(true);
  const long=await searchRequest('PRIVATE-ID-CANARY'+'x'.repeat(9000),cap,{purpose:'personal-trip',privateCanary:'PRIVATE-ARG-CANARY'});
  expect(Buffer.byteLength(long.text)).toBeLessThanOrEqual(8192);expect(long.status).toBe(413);expect(long.body.code).toBe('LIMIT_EXCEEDED');expect(long.text).not.toContain('PRIVATE-ID-CANARY');
 }
});
it('returns a schema-valid search failure when an echoed ID makes successful search wire too large',async()=>{
 const id='x'.repeat(3000),response=await searchRequest(id,2362);
 expect(Buffer.byteLength(response.text)).toBeLessThanOrEqual(8192);expect(response.body.id).toBe(id);expect(response.body.result.isError).toBe(true);
 const failure=JSON.parse(response.body.result.content[0].text);expect(failure.code).toBe('LIMIT_EXCEEDED');expect(validatePublicDefinition('failure',failure)).toBe(true);
});

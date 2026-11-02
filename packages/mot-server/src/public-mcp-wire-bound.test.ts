import {expect,it} from 'vitest';
import {createPublicMcpServer,type PublicCatalogue} from './public-mcp.ts';

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

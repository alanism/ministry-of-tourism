import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as http from "node:http";
import {connect as connectSocket} from 'node:net';
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createPublicMcpServer, type PublicCatalogue } from "./public-mcp.js";

type Entry = { operation: string; status: string; requestBytes: number; responseBytes: number; durationMs: number };
let servers: http.Server[] = [];
let logs: Entry[] = [];
let searchCalls = 0; let itemCalls = 0; let mode: "ok" | "hang" | "big" = "ok";
const guideText = "# Guide\nUse public catalogue data carefully.\n";
const publicItem = () => ({id:'item-1',type:'art',title:'Castle',originCityId:'kyoto',countryCode:'JP',sourceId:'source-one',sourceVersion:'v1',catalogSnapshot:'snap-1',retrievedAt:'2026-11-02T00:00:00Z',freshness:'ready',rights:{credit:'Synthetic source',evidence:'documented',policyRef:'fixture'},eligibility:Object.fromEntries(['discover','preview','insert','share','embed','shop'].map(operation=>[operation,{allowed:false,reason:'Fixture metadata only'}]))});
function catalogue(): PublicCatalogue {
  return {
    snapshotId: "snap-1",
    async search(args, signal) {
      searchCalls++;
      if (mode === "big") return { blob: "x".repeat(5000) };
      if (mode === "hang") return new Promise(() => {});
      return {contractVersion:1,status:'ready',catalogSnapshot:'snap-1',items:[publicItem()],nextCursor:null,coverage:{sourceRows:1,unresolvedRows:0,excludedRows:0}};
    },
    async city() { return { id: "kyoto", name: "Kyoto" }; },
    async item() { itemCalls++; return publicItem(); },
    async asset() { return { id: "asset-1", url: "https://example.invalid/a.jpg" }; },
    validateResult(_tool, value) { return value; },
  };
}
async function start(opts: any = {}) {
  const server = createPublicMcpServer({ allowedHosts: ["127.0.0.1"], allowedOrigins: ["https://allowed.example"], catalogue: catalogue(), documents: { guide: { text: guideText, version: "guide-v1" }, proposalContract: { schemaJson: '{"$id":"urn:mot:public-file:1"}' } }, log: (e) => logs.push(e), ...opts });
  servers.push(server);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as any).port;
  return { server, port, url: `http://127.0.0.1:${port}/mcp` };
}
async function connect(url: string) {
  const client = new Client({ name: "local-test-client", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(new URL(url));
  await client.connect(transport);
  return { client, transport };
}
function textOf(result: any): string { return result.content?.[0]?.text ?? ""; }
function raw(port: number, opts: http.RequestOptions & { body?: string | Buffer } = {}) {
  return new Promise<{ status: number; body: string; headers: http.IncomingHttpHeaders }>((resolve, reject) => {
    const body = opts.body ?? JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "raw", version: "1" } } });
    const req = http.request({ host: "127.0.0.1", port, path: "/mcp", method: "POST", ...opts, headers: { "content-type": "application/json", accept: "application/json, text/event-stream", host: "127.0.0.1", ...(opts.headers || {}) } }, (res) => { let d = ""; res.on("data", (c) => d += c); res.on("end", () => resolve({ status: res.statusCode || 0, body: d, headers: res.headers })); });
    req.on("error", reject); req.end(body);
  });
}
beforeEach(() => { logs = []; searchCalls = 0; itemCalls = 0; mode = "ok"; });
afterEach(async () => { await Promise.all(servers.map((s) => new Promise<void>((r) => s.close(() => r())))); servers = []; });

describe("public MCP boundary", () => {
  it("real SDK initialize/list/search/item and guide fallback", async () => {
    const { url } = await start();
    const { client, transport } = await connect(url);
    // Local native SDK observation only; this is not evidence about Muse's client.
    expect(client.getServerVersion()?.name).toBe("mot-public-mcp");
    const listed = await client.listTools();
    expect(listed.tools.map((t) => t.name)).toEqual(["mot_get_capabilities", "fcc_search_catalog", "fcc_get_city", "fcc_get_item", "fcc_get_asset"]);
    expect(listed.tools.some((t) => /trip|proposal|apply|undo|execute/i.test(t.name))).toBe(false);
    for (const t of listed.tools) expect(t.annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false });
    const search = await client.callTool({ name: "fcc_search_catalog", arguments: { purpose: "personal-trip", query: "castle" } });
    expect(JSON.parse(textOf(search))).toMatchObject({ items: [{ id: "item-1" }] });
    const item = await client.callTool({ name: "fcc_get_item", arguments: { itemId: "item-1" } });
    expect(JSON.parse(textOf(item))).toMatchObject({ id: "item-1", title: "Castle" });
    const caps = JSON.parse(textOf(await client.callTool({ name: "mot_get_capabilities", arguments: {} })));
    expect(caps).toMatchObject({ protocolRevision: null, catalogSnapshot: "snap-1", routes: { publicDiscovery: "available", localProposalFiles: "unavailable", privateTripAccess: "deferred", agentApply: "unavailable" } });
    const guide = JSON.parse(textOf(await client.callTool({ name: "mot_get_capabilities", arguments: { document: "guide" } })));
    expect(guide.sha256).toBe(createHash("sha256").update(guideText, "utf8").digest("hex"));
    expect(guide.text).toBe(guideText);
    await transport.close();
  });
  it("rejects unknown/private args before adapter and logs no canary", async () => {
    const { url } = await start();
    const { client, transport } = await connect(url);
    const bad: any = await client.callTool({ name: "fcc_search_catalog", arguments: { purpose: "personal-trip", query: "SECRET_CANARY", boardId: "SECRET_CANARY", context: { tripId: "x" } } });
    expect(bad.isError).toBe(true); expect(searchCalls).toBe(0);
    expect(JSON.stringify(logs)).not.toContain("SECRET_CANARY");
    await transport.close();
  });
  it("enforces host, origin, encoding, method, path and custom lower body limit", async () => {
    const { port } = await start({ limits: { maxBodyBytes: 80 } });
    expect((await raw(port)).status).toBe(413);
    const { port: p2 } = await start();
    expect((await raw(p2, { headers: { host: "evil.example" } })).status).toBe(403);
    expect((await raw(p2, { headers: { origin: "https://evil.example" } })).status).toBe(403);
    expect((await raw(p2, { headers: { origin: "null" } })).status).toBe(403);
    expect((await raw(p2, { headers: { "content-encoding": "gzip" } })).status).toBe(415);
    const get = await fetch(`http://127.0.0.1:${p2}/mcp`); expect(get.status).toBe(405);
    const wrong = await fetch(`http://127.0.0.1:${p2}/other`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }); expect(wrong.status).toBe(404);
    const batch = await raw(p2, { body: "[]" }); expect(batch.status).toBe(400);
  });
  it("enforces tool output limit without truncation", async () => {
    mode = "big";
    const { url } = await start({ limits: { maxSearchResponseBytes: 128 } });
    const { client, transport } = await connect(url);
    const r: any = await client.callTool({ name: "fcc_search_catalog", arguments: { purpose: "host-guide" } });
    expect(r.isError).toBe(true); expect(textOf(r).length).toBeLessThan(600); expect(textOf(r)).not.toContain("xxxxx");
    await transport.close();
  });
  it("deadline settles ignoring adapter, releases slot, then recovers", async () => {
    const { url } = await start({ limits: { timeoutMs: 120, maxConcurrent: 1 } });
    const { client, transport } = await connect(url);
    mode = "hang";
    const started = Date.now();
    await expect(client.callTool({ name: "fcc_search_catalog", arguments: { purpose: "personal-trip" } })).rejects.toThrow(/deadline exceeded/);
    expect(Date.now() - started).toBeLessThan(3000);
    mode = "ok";
    const ok = await client.callTool({ name: "fcc_search_catalog", arguments: { purpose: "personal-trip" } });
    expect(ok.isError).not.toBe(true);
    await transport.close();
  });
  it("bounds concurrency with a sanitized failure", async () => {
    const { port, url } = await start({ limits: { timeoutMs: 800, maxConcurrent: 1 } });
    mode = "hang";
    const { client, transport } = await connect(url);
    const slow: any = client.callTool({ name: "fcc_search_catalog", arguments: { purpose: "personal-trip" } }).catch((e) => ({ error: String(e) }));
    await new Promise((r) => setTimeout(r, 50));
    const second = await raw(port);
    expect(second.status).toBe(429); expect(second.body).not.toContain("personal-trip");
    mode = "ok"; await slow; await transport.close();
  });
});

describe('Astra boundary regressions', () => {
  it('records the actual local protocol and keeps diagnostics failures isolated',async()=>{
    const {port}=await start({log:()=>{throw new Error('PRIVATE_DIAGNOSTIC_CANARY');}});
    const response=await raw(port);
    expect(response.status).toBe(200);
    expect(JSON.parse(response.body).result.protocolVersion).toBe('2025-03-26');
    expect(JSON.parse(response.body).result.capabilities).toEqual({tools:{}});
    expect(response.body).not.toContain('PRIVATE_DIAGNOSTIC_CANARY');
  });
  it('only advertises real response definitions, including the document union', async () => {
    const schema = JSON.parse(readFileSync(new URL('../../../docs/mcp-public-file.schema.json', import.meta.url), 'utf8'));
    const {url} = await start(), {client} = await connect(url);
    try {
      const caps = JSON.parse(textOf(await client.callTool({name:'mot_get_capabilities',arguments:{}})));
      for(const tool of caps.tools) {
        expect(schema.$defs[tool.inputSchemaRef.split('/').at(-1)]).toBeDefined();
        if(tool.outputSchemaRef) expect(schema.$defs[tool.outputSchemaRef.split('/').at(-1)]).toBeDefined();
      }
      expect(caps.tools[0].outputSchemaRef).toBe('urn:mot:public-file:1#/$defs/publicInfoResponse');
    } finally { await client.close(); }
  });
  it('rejects duplicate type filters and escaped lone surrogates before the catalogue', async () => {
    const {url,port}=await start(),{client}=await connect(url);
    try {
      const result=await client.callTool({name:'fcc_search_catalog',arguments:{purpose:'personal-trip',types:['art','art']}});
      expect(result.isError).toBe(true);
      const invalid=await raw(port,{body:'{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"fcc_search_catalog","arguments":{"purpose":"personal-trip","query":"\\ud800"}}}'});
      expect(invalid.status).toBe(400);
      expect(searchCalls).toBe(0);
    } finally { await client.close(); }
  });
  it('never logs user supplied protocol method names', async () => {
    const {port}=await start();
    await raw(port,{body:JSON.stringify({jsonrpc:'2.0',id:9,method:'PRIVATE_METHOD_CANARY'})});
    expect(JSON.stringify(logs)).not.toContain('PRIVATE_METHOD_CANARY');
  });
  it('enforces the guide UTF-8 cap and does not return a fake complete schema', async () => {
    const {url}=await start({documents:{guide:{text:'é'.repeat(70000),version:'test'},proposalContract:{schemaJson:'{"$id":"urn:mot:public-file:1"}'}}}),{client}=await connect(url);
    try {
      expect((await client.callTool({name:'mot_get_capabilities',arguments:{document:'guide'}})).isError).toBe(true);
      expect((await client.callTool({name:'mot_get_capabilities',arguments:{document:'proposal-contract'}})).isError).toBe(true);
    } finally { await client.close(); }
  });
  it('rejects private output even when an injected adapter validator passes it through', async () => {
    const cat=catalogue();cat.item=()=>({...publicItem(),privateNotes:'PRIVATE_RESULT_CANARY'});
    const {url}=await start({catalogue:cat}),{client}=await connect(url);
    try {
      const result=await client.callTool({name:'fcc_get_item',arguments:{itemId:'item-1'}});
      expect(result.isError).toBe(true);expect(textOf(result)).not.toContain('PRIVATE_RESULT_CANARY');
    } finally { await client.close(); }
  });
  it('expires a stalled upload and releases its slot without waiting for another chunk', async () => {
    const {port}=await start({limits:{timeoutMs:70,maxConcurrent:1}});
    let request!:http.ClientRequest;
    const expired=new Promise<number>(resolve=>{
      request=http.request({host:'127.0.0.1',port,path:'/mcp',method:'POST',headers:{host:'127.0.0.1','content-type':'application/json','content-length':'1000'}},res=>{res.resume();res.on('end',()=>resolve(res.statusCode!));});
      request.on('error',()=>resolve(0));request.write('{');
    });
    try {
      const outcome=await Promise.race([expired,new Promise<number>(resolve=>setTimeout(()=>resolve(-1),250))]);
      expect(outcome).toBe(408);
      expect((await raw(port)).status).toBe(200);
    } finally {request.destroy();}
  });
  it('cancels a disconnected query, then accepts a fresh request', async () => {
    let entered!:()=>void;const started=new Promise<void>(resolve=>entered=resolve);let observed:AbortSignal|undefined;
    const cat=catalogue();cat.search=(_args,signal)=>{observed=signal;entered();return new Promise(()=>{});};
    const {port}=await start({catalogue:cat,limits:{maxConcurrent:1,timeoutMs:1000}});
    const request=http.request({host:'127.0.0.1',port,path:'/mcp',method:'POST',headers:{host:'127.0.0.1','content-type':'application/json',accept:'application/json, text/event-stream'}});
    request.on('error',()=>{});request.end(JSON.stringify({jsonrpc:'2.0',id:2,method:'tools/call',params:{name:'fcc_search_catalog',arguments:{purpose:'personal-trip'}}}));
    await started;request.destroy();
    await new Promise(resolve=>setTimeout(resolve,30));
    expect(observed?.aborted).toBe(true);expect((await raw(port)).status).toBe(200);
  });
  it('bounds the actual streamed bytes, arguments, JSON depth and malformed UTF-8', async()=>{
    const {port,url}=await start({limits:{maxBodyBytes:999999}}),{client}=await connect(url);
    try {
      expect((await raw(port,{body:' '.repeat(65537)})).status).toBe(413);
      expect((await raw(port,{body:Buffer.from([0x7b,0xc0,0xaf,0x7d])})).status).toBe(400);
      let nested:unknown='private';for(let n=0;n<18;n++)nested={child:nested};
      expect((await raw(port,{body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:nested})})).status).toBe(400);
      const result=await client.callTool({name:'fcc_search_catalog',arguments:{purpose:'personal-trip',query:'x'.repeat(17000)}});
      expect(JSON.parse(textOf(result)).code).toBe('LIMIT_EXCEEDED');
      expect((await raw(port,{headers:{'content-type':'application/json-malicious'}})).status).toBe(415);
      expect(searchCalls).toBe(0);
    } finally {await client.close();}
  });
  it('reports lowered result caps and explicit missing documents/catalogue without raw provider errors',async()=>{
    const cat={...catalogue(),snapshotId:null};
    const {url}=await start({catalogue:cat,documents:{},limits:{maxSearchResponseBytes:1000}}),{client}=await connect(url);
    try {
      const caps=JSON.parse(textOf(await client.callTool({name:'mot_get_capabilities',arguments:{}})));
      expect(caps.routes.publicDiscovery).toBe('unavailable');expect(caps.limits.searchResultBytes).toBe(1000);
      expect(JSON.parse(textOf(await client.callTool({name:'mot_get_capabilities',arguments:{document:'guide'}}))).status).toBe('unavailable');
      const result=await client.callTool({name:'fcc_get_item',arguments:{itemId:'anything'}});
      expect(JSON.parse(textOf(result)).code).toBe('CATALOG_UNAVAILABLE');expect(itemCalls).toBe(0);
    } finally {await client.close();}
  });
  it('closes stalled headers under the declared deadline',async()=>{
    const {port}=await start({limits:{timeoutMs:70}});
    const socket=connectSocket(port,'127.0.0.1');socket.on('error',()=>{});socket.resume();
    const closed=new Promise<boolean>(resolve=>socket.once('close',()=>resolve(true)));
    socket.write('POST /mcp HTTP/1.1\r\nHost: 127.0.0.1\r\n');
    try {expect(await Promise.race([closed,new Promise<boolean>(resolve=>setTimeout(()=>resolve(false),250))])).toBe(true);}
    finally {socket.destroy();}
  });
});

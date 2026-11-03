import {expect,it} from 'vitest';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {createPublicCatalogue} from './public-mcp-catalogue.ts';
import {createPublicMcpServer} from './public-mcp.ts';
import {publicContract,validatePublicDefinition} from './public-mcp-contract.ts';
import {createHash} from 'node:crypto';

const url='https://foreignclubberscorespondence.web.app/artwork/fixture.png';
const eligibility=Object.fromEntries(['discover','preview','insert','share','embed','shop'].map(operation=>[operation,{allowed:operation==='discover'||operation==='preview',reason:'Synthetic metadata-only fixture'}]));
function fixture(){
 const row={id:'one',type:'art',title:'Public item',originCityId:'aspen',countryCode:'US',sourceId:'source-one',sourceVersion:'v1',retrievedAt:'2026-11-02T00:00:00Z',freshness:'ready',rights:{credit:'Fixture',evidence:'documented',policyRef:'fixture'},eligibility,sourceUrl:url,sourceUnit:'asset-row',sourceState:'matched',category:'city-illustrations',line:null,cityLabel:'Aspen',countryLabel:'United States',thumbnailUrl:null,thumbnailRole:null,detail:'/fcc-catalogue/details/aspen.json'};
 const index={schema:'mot.public-catalogue.index/1',snapshotId:'snapshot',items:[row,{...row,id:'two',sourceId:'source-two',title:'Second item'}],coverage:{sourceRows:2,unresolvedRows:0,excludedRows:0,shopProductRecords:0,runtimeExtraRecords:0,cities:0,articles:0,places:0},gaps:[],aliases:[],tombstones:[]};
 const detail={schema:'mot.public-catalogue.detail/1',snapshotId:'snapshot',locator:row.detail,items:index.items.map(item=>({...item,representations:[{role:'original',url,width:100,height:80,sha256:'a'.repeat(64)}],sourceRelations:{matchedMotIds:[],aliasSourceIds:[],frame:null,crop:null},runtimeArtwork:null}))};
 return {index,detail,details:new Map([[row.detail,detail]])};
}
const parse=(result:unknown)=>JSON.parse((result as {content:{text:string}[]}).content[0]!.text);
it('runs SDK search/continuation/city/item/asset against the same strict snapshot and full document contract',async()=>{
 const {index,details}=fixture(),catalogue=createPublicCatalogue(index,details);
 const schemaJson=JSON.stringify(publicContract),guide='# Maintained guide\nSynthetic test content.';
 const server=createPublicMcpServer({allowedHosts:['127.0.0.1'],catalogue,documents:{guide:{text:guide,version:'test'},proposalContract:{schemaJson}}});
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 const client=new Client({name:'local SDK integration',version:'1'});
 try{
  await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${(server.address() as {port:number}).port}/mcp`)));
  const first=parse(await client.callTool({name:'fcc_search_catalog',arguments:{purpose:'personal-trip',limit:1}}));
  expect(validatePublicDefinition('catalogPage',first)).toBe(true);expect(first.items).toHaveLength(1);
  const next=parse(await client.callTool({name:'fcc_search_catalog',arguments:{purpose:'personal-trip',limit:1,cursor:first.nextCursor}}));
  expect(next.items[0].id).not.toBe(first.items[0].id);expect(next.nextCursor).toBeNull();
  const city=parse(await client.callTool({name:'fcc_get_city',arguments:{cityId:'aspen',snapshot:'snapshot'}}));
  expect(validatePublicDefinition('cityResult',city)).toBe(true);expect(city.items).toHaveLength(2);
  const item=parse(await client.callTool({name:'fcc_get_item',arguments:{itemId:'one'}}));
  expect(item.sourceUrl).toBe(url);expect(validatePublicDefinition('catalogItem',item)).toBe(true);
  const asset=parse(await client.callTool({name:'fcc_get_asset',arguments:{assetId:'one',rendition:'original',purpose:'personal-trip'}}));
  expect(validatePublicDefinition('assetResult',asset)).toBe(true);expect(asset.representations[0].url).toBe(url);
  expect(validatePublicDefinition('assetResult',{...asset,representations:[{role:'original',url:'http://127.0.0.1/private'}]})).toBe(false);
  const document=parse(await client.callTool({name:'mot_get_capabilities',arguments:{document:'proposal-contract'}}));
  expect(JSON.parse(document.schemaJson)).toEqual(publicContract);expect(document.sha256).toBe(createHash('sha256').update(schemaJson).digest('hex'));
  const guideResult=parse(await client.callTool({name:'mot_get_capabilities',arguments:{document:'guide'}}));
  expect(guideResult.sha256).toBe(createHash('sha256').update(guide).digest('hex'));
 }finally{await client.close();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
it('keeps missing/stale/unavailable/denied representations distinct, without URLs from mismatched detail',async()=>{
 const {index,details,detail}=fixture(),catalogue=createPublicCatalogue(index,details),signal=new AbortController().signal;
 await expect(catalogue.item({itemId:'one',snapshot:'old'},signal)).rejects.toThrow(/SNAPSHOT_CHANGED/);
 await expect(catalogue.search({purpose:'personal-trip',cursor:'invalid'},signal)).rejects.toThrow(/CURSOR_INVALID/);
 await expect(catalogue.item({itemId:'missing'},signal)).rejects.toThrow(/CATALOG_UNAVAILABLE/);
 await expect(catalogue.asset({assetId:'one',rendition:'invented',purpose:'personal-trip'},signal)).rejects.toThrow(/NOT_ELIGIBLE/);
 const blocked=structuredClone(index);blocked.items[0]!.eligibility.preview={allowed:false,reason:'Unresolved source'};
 await expect(createPublicCatalogue(blocked,details).asset({assetId:'one',rendition:'original',purpose:'personal-trip'},signal)).rejects.toThrow(/NOT_ELIGIBLE/);
 details.set(detail.locator,{...detail,snapshotId:'another'});
 await expect(catalogue.asset({assetId:'one',rendition:'original',purpose:'personal-trip'},signal)).rejects.toThrow(/CATALOG_UNAVAILABLE/);
});

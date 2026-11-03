import {expect,it} from 'vitest';
import {createPublicCatalogue} from './public-mcp-catalogue.ts';
it('returns the same personal-only restriction for host-guide search and asset metadata',async()=>{
 const no={allowed:false,reason:'No additional grant'},yes={allowed:true,reason:'Personal-trip rendition only'};
 const row={id:'synthetic-rendition',type:'art',title:'Approved crop',originCityId:'new-york',countryCode:'US',sourceId:'synthetic-source',sourceVersion:'v1',retrievedAt:'2026-11-02T00:00:00Z',freshness:'ready',rights:{credit:'FCC',evidence:'unknown',policyRef:'MOT-92'},eligibility:{discover:yes,preview:yes,insert:yes,share:no,embed:no,shop:no},sourceUnit:'asset-row',sourceState:'unresolved',category:'people',line:null,cityLabel:'New York',countryLabel:'United States',thumbnailUrl:null,thumbnailRole:null,runtimeArtworkId:null,personalOnly:true,detail:'/fcc-catalogue/details/new-york.json'};
 const index={schema:'mot.public-catalogue.index/1',snapshotId:'synthetic-snapshot',items:[row],coverage:{sourceRows:1,unresolvedRows:1,excludedRows:0,shopProductRecords:0,runtimeExtraRecords:0,cities:0,articles:0,places:0},gaps:[],aliases:[],tombstones:[]};
 const detail={schema:'mot.public-catalogue.detail/1',snapshotId:index.snapshotId,locator:row.detail,items:[{...row,representations:[{role:'rendition',url:'https://foreignclubberscorespondence.web.app/crop.webp',width:180,height:520}],sourceRelations:{matchedMotIds:[],aliasSourceIds:[],frame:null,crop:null},runtimeArtwork:null}]};
 const catalogue=createPublicCatalogue(index,new Map([[row.detail,detail]])),signal=new AbortController().signal;
 const page=await catalogue.search({purpose:'host-guide'},signal) as {items:{eligibility:{insert:{allowed:boolean}}}[]};
 expect(page.items[0]!.eligibility.insert.allowed).toBe(false);
 const result=await catalogue.asset({assetId:row.id,rendition:'rendition',purpose:'host-guide'},signal) as {item:{eligibility:{insert:{allowed:boolean}}}};
 expect(result.item.eligibility.insert.allowed).toBe(false);
});

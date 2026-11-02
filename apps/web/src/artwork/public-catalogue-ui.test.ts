import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {expect,it} from 'vitest';
import {CatalogueResults,CatalogueSourceDetails} from './PublicCatalogueBrowser';
import {catalogueItemSchema} from '@writers-board/core';
const no={allowed:false,reason:'Source mapping needs an owner decision'};
const item=catalogueItemSchema.parse({id:'shirt:variant-17',type:'shirt',title:'Map colour tee · variant 17',originCityId:'rome',countryCode:'IT',sourceId:'product-17',sourceVersion:'release-1',retrievedAt:'2026-11-02T00:00:00Z',freshness:'ready',rights:{credit:'FCC illustrator',evidence:'unknown',policyRef:'MOT-92'},eligibility:{discover:{allowed:true,reason:'Published'},preview:no,insert:no,share:no,embed:no,shop:{allowed:true,reason:'City shop supported'}},sourceUnit:'shop-product',sourceState:'published',category:'apparel',line:'map-colour',cityLabel:'Rome',countryLabel:'Italy',thumbnailUrl:'https://foreignclubberscorespondence.web.app/mockup.webp',thumbnailRole:'apparel-mockup',detail:'/fcc-catalogue/details/rome.json',shopUrl:'https://foreignclubberscorespondence.web.app/shop.html?city=rome'});
it('keeps unavailable published identities discoverable without fetching an unapproved preview',()=>{
 const html=renderToStaticMarkup(createElement(CatalogueResults,{items:[item],selectedId:null,busy:false,onSelect(){}}));
 expect(html).toContain('Map colour tee');expect(html).toContain('Rome');expect(html).toContain('Apparel mockup');expect(html).toContain('Source mapping needs an owner decision');expect(html).not.toContain('<img');
});
it('labels city-only shop handoff and gives it no referrer or private trip context',()=>{
 const html=renderToStaticMarkup(createElement(CatalogueSourceDetails,{item}));
 expect(html).toContain('Open Rome’s FCC shop');expect(html).toContain('no design, size or stock selection');expect(html).toContain('referrerPolicy="no-referrer"');expect(html).toContain('noopener noreferrer');expect(html).toContain('FCC illustrator');expect(html).toContain('unknown');
 expect(html).not.toMatch(/Buy now|Order this design|tripId=/);
});
it('does not offer a shop route when canonical eligibility disallows it',()=>{
 const html=renderToStaticMarkup(createElement(CatalogueSourceDetails,{item:{...item,eligibility:{...item.eligibility,shop:no}}}));
 expect(html).not.toContain('href=');expect(html).toContain('Source mapping needs an owner decision');
});

it('labels a missing list thumbnail separately from the available selected-item preview',()=>{
 const html=renderToStaticMarkup(createElement(CatalogueResults,{items:[{...item,thumbnailUrl:null,thumbnailRole:null,eligibility:{...item.eligibility,preview:{allowed:true,reason:'A verified rendition is available'}}}],selectedId:null,busy:false,onSelect(){}}));
 expect(html).toContain('Thumbnail unavailable');expect(html).not.toContain('<img');
});

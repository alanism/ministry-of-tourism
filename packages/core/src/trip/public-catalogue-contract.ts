import {z} from 'zod';
import {publicCatalogueItemSchema,publicCatalogueCitySchema,publicCatalogueAssetSchema} from './public-catalogue.ts';
/** Feature response definitions, generated from the same runtime schemas. Existing $defs stay authoritative. */
export function compileCatalogueResponseDefinitions(){
 const plain=(schema:z.ZodType)=>{const{$schema,...value}=z.toJSONSchema(schema);return value;};
 const item={allOf:[{$ref:'#/$defs/catalogItem'},plain(publicCatalogueItemSchema)]};
 const cityResult=plain(publicCatalogueCitySchema),assetResult=plain(publicCatalogueAssetSchema);
 cityResult.properties!.items={type:'array',maxItems:50,items:item};
 assetResult.properties!.item={anyOf:[item,{type:'null'}]};
 return{cityResult,assetResult};
}

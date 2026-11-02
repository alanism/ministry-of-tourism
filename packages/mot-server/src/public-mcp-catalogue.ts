// Pure adapter over the same snapshot/domain used by human discovery; no URL fetcher.
import { CATALOGUE_LIMITS, validateCatalogueIndex, searchCatalogue, readCatalogueItem, validateCatalogueDetail,
  toPublicCatalogueItem, toPublicCataloguePage, publicCatalogueItemSchema, publicCataloguePageSchema,
  publicCatalogueCitySchema, publicCatalogueAssetSchema, type CatalogueQuery } from '../../core/src/trip/public-catalogue.ts';
import { PublicCatalogueError, validatePublicDefinition } from './public-mcp-contract.ts';
import type { CatalogTool, PublicCatalogue } from './public-mcp.ts';

export function createPublicCatalogue(rawIndex: unknown, details: ReadonlyMap<string, unknown>): PublicCatalogue {
  const index = validateCatalogueIndex(rawIndex);
  const input = (definition: string, args: unknown, signal: AbortSignal) => {
    signal.throwIfAborted();
    if (!validatePublicDefinition(definition, args)) throw new PublicCatalogueError('INVALID_INPUT');
    const value = args as Record<string, unknown>;
    if (value.snapshot !== undefined && value.snapshot !== index.snapshotId) throw new PublicCatalogueError('SNAPSHOT_CHANGED');
    return value;
  };
  const item = (id: string) => {
    const result = readCatalogueItem(index, id);
    if (!result.item) throw new PublicCatalogueError('CATALOG_UNAVAILABLE');
    return result.item;
  };
  const validators = { fcc_search_catalog: publicCataloguePageSchema, fcc_get_city: publicCatalogueCitySchema,
    fcc_get_item: publicCatalogueItemSchema, fcc_get_asset: publicCatalogueAssetSchema };
  return {
    snapshotId: index.snapshotId,
    async search(args, signal) {
      input('catalogSearch', args, signal);
      try {
        const result = await searchCatalogue(index, args as CatalogueQuery); signal.throwIfAborted();
        return toPublicCataloguePage(result);
      } catch { signal.throwIfAborted(); throw new PublicCatalogueError((args as CatalogueQuery).cursor ? 'CURSOR_INVALID' : 'CATALOG_UNAVAILABLE'); }
    },
    async city(args, signal) {
      const value = input('cityRequest', args, signal), cityId = value.cityId as string;
      // Continue a city summary through fcc_search_catalog with this cityId and purpose.
      const page = await searchCatalogue(index, { purpose: 'personal-trip', cityId, limit: 50 });
      signal.throwIfAborted();
      return publicCatalogueCitySchema.parse({ ...toPublicCataloguePage(page), cityId,
        status: page.items.length ? page.status : 'unavailable' });
    },
    async item(args, signal) {
      const value = input('itemRequest', args, signal);
      if (value.cursor) throw new PublicCatalogueError('CURSOR_INVALID'); // No article body continuation is advertised.
      return toPublicCatalogueItem(item(value.itemId as string), index.snapshotId);
    },
    async asset(args, signal) {
      const value = input('assetRequest', args, signal), row = item(value.assetId as string);
      if (!row.eligibility.preview.allowed) throw new PublicCatalogueError('NOT_ELIGIBLE');
      let detail;
      try {
        const raw = details.get(row.detail), serialized = JSON.stringify(raw);
        if (!serialized || Buffer.byteLength(serialized, 'utf8') > CATALOGUE_LIMITS.detailBytes) throw new Error('Unavailable');
        detail = validateCatalogueDetail(raw, index, row.id);
      } catch { throw new PublicCatalogueError('CATALOG_UNAVAILABLE'); }
      signal.throwIfAborted();
      const representations = detail.representations.filter(representation => representation.role === value.rendition);
      if (!representations.length) throw new PublicCatalogueError('NOT_ELIGIBLE');
      return publicCatalogueAssetSchema.parse({ contractVersion: 1, status: row.freshness, catalogSnapshot: index.snapshotId,
        item: toPublicCatalogueItem(row, index.snapshotId), representations });
    },
    validateResult(tool: CatalogTool, value) { return validators[tool].parse(value); },
  };
}

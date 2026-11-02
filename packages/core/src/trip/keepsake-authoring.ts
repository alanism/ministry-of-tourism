import { z } from 'zod';
import { selectedAssetClosure } from './asset-closure.ts';
import { CommandError } from '../commands/define.ts';
import type { TripCommandDef, TripCommandContext } from './commands.ts';
import { readAsset, readCard, readPresentations, writeAsset, writeCard, writePresentation } from './model.ts';
import { assetSchema, keepsakeCaptionSchema, keepsakeSelectionSchema, presentationSchema, tripCardSchema, type TripCard } from './schema.ts';

const imageMime = /^image\/(png|jpeg|webp|gif|avif)$/;
function editablePhoto(ctx: TripCommandContext, cardId: string): TripCard {
  const card = readCard(ctx.parts, cardId);
  if (!card) throw new CommandError('not_found', 'That trip item no longer exists.');
  if (card.scope === 'private') throw new CommandError('scope', 'Private items stay out of shared keepsakes.');
  const assetId = card.assetIds.at(-1), asset = assetId ? readAsset(ctx.parts, assetId) : undefined;
  if (!asset || !imageMime.test(asset.mime)) throw new CommandError('invalid_input', 'Choose an item with an available photograph.');
  return card;
}

const captionInput = keepsakeSelectionSchema.extend({ caption: keepsakeCaptionSchema }).strict();
export const tripKeepsakeCaption: TripCommandDef<z.infer<typeof captionInput>, { cardId: string }> = {
  name: 'trip_keepsake_caption', title: 'Write a keepsake caption', description: 'Saves exact authored text for this trip item and output. Empty text remains explicitly empty; source captions are unchanged.',
  access: 'write', humanOnly: true, input: captionInput,
  run: (ctx, input) => {
    const card = editablePhoto(ctx, input.cardId);
    writeCard(ctx.parts, { ...card, keepsakes: { ...card.keepsakes, [input.format]: { caption: input.caption } }, updatedAt: new Date().toISOString() });
    return { cardId: card.id };
  },
};

export const tripKeepsakeSelect: TripCommandDef<z.infer<typeof keepsakeSelectionSchema>, z.infer<typeof keepsakeSelectionSchema>> = {
  name: 'trip_keepsake_select', title: 'Select a keepsake item', description: 'Remembers a non-private trip item and output format without changing its caption or publishing it.',
  access: 'write', humanOnly: true, input: keepsakeSelectionSchema,
  run: (ctx, input) => { editablePhoto(ctx, input.cardId); ctx.parts.meta.set('keepsakeSelection', input); return input; },
};

const replaceInput = z.object({ cardId: z.string().min(1).max(200), expectedAssetId: z.string().min(1).max(200), asset: assetSchema }).strict();
export const tripAssetReplace: TripCommandDef<z.infer<typeof replaceInput>, { id: string; replacedAssetId: string }> = {
  name: 'trip_asset_replace', title: 'Replace the selected item photo', description: 'Replaces this item’s current photo and matching explicitly linked placements atomically. Other uses and original metadata stay unchanged.',
  access: 'write', humanOnly: true, input: replaceInput,
  run: (ctx, input) => {
    const card = readCard(ctx.parts, input.cardId);
    if (!card) throw new CommandError('not_found', 'That trip item no longer exists.');
    if (card.assetIds.at(-1) !== input.expectedAssetId || !readAsset(ctx.parts, input.expectedAssetId)) throw new CommandError('stale', 'The selected photo changed. Choose Replace again.');
    if (!imageMime.test(input.asset.mime)) throw new CommandError('invalid_input', 'Choose a supported photograph.');
    const existing = readAsset(ctx.parts, input.asset.id);
    if (existing && JSON.stringify(existing) !== JSON.stringify(input.asset)) throw new CommandError('invalid_input', 'Original media is immutable; changed bytes need a new identity.');
    if (input.asset.derivedFrom) {
      if (input.asset.derivedFrom === input.asset.id) throw new CommandError('invalid_input', 'Media ancestry cycle; choose a valid original.');
      const ancestors = selectedAssetClosure(ctx.parts, [input.asset.derivedFrom]);
      if (ancestors.some(asset => asset.id === input.asset.id)) throw new CommandError('invalid_input', 'Media ancestry cycle; choose a valid original.');
    }
    const keepsakes = card.keepsakes ? Object.fromEntries(Object.entries(card.keepsakes).map(([format, draft]) => [format, { ...draft, photoChanged: true as const }])) : undefined;
    const next = tripCardSchema.parse({ ...card, assetIds: [...card.assetIds.slice(0, -1).filter(id => id !== input.asset.id), input.asset.id], keepsakes, updatedAt: new Date().toISOString() });
    const linked = readPresentations(ctx.parts).filter(p => p.cardId === card.id && p.assetId === input.expectedAssetId)
      .map(p => presentationSchema.parse({ ...p, assetId: input.asset.id }));
    // All affected records have been validated before the first write; Yjs does not roll back.
    writeAsset(ctx.parts, input.asset);
    writeCard(ctx.parts, next);
    for (const placement of linked) writePresentation(ctx.parts, placement);
    return { id: input.asset.id, replacedAssetId: input.expectedAssetId };
  },
};

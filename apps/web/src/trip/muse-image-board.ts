// Adds an approved Muse Image result to the trip through the same staged-bytes pattern as
// FCC artwork: validate and prepare, then register and place (or attach) in one command run.
import { readAllCards, readCard, readPresentations, type Actor, type Asset, type MuseImagePreset, type TripSession } from '@mot/core';
import { prepareBoardImages } from './board-images';
import { BOARD_SIZE, STACK_LIMIT, imagePlacementRect } from './free-board-actions';
import { commitTripBlobs } from './trip-assets';
import type { MuseImageResult } from './muse-image';

export const MUSE_IMAGE_CREDIT = 'AI-generated illustration · Muse Image (muse-image-1.0)';

export interface GeneratedTarget { boardId: string; revisionSeen?: number }
export type GeneratedDestination = { kind: 'board'; origin?: { x: number; y: number } } | { kind: 'card'; cardId: string };

function generatedAsset(id: string, hash: string, image: { blob: Blob; width: number; height: number }, result: MuseImageResult, preset: MuseImagePreset, caption: string): Asset {
  return {
    id, hash, mime: image.blob.type, role: 'original', width: image.width, height: image.height,
    caption: caption.slice(0, 1000), credit: MUSE_IMAGE_CREDIT,
    generated: { provider: 'meta', model: result.model, presetId: preset.id, presetVersion: preset.version, createdAt: result.createdAt },
  };
}

/** Never lands a stale result: the open board must still be the one the image was made for. */
export async function addGeneratedImage(session: TripSession, actor: Actor, result: MuseImageResult, preset: MuseImagePreset, caption: string, target: GeneratedTarget, destination: GeneratedDestination, signal: AbortSignal): Promise<{ persisted: boolean }> {
  if (actor.kind !== 'human') throw new Error('Only a person can add a generated image.');
  const check = () => {
    signal.throwIfAborted();
    if (session.boardId !== target.boardId) throw new Error('A different trip is open now. Download the image, or generate again on this trip. Nothing was added.');
    if (destination.kind === 'card' && !readCard(session.parts, destination.cardId)) throw new Error('That card is no longer on the board. Nothing was added.');
  };
  check();
  const file = new File([result.blob], caption || 'Muse Image', { type: result.blob.type });
  const [image] = await prepareBoardImages([file], signal);
  if (!image) throw new Error('The generated image could not be prepared. Nothing was added.');
  check();
  let applied = false;
  return commitTripBlobs([image.blob], ([hash]) => {
    check();
    if (applied) return;
    const assetId = crypto.randomUUID(), asset = generatedAsset(assetId, hash!, image, result, preset, caption);
    if (destination.kind === 'card') {
      session.execute(actor, 'trip_asset_attach', { cardId: destination.cardId, asset });
    } else {
      const rect = imagePlacementRect(image.width, image.height, destination.origin ?? { x: 120, y: 120 });
      const stacks = [...readAllCards(session.parts).map(card => card.boardStack ?? 0), ...readPresentations(session.parts).filter(p => p.surface === 'board').map(p => p.zIndex)];
      const stack = stacks.length ? Math.max(...stacks) + 1 : 1;
      if (stack > STACK_LIMIT) throw new RangeError('That item cannot be layered any further. Nothing changed.');
      session.executeAll(actor, [
        { command: 'trip_asset_register', input: { asset } },
        { command: 'trip_presentation_create', input: { assetId, surface: 'board', x: rect.x / BOARD_SIZE, y: rect.y / BOARD_SIZE, width: rect.width / BOARD_SIZE, height: rect.height / BOARD_SIZE, crop: [0, 0, 1, 1], rotation: 0, zIndex: stack, locked: false, scope: 'private' } },
      ]);
    }
    applied = true;
  }, signal);
}

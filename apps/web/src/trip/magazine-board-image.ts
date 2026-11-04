import { readAllCards, readAsset, readPresentation, type Actor, type TripSession } from '@mot/core';
import { commitTripBlobs, getTripBlob } from './trip-assets';

/** Reuse local board media as a private magazine photo. No image service or new attribution. */
export async function useBoardImageInMagazine(session: TripSession, actor: Actor, presentationId: string, signal: AbortSignal): Promise<{ persisted: boolean }> {
  if (actor.kind !== 'human') throw Error('Only a person can choose an image for the magazine.');
  const boardId = session.boardId, presentation = readPresentation(session.parts, presentationId);
  const asset = presentation?.assetId ? readAsset(session.parts, presentation.assetId) : undefined;
  if (!presentation || presentation.surface !== 'board' || !asset || !/^image\/(png|jpeg|webp|gif|avif)$/.test(asset.mime)) throw Error('That board image is no longer available. Nothing was added.');
  const check = () => {
    signal.throwIfAborted();
    if (session.boardId !== boardId || JSON.stringify(readPresentation(session.parts, presentationId)) !== JSON.stringify(presentation) || JSON.stringify(readAsset(session.parts, asset.id)) !== JSON.stringify(asset)) throw Error('That image changed. Open it again before using it in the magazine.');
    if (readAllCards(session.parts).some(card => card.kind === 'photo' && card.stage === 'remember' && card.scope === 'private' && card.assetIds.includes(asset.id))) throw Error('This image is already a private magazine photo. Open Keepsakes → Magazine and include private artwork.');
  };
  check();
  const blob = await getTripBlob(asset.hash); check();
  if (!blob || blob.type !== asset.mime) throw Error('This browser does not have the original image bytes. Restore the image before adding it.');
  return commitTripBlobs([blob], ([hash]) => {
    check();
    if (hash !== asset.hash) throw Error('The local image bytes do not match. Nothing was added.');
    session.execute(actor, 'trip_card_create', { kind: 'photo', title: (asset.caption || 'My magazine photo').slice(0, 500), body: 'Image selected from my board for the magazine. The original board image is unchanged.', stage: 'remember', scope: 'private', provenance: 'traveler', assetIds: [asset.id] });
  }, signal);
}

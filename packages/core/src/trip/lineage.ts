// Guest copies and master updates (MOT-14). Never touches guest-private cards.
import * as Y from 'yjs';
import type { Actor } from '../doc/model.ts';
import { assertShareableAsset, createTrip, presentationScope, readAllCards, readAsset, readPresentations, readTripMeta, tripParts, writeAsset, writeCard, writePresentation } from './model.ts';
import { cardRev } from './revisions.ts';
import { syncedSnapshot, type TripCard } from './schema.ts';
import type { TripSession } from './session.ts';

/** cardIds: the guide cards the host chose. Omitted means every guide card. */
export interface GuestCopyOptions { title?: string; newId?: () => string; copiedAt?: string; cardIds?: Set<string>; }

/** New boardId, kind guest, only scope:'guide' cards (and their photo metadata), each with lineage base. */
export function createGuestCopy(guideDoc: Y.Doc, options: GuestCopyOptions = {}): Y.Doc {
  const guideMeta = readTripMeta(guideDoc);
  const guideParts = tripParts(guideDoc);
  const guest = createTrip({
    title: options.title ?? guideMeta.title, city: guideMeta.city, cityId:guideMeta.cityId, countryCode:guideMeta.countryCode,timeZone: guideMeta.timeZone,
    kind: 'guest', dates: guideMeta.dates, party: guideMeta.party, agentMode: guideMeta.agentMode,
    lineage: { guideBoardId: guideMeta.boardId, copiedAt: options.copiedAt ?? new Date().toISOString() },
    newId: options.newId,
  });
  const guestParts = tripParts(guest);
  const cards=readAllCards(guideParts).filter(c=>c.scope==='guide' && (!options.cardIds || options.cardIds.has(c.id)));
  const cardIds=new Set(cards.map(c=>c.id));
  const presentations=readPresentations(guideParts).filter(p=>presentationScope(guideParts,p)==='guide' && (!p.cardId || cardIds.has(p.cardId)));
  const assets=new Set([...cards.flatMap(c=>c.assetIds),...presentations.flatMap(p=>p.assetId?[p.assetId]:[])]);
  for(const id of assets){const a=readAsset(guideParts,id);if(a)assertShareableAsset(a);}
  guest.transact(() => {
    for (const card of cards) {
      writeCard(guestParts, { ...card, scope: 'guide', lineage: { guideCardId: card.id, guideRev: cardRev(guideParts, card.id), base: syncedSnapshot(card) } });
    }
    for (const assetId of assets) { const a = readAsset(guideParts, assetId); if (a) writeAsset(guestParts, a); }
    for (const p of presentations) writePresentation(guestParts,{...p,boardId:readTripMeta(guest).boardId});
  });
  return guest;
}

export type UpdateKind = 'update' | 'conflict' | 'new' | 'removed';
export interface PlannedUpdate { kind: UpdateKind; guideCardId: string; guestCardId?: string; guideCard?: TripCard; }

export function planGuideUpdate(guestDoc: Y.Doc, guideDoc: Y.Doc): PlannedUpdate[] {
  const guestCards = readAllCards(tripParts(guestDoc));
  const guideCards = readAllCards(tripParts(guideDoc)).filter((c) => c.scope === 'guide');
  const byGuide = new Map(guestCards.filter((c) => c.lineage).map((c) => [c.lineage!.guideCardId, c]));
  const plan: PlannedUpdate[] = [];
  for (const g of guideCards) {
    const guest = byGuide.get(g.id);
    if (!guest) { plan.push({ kind: 'new', guideCardId: g.id, guideCard: g }); continue; }
    if (syncedSnapshot(g) === guest.lineage!.base) continue;
    const guestUntouched = syncedSnapshot(guest) === guest.lineage!.base;
    plan.push({ kind: guestUntouched ? 'update' : 'conflict', guideCardId: g.id, guestCardId: guest.id, guideCard: g });
  }
  for (const guest of guestCards) {
    if (guest.lineage && !guideCards.some((g) => g.id === guest.lineage!.guideCardId)) {
      plan.push({ kind: 'removed', guideCardId: guest.lineage.guideCardId, guestCardId: guest.id });
    }
  }
  return plan;
}

/** Apply only selected updates, through humanOnly commands. Idempotent. Returns applied count. */
export function applyGuideUpdates(session: TripSession, actor: Actor, guestDoc: Y.Doc, guideDoc: Y.Doc, selectedGuideIds: Set<string>): number {
  if (actor.kind !== 'human') throw new Error('Only a person can apply guide updates');
  const plan = planGuideUpdate(guestDoc, guideDoc).filter((p) => selectedGuideIds.has(p.guideCardId));
  const guideParts = tripParts(guideDoc);
  let applied = 0;
  for (const p of plan) {
    if (p.kind === 'removed') continue; // Offer only; never delete silently.
    if (p.kind === 'new') {
      const g = p.guideCard!;
      const { id } = session.execute<{ id: string }>(actor, 'trip_card_create', {
        kind: g.kind, title: g.title, body: g.body, stage: g.stage, day: g.day, time: g.time,
        placeId: g.placeId, location: g.location, scope: 'guide', provenance: g.provenance, source: g.source, assetIds: g.assetIds, x: g.x, y: g.y,
      });
      // Stamp lineage on the new card via sync command.
      const created = readAllCards(tripParts(guestDoc)).find((c) => c.id === id)!;
      session.execute(actor, 'trip_lineage_sync', { id, card: { ...created, lineage: { guideCardId: g.id, guideRev: cardRev(guideParts, g.id), base: syncedSnapshot(g) } } });
      applied++;
    } else if (p.guestCardId && p.guideCard) {
      const g = p.guideCard;
      session.execute(actor, 'trip_lineage_sync', { id: p.guestCardId, card: { ...g, id: p.guestCardId, lineage: { guideCardId: g.id, guideRev: cardRev(guideParts, g.id), base: syncedSnapshot(g) } } });
      applied++;
    }
  }
  return applied;
}

/**
 * "Keep mine" (#11): the guest keeps their edited card and acknowledges the host's current version,
 * so the conflict stops reappearing until the host changes that card again. Returns kept count.
 */
export function keepGuestVersions(session: TripSession, actor: Actor, guestDoc: Y.Doc, guideDoc: Y.Doc, selectedGuideIds: Set<string>): number {
  if (actor.kind !== 'human') throw new Error('Only a person can keep their version');
  const plan = planGuideUpdate(guestDoc, guideDoc).filter((p) => p.kind === 'conflict' && selectedGuideIds.has(p.guideCardId));
  const guideParts = tripParts(guideDoc);
  const guestParts = tripParts(guestDoc);
  let kept = 0;
  for (const p of plan) {
    const mine = readAllCards(guestParts).find((c) => c.id === p.guestCardId);
    if (!mine || !p.guideCard) continue;
    session.execute(actor, 'trip_lineage_sync', { id: mine.id, card: { ...mine, lineage: { guideCardId: p.guideCardId, guideRev: cardRev(guideParts, p.guideCardId), base: syncedSnapshot(p.guideCard) } } });
    kept++;
  }
  return kept;
}

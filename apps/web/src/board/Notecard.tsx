// A paper notecard. The front holds the card's question and the writer's
// words; flip it to read the card's lesson and coach tips on the back.
// Cards lift while dragged and settle with a slight tilt when dropped.
//
// Built to stay fast with a thousand cards: shapes and materials are shared,
// small cards on screen draw less detail, the back is only built while it can
// be seen, animation stops once a card is at rest, and a card only re-renders
// when something about it changes.
import { Text } from '@react-three/drei';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { cardDimensions, getCategory, getFrameworkCard, getCoach, type CardView, type CategoryId, type Palette } from '@writers-board/core';
import { latestBoard, run } from '../state/board';
import { useUi } from '../state/ui';
import { FONTS, shade } from './assets';
import { snapToGuides } from './bounds';
import { itemZ } from './depth';
import { Fade } from './Fade';
import { settleTilt, useBoardDrag } from './drag';
import { flat, plane, ring, roundedRect, ruledLines, shadowMaterial } from './shared';
import { columnColor, usePalette } from '../state/palette';
import { soundsOn } from '../ui/Switch';
import { boardSounds } from '../writing/sounds';
import { useWritingType } from '../writing/fonts';

const PAD = 12;
const BAND = 8;
const BODY_SIZE = 13;
const LINE = BODY_SIZE * 1.35;
/** Below this zoom the question, rules and back details are too small to read. */
export const FULL_DETAIL_ZOOM = 0.55;
const DEAL_MS = 520;
const REDUCED_MOTION = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

function stampColor(value: number, palette: Palette): string {
  return value <= 2 ? palette.accent : value === 3 ? palette.muted : palette.ink;
}

interface Props {
  card: CardView;
  layer: number;
}

function NotecardBody({ card, layer }: Props) {
  const { width: w, height: h } = cardDimensions(card.size, card.orientation);
  const selected = useUi((s) => s.selectedId === card.id || s.yarnFrom === card.id);
  const editing = useUi((s) => s.editingId === card.id);
  const flipped = useUi((s) => Boolean(s.flipped[card.id]));
  const faded = useUi((s) => s.lens !== null && s.lens !== card.category);
  const full = useUi((s) => s.view.zoom >= FULL_DETAIL_ZOOM);
  const palette = usePalette();
  const type = useWritingType();
  const dealtAt = useUi((s) => s.dealing[card.id]);

  function startWriting() {
    if (useUi.getState().tool !== 'select') return;
    if (useUi.getState().flipped[card.id]) useUi.getState().toggleFlip(card.id);
    useUi.getState().edit(card.id);
  }
  const { drag, onPointerDown } = useBoardDrag(
    card.id,
    ({ dx, dy }, event) => {
      const board = latestBoard();
      const moved = { x: Math.round(card.x + dx), y: Math.round(card.y + dy), width: w, height: h };
      const snapped = board && !event.altKey ? snapToGuides(board, moved) : null;
      run('card_move', { id: card.id, ...(snapped ?? { x: moved.x, y: moved.y }), rotation: settleTilt() });
    },
    { onDoubleTap: startWriting },
  );
  const [questionHeight, setQuestionHeight] = useState(24);
  const lift = useRef<THREE.Group>(null);
  const travel = useRef<THREE.Group>(null);
  // Draw 3: the card leaves a deck just below the screen, face down, and
  // flies to its place, turning face up and settling at its tilt as it lands.
  const deal = useRef<{ from: [number, number]; at: number; landed: boolean } | null>(null);
  // Brought back from the bin (undo): it starts small and crumpled-looking, then flattens out.
  useLayoutEffect(() => {
    const ui = useUi.getState();
    if (!ui.thrown.has(card.id)) return;
    ui.thrown.delete(card.id);
    if (REDUCED_MOTION || !lift.current) return;
    lift.current.scale.setScalar(0.25);
    lift.current.rotation.z = (Math.random() - 0.5) * 1.2;
    settled.current = false;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useLayoutEffect(() => {
    if (dealtAt === undefined || REDUCED_MOTION) return;
    const { view } = useUi.getState();
    const deck = { x: view.x, y: view.y + view.height / 2 / view.zoom + h };
    deal.current = { from: [deck.x - (card.x + w / 2), -(deck.y - (card.y + h / 2))], at: dealtAt, landed: false };
    if (lift.current) lift.current.rotation.y = Math.PI;
    if (travel.current) travel.current.position.set(deal.current.from[0], deal.current.from[1], 0);
    setShowBack(true);
    settled.current = false;
  }, [dealtAt]); // eslint-disable-line react-hooks/exhaustive-deps
  const shadowRef = useRef<THREE.Mesh>(null);
  const settled = useRef(false);
  settled.current = false; // something may have changed: let the animation check again
  const [showBack, setShowBack] = useState(flipped);
  useEffect(() => {
    if (flipped) setShowBack(true);
  }, [flipped]);

  const framework = getFrameworkCard(card.type)!;
  const category = getCategory(card.category as CategoryId);
  const band = shade(columnColor(palette, card.category), 0.12);

  const x = card.x + (drag?.dx ?? 0);
  const y = card.y + (drag?.dy ?? 0);
  const lifted = drag !== null;
  // Writing on a card picks it up and straightens it, so the editor sits square on it.
  const tilt = lifted || editing ? 0 : card.rotation;

  const top = h / 2;
  const left = -w / 2;
  const bodyTop = full ? top - BAND - 22 - questionHeight - 10 : top - BAND - 28;
  const rows = useMemo(() => {
    const lines: number[] = [];
    for (let ry = bodyTop - LINE; ry > -h / 2 + 6; ry -= LINE) lines.push(Math.round((ry - 1) * 10) / 10);
    return lines;
  }, [bodyTop, h]);

  useFrame((_, delta) => {
    const group = lift.current;
    if (!group || settled.current) return;
    const k = 1 - Math.exp(-delta * 14);
    const dealing = deal.current;
    let flying = false;
    if (dealing && travel.current) {
      const t = Math.min(1, Math.max(0, (performance.now() - dealing.at) / DEAL_MS));
      const eased = 1 - (1 - t) ** 3;
      travel.current.position.set(dealing.from[0] * (1 - eased), dealing.from[1] * (1 - eased), 0);
      flying = t < 1;
      if (!flying) {
        deal.current = null;
        if (soundsOn()) boardSounds.cardDown();
      }
    }
    // Face down until it has flown most of the way, then it turns over.
    const faceDown = flying && dealing !== null && performance.now() - dealing.at < DEAL_MS * 0.55;
    const target = {
      z: lifted || flying ? 40 : editing ? 14 : 0,
      scale: lifted ? 1.035 : 1,
      flip: flipped || faceDown ? Math.PI : 0,
      tilt: (-tilt * Math.PI) / 180,
    };
    group.position.z += (target.z - group.position.z) * k;
    group.scale.setScalar(group.scale.x + (target.scale - group.scale.x) * k);
    group.rotation.y += (target.flip - group.rotation.y) * k;
    group.rotation.z += (target.tilt - group.rotation.z) * k;
    const shadow = shadowRef.current;
    const offset = lifted ? 16 : 4;
    if (shadow) {
      shadow.position.x += (offset * 0.6 - shadow.position.x) * k;
      shadow.position.y += (-offset - shadow.position.y) * k;
    }
    const close =
      !flying &&
      Math.abs(target.z - group.position.z) < 0.05 &&
      Math.abs(target.scale - group.scale.x) < 0.0005 &&
      Math.abs(target.flip - group.rotation.y) < 0.001 &&
      Math.abs(target.tilt - group.rotation.z) < 0.0005;
    if (close) {
      group.position.z = target.z;
      group.scale.setScalar(target.scale);
      group.rotation.y = target.flip;
      group.rotation.z = target.tilt;
      if (shadow) shadow.position.set(offset * 0.6, -offset, -2);
      settled.current = true;
      // The back is only kept while it can be seen.
      if (!flipped && showBack) setShowBack(false);
    }
  });

  const onDoubleClick = (event: ThreeEvent<MouseEvent>) => {
    if (useUi.getState().tool !== 'select') return;
    event.stopPropagation();
    startWriting();
  };

  const z = itemZ(layer, { lifted, selected });
  const back = showBack
    ? [
        framework.lesson,
        framework.tips.map((t) => `${getCoach(t.coach)?.role ?? 'Coach'}: ${t.tip}`).join('\n'),
        card.score ? `Score ${card.score.value}/5: ${card.score.note}` : '',
        card.annotation ? `Note: ${card.annotation}` : '',
      ]
        .filter(Boolean)
        .join('\n\n')
    : '';

  return (
    <group position={[x + w / 2, -(y + h / 2), z]}>
      <group ref={travel}>
      <mesh ref={shadowRef} position={[2.4, -4, -2]} rotation={[0, 0, (-tilt * Math.PI) / 180]} geometry={plane(w + 46, h + 46)} material={shadowMaterial(lifted)} />
      <group ref={lift}>
        {/* Selection rim, just behind the paper so only its edge shows from either side. */}
        {selected && <mesh position={[0, 0, -0.4]} geometry={roundedRect(w + 7, h + 7, 5)} material={flat(palette.accent, { side: THREE.DoubleSide })} />}
        <mesh
          geometry={roundedRect(w, h, 3)}
          material={flat(palette.paper, { side: THREE.DoubleSide })}
          onPointerDown={onPointerDown}
          onDoubleClick={onDoubleClick}
          onPointerOver={() => (document.body.style.cursor ||= 'grab')}
          onPointerOut={() => document.body.style.cursor === 'grab' && (document.body.style.cursor = '')}
        />

        {/* Front */}
        <group position={[0, 0, 1.05]}>
          <mesh position={[0, top - BAND / 2, 0]} geometry={plane(w - 1, BAND)} material={flat(band)} />
          <Text font={FONTS.uiBold} fontSize={14} color={palette.ink} anchorX="left" anchorY="top" position={[left + PAD, top - BAND - 6, 0.1]}>
            {framework.name}
          </Text>
          {full && (
            <>
              <Text
                font={FONTS.ui}
                fontSize={11}
                lineHeight={1.3}
                color={palette.muted}
                maxWidth={w - PAD * 2}
                anchorX="left"
                anchorY="top"
                position={[left + PAD, top - BAND - 26, 0.1]}
                onSync={(text: THREE.Object3D & { textRenderInfo?: { blockBounds: number[] } }) => {
                  const bounds = text.textRenderInfo?.blockBounds;
                  if (bounds) setQuestionHeight(Math.round(bounds[3]! - bounds[1]!));
                }}
              >
                {framework.question}
              </Text>
              <mesh position={[0, bodyTop + 2, 0.05]} geometry={plane(w - 2, 0.9)} material={flat(palette.margin)} />
              <mesh position={[0, 0, 0.04]} geometry={ruledLines(w - 2, rows)} material={flat(palette.rule)} />
            </>
          )}
          {!editing && (full || card.text) && (
            <Text
              font={type.handFile}
              fontSize={BODY_SIZE * type.handScale}
              lineHeight={1.35}
              color={card.text ? palette.ink : palette.faint}
              maxWidth={w - PAD * 2}
              anchorX="left"
              anchorY="top"
              position={[left + PAD, bodyTop - 2, 0.1]}
              clipRect={[0, -(bodyTop + h / 2 - 6), w, 4]}
            >
              {card.text || 'Double-click to write'}
            </Text>
          )}
          {card.score && (
            // A coach's 1–5 score, stamped like ink in the top corner.
            <group position={[w / 2 - 20, top - BAND - 18, 0.15]} rotation={[0, 0, -0.18]}>
              <mesh geometry={ring(11, 13.5)} material={flat(stampColor(card.score.value, palette), { opacity: 0.85 })} />
              <Text font={FONTS.marker} fontSize={16} color={stampColor(card.score.value, palette)} anchorX="center" anchorY="middle">
                {String(card.score.value)}
              </Text>
            </group>
          )}
          {full && card.links.length > 0 && (
            <Text font={FONTS.ui} fontSize={8.5} color={palette.muted} anchorX="right" anchorY="bottom" position={[w / 2 - PAD, -h / 2 + 6, 0.12]}>
              {card.links.length === 1 ? '1 pinned passage' : `${card.links.length} pinned passages`}
            </Text>
          )}
        </group>

        {faded && <Fade width={w} height={h} z={1.4} />}

        {/* Back */}
        {showBack && (
          <group position={[0, 0, -1.05]} rotation={[0, Math.PI, 0]}>
            <mesh position={[0, top - BAND / 2, 0]} geometry={plane(w - 1, BAND)} material={flat(band)} />
            <Text font={FONTS.uiBold} fontSize={12} color={palette.ink} anchorX="left" anchorY="top" position={[left + PAD, top - BAND - 6, 0.1]}>
              {`${framework.name} · ${category.label}`}
            </Text>
            <Text
              font={FONTS.ui}
              fontSize={8.5}
              lineHeight={1.35}
              color={palette.muted}
              maxWidth={w - PAD * 2}
              anchorX="left"
              anchorY="top"
              position={[left + PAD, top - BAND - 24, 0.1]}
              clipRect={[0, -(h - BAND - 30), w, 4]}
            >
              {back}
            </Text>
          </group>
        )}
      </group>
      </group>
    </group>
  );
}

/** Only what's drawn counts: a new snapshot of the same card doesn't re-render it. */
function sameCard(a: CardView, b: CardView): boolean {
  if (a === b) return true;
  return (
    a.id === b.id &&
    a.type === b.type &&
    a.x === b.x &&
    a.y === b.y &&
    a.rotation === b.rotation &&
    a.orientation === b.orientation &&
    a.size === b.size &&
    a.text === b.text &&
    a.annotation === b.annotation &&
    a.category === b.category &&
    a.score?.value === b.score?.value &&
    a.score?.note === b.score?.note &&
    a.links.length === b.links.length
  );
}

export const Notecard = memo(NotecardBody, (a, b) => a.layer === b.layer && sameCard(a.card, b.card));

// A pasted or dropped picture: a polaroid (or plain print) taped to the board.
import { Text } from '@react-three/drei';
import { memo, useEffect, useState } from 'react';
import * as THREE from 'three';
import type { ImageView } from '@writers-board/core';
import { blobUrl } from '../state/blobs';
import { latestBoard, run } from '../state/board';
import { useUi } from '../state/ui';
import { samePlain } from './same';
import { FONTS, shadowTexture } from './assets';
import { POLAROID, itemBounds, snapToGuides } from './bounds';
import { itemZ } from './depth';
import { settleTilt, useBoardDrag } from './drag';
import { Fade } from './Fade';
import { usePalette } from '../state/palette';
import { useWritingType } from '../writing/fonts';

const textures = new Map<string, Promise<THREE.Texture | null>>();

function loadTexture(hash: string): Promise<THREE.Texture | null> {
  let texture = textures.get(hash);
  if (!texture) {
    texture = blobUrl(hash).then((url) =>
      url
        ? new THREE.TextureLoader().loadAsync(url).then((t) => {
            t.colorSpace = THREE.SRGBColorSpace;
            t.anisotropy = 4;
            return t;
          })
        : null,
    );
    textures.set(hash, texture);
  }
  return texture;
}

function useTexture(hash: string) {
  const [texture, setTexture] = useState<THREE.Texture | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    loadTexture(hash).then((t) => live && setTexture(t));
    return () => {
      live = false;
    };
  }, [hash]);
  return texture;
}

function ImageItemBody({ image, layer }: { image: ImageView; layer: number }) {
  const palette = usePalette();
  const type = useWritingType();
  const selected = useUi((s) => s.selectedId === image.id || s.yarnFrom === image.id);
  const texture = useTexture(image.blobId);
  const faded = useUi((s) => s.lens !== null);
  const { drag, onPointerDown } = useBoardDrag(image.id, ({ dx, dy }, event) => {
    const board = latestBoard();
    const bounds = board && itemBounds(board, image.id);
    if (!bounds) return;
    const moved = { ...bounds, x: Math.round(image.x + dx), y: Math.round(image.y + dy) };
    const snapped = board && !event.altKey ? snapToGuides(board, moved) : null;
    run('image_update', { id: image.id, ...(snapped ?? { x: moved.x, y: moved.y }), rotation: settleTilt() });
  });

  const polaroid = image.frame === 'polaroid';
  const sticker = image.frame === 'sticker';
  const w = image.width + (polaroid ? POLAROID.side * 2 : 0);
  const h = image.height + (polaroid ? POLAROID.side + POLAROID.bottom : 0);
  const x = image.x + (drag?.dx ?? 0);
  const y = image.y + (drag?.dy ?? 0);
  const lifted = drag !== null;
  const tilt = ((lifted ? 0 : image.rotation) * -Math.PI) / 180;
  // Photo center sits above the frame's center when the bottom margin is deeper.
  const photoY = polaroid ? (POLAROID.bottom - POLAROID.side) / 2 : 0;

  return (
    <group position={[x + w / 2, -(y + h / 2), itemZ(layer, { lifted, selected })]} rotation={[0, 0, tilt]} scale={lifted ? 1.03 : 1}>
      {!sticker && <mesh position={[3, lifted ? -14 : -5, -2]}>
        <planeGeometry args={[w + 40, h + 40]} />
        <meshBasicMaterial map={shadowTexture()} transparent opacity={lifted ? 0.24 : 0.16} depthWrite={false} />
      </mesh>}
      {selected && sticker && <group position={[0, 0, -0.5]}>
        {[[w + 7, 1, 0, (h + 7) / 2], [w + 7, 1, 0, -(h + 7) / 2], [1, h + 7, (w + 7) / 2, 0], [1, h + 7, -(w + 7) / 2, 0]].map(([width, height, left, top], index) => <mesh key={index} position={[left!, top!, 0]}>
          <planeGeometry args={[width!, height!]} /><meshBasicMaterial color={palette.accent} />
        </mesh>)}
      </group>}
      {selected && !sticker && (
        <mesh position={[0, 0, -0.5]}>
          <planeGeometry args={[w + 7, h + 7]} />
          <meshBasicMaterial color={palette.accent} />
        </mesh>
      )}
      <mesh onPointerDown={onPointerDown}>
        <planeGeometry args={[w, h]} />
        <meshBasicMaterial color={polaroid ? palette.paper : palette.wash} transparent={sticker} opacity={sticker ? 0 : 1} depthWrite={!sticker} />
      </mesh>
      <mesh position={[0, photoY, 0.1]}>
        <planeGeometry args={[image.width, image.height]} />
        {/* Keyed so the picture gets a fresh material instead of patching the placeholder's. */}
        {texture ? (
          <meshBasicMaterial key="photo" map={texture} color="#FFFFFF" toneMapped={false} transparent={sticker} depthWrite={!sticker} />
        ) : (
          <meshBasicMaterial key="placeholder" color={palette.wash} />
        )}
      </mesh>
      {texture === null && (
        <Text font={FONTS.ui} fontSize={12} color={palette.muted} position={[0, photoY, 0.2]} maxWidth={image.width - 20} textAlign="center">
          This picture isn't stored in this browser
        </Text>
      )}
      {faded && <Fade width={w} height={h} z={0.5} />}
      {/* A strip of tape across the top edge. */}
      {!sticker && <mesh position={[0, h / 2 - 2, 0.3]} rotation={[0, 0, 0.05]}>
        <planeGeometry args={[Math.min(90, w * 0.4), 24]} />
        <meshBasicMaterial color={palette.tape} transparent opacity={0.6} />
      </mesh>}
      {polaroid && image.caption && (
        <Text font={type.handFile} fontSize={15 * type.handScale} color={palette.ink} anchorX="center" anchorY="middle" position={[0, -h / 2 + POLAROID.bottom / 2, 0.2]} maxWidth={w - 16}>
          {image.caption}
        </Text>
      )}
    </group>
  );
}

export const ImageItem = memo(ImageItemBody, (a, b) => a.layer === b.layer && samePlain(a.image, b.image));

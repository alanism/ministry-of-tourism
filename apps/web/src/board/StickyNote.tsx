// A square sticky note with free handwriting. Not a framework card.
import { noteColor } from '@writers-board/core';
import { Text } from '@react-three/drei';
import type { ThreeEvent } from '@react-three/fiber';
import type { NoteView } from '@writers-board/core';
import { latestBoard, run } from '../state/board';
import { memo } from 'react';
import { useUi } from '../state/ui';
import { samePlain } from './same';
import { FONTS, shade, shadowTexture } from './assets';
import { NOTE_SIZE, snapToGuides } from './bounds';
import { itemZ } from './depth';
import { settleTilt, useBoardDrag } from './drag';
import { Fade } from './Fade';
import { usePalette } from '../state/palette';
import { useWritingType } from '../writing/fonts';

function StickyNoteBody({ note, layer }: { note: NoteView; layer: number }) {
  const palette = usePalette();
  const type = useWritingType();
  const selected = useUi((s) => s.selectedId === note.id || s.yarnFrom === note.id);
  const editing = useUi((s) => s.editingId === note.id);
  const faded = useUi((s) => s.lens !== null);
  const { drag, onPointerDown } = useBoardDrag(note.id, ({ dx, dy }, event) => {
    const board = latestBoard();
    const moved = { x: Math.round(note.x + dx), y: Math.round(note.y + dy), width: NOTE_SIZE, height: NOTE_SIZE };
    const snapped = board && !event.altKey ? snapToGuides(board, moved) : null;
    run('note_update', { id: note.id, ...(snapped ?? { x: moved.x, y: moved.y }), rotation: settleTilt() });
  }, { onDoubleTap: () => useUi.getState().tool === 'select' && useUi.getState().edit(note.id) });
  const s = NOTE_SIZE;
  const paper = noteColor(note.color, palette);
  const x = note.x + (drag?.dx ?? 0);
  const y = note.y + (drag?.dy ?? 0);
  const lifted = drag !== null;
  // Writing on a note straightens it, so the editor sits square on it.
  const tilt = ((lifted || editing ? 0 : note.rotation) * -Math.PI) / 180;

  const onDoubleClick = (event: ThreeEvent<MouseEvent>) => {
    if (useUi.getState().tool !== 'select') return;
    event.stopPropagation();
    useUi.getState().edit(note.id);
  };

  return (
    <group position={[x + s / 2, -(y + s / 2), itemZ(layer, { lifted, selected })]} rotation={[0, 0, tilt]} scale={lifted ? 1.04 : 1}>
      <mesh position={[3, lifted ? -14 : -5, -2]}>
        <planeGeometry args={[s + 40, s + 40]} />
        <meshBasicMaterial map={shadowTexture()} transparent opacity={lifted ? 0.22 : 0.14} depthWrite={false} />
      </mesh>
      {selected && (
        <mesh position={[0, 0, -0.5]}>
          <planeGeometry args={[s + 7, s + 7]} />
          <meshBasicMaterial color={palette.accent} />
        </mesh>
      )}
      <mesh onPointerDown={onPointerDown} onDoubleClick={onDoubleClick}>
        <planeGeometry args={[s, s]} />
        <meshBasicMaterial color={paper} />
      </mesh>
      {/* The sticky strip along the top is a shade darker. */}
      <mesh position={[0, s / 2 - 9, 0.1]}>
        <planeGeometry args={[s, 18]} />
        <meshBasicMaterial color={shade(paper, 0.04)} />
      </mesh>
      {faded && <Fade width={s} height={s} z={0.5} />}
      {!editing && (
        <Text
          font={type.handFile}
          fontSize={16 * type.handScale}
          lineHeight={1.25}
          color={note.text ? palette.ink : palette.muted}
          maxWidth={s - 20}
          anchorX="left"
          anchorY="top"
          position={[-s / 2 + 10, s / 2 - 22, 0.2]}
          clipRect={[0, -(s - 30), s, 4]}
        >
          {note.text || 'Double-click to write'}
        </Text>
      )}
    </group>
  );
}

export const StickyNote = memo(StickyNoteBody, (a, b) => a.layer === b.layer && samePlain(a.note, b.note));

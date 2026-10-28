// The four framework lanes, drawn like marker headings on the whiteboard.
// A guide only: cards can go anywhere, and the toolbar hides the lanes.
import { Text } from '@react-three/drei';
import { CATEGORIES, LANES, laneX, type CardView } from '@writers-board/core';
import { FONTS, shade } from './assets';
import { columnColor, usePalette } from '../state/palette';

export function Lanes({ cards }: { cards: CardView[] }) {
  const palette = usePalette();
  const bottom = Math.max(LANES.startY + 600, ...cards.map((c) => c.y + 400));
  const top = LANES.startY - 88;
  const height = bottom - top;
  return (
    <group>
      {CATEGORIES.map((category) => {
        const x = laneX(category.id) - 12;
        const width = LANES.width - 24;
        return (
          <group key={category.id}>
            <mesh position={[x + width / 2, -(top + height / 2), -5]}>
              <planeGeometry args={[width, height]} />
              <meshBasicMaterial color={columnColor(palette, category.id)} transparent opacity={0.07} />
            </mesh>
            <Text
              font={FONTS.label}
              fontSize={15}
              letterSpacing={0.14}
              color={shade(columnColor(palette, category.id), 0.45)}
              anchorX="left"
              anchorY="top"
              position={[x + 12, -(top + 14), -4]}
            >
              {category.label.toUpperCase()}
            </Text>
          </group>
        );
      })}
    </group>
  );
}

// Razor lens: a sheet of board color laid over anything outside the chosen column.
import { usePalette } from '../state/palette';

export function Fade({ width, height, z }: { width: number; height: number; z: number }) {
  const palette = usePalette();
  return (
    <mesh position={[0, 0, z]} renderOrder={10}>
      <planeGeometry args={[width + 8, height + 8]} />
      <meshBasicMaterial color={palette.board} transparent opacity={0.78} depthWrite={false} />
    </mesh>
  );
}

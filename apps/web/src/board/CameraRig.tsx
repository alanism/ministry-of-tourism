// Keeps the orthographic camera in step with the view state, and turns the
// mouse wheel into panning and trackpad pinch into zoom toward the cursor.
import { useThree } from '@react-three/fiber';
import { useEffect } from 'react';
import type { OrthographicCamera } from 'three';
import { MAX_ZOOM, MIN_ZOOM, toBoard, useUi } from '../state/ui';
import { Z } from './depth';
import { installTouchGestures } from './pointer';

export function CameraRig() {
  const camera = useThree((s) => s.camera) as OrthographicCamera;
  const size = useThree((s) => s.size);
  const gl = useThree((s) => s.gl);
  const invalidate = useThree((s) => s.invalidate);

  useEffect(() => {
    useUi.getState().setView({ width: size.width, height: size.height });
  }, [size.width, size.height]);

  useEffect(() => {
    const apply = () => {
      const { view } = useUi.getState();
      camera.position.set(view.x, -view.y, Z.camera);
      camera.zoom = view.zoom;
      camera.updateProjectionMatrix();
      invalidate();
    };
    apply();
    return useUi.subscribe((state, prev) => {
      if (state.view !== prev.view) apply();
    });
  }, [camera, invalidate]);

  useEffect(() => {
    const element = gl.domElement;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const { view, setView } = useUi.getState();
      if (event.shiftKey) {
        setView({ x: view.x + event.deltaY / view.zoom, y: view.y + event.deltaX / view.zoom });
        return;
      }
      if (!event.ctrlKey) {
        setView({ x: view.x + event.deltaX / view.zoom, y: view.y + event.deltaY / view.zoom });
        return;
      }
      const rect = element.getBoundingClientRect();
      const sx = event.clientX - rect.left;
      const sy = event.clientY - rect.top;
      const anchor = toBoard(view, sx, sy);
      const zoom = view.zoom * Math.exp(-event.deltaY * 0.01);
      const clamped = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
      setView({
        zoom: clamped,
        x: anchor.x - (sx - view.width / 2) / clamped,
        y: anchor.y - (sy - view.height / 2) / clamped,
      });
    };
    element.addEventListener('wheel', onWheel, { passive: false });
    const removeTouch = installTouchGestures(element);
    return () => {
      element.removeEventListener('wheel', onWheel);
      removeTouch();
    };
  }, [gl]);

  return null;
}

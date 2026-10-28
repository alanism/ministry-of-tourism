import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import { run } from '../state/board';
import { useUi } from '../state/ui';
import { panCamera, zoomAt, zoomPosition } from './board-camera';
import '../vendor/enochian-board/controls.css';

/** A compact Draw three button beside the top navigation. */
export function DrawThreeButton() {
  const [drawn, setDrawn] = useState('');
  useEffect(() => {
    if (!drawn) return;
    const timer = setTimeout(() => setDrawn(''), 4000);
    return () => clearTimeout(timer);
  }, [drawn]);

  return (
    <div className="enochian-draw draw-three-control" role="group" aria-label="Draw cards">
      <span className={`enochian-lamp${drawn ? ' is-lit' : ''}`} aria-hidden="true" />
      <span className="enochian-socket">
        <button
          type="button"
          className="enochian-push"
          title="Deal one Noun and two other unused cards. Empty cards from the previous draw go back."
          onClick={() => {
            const { view } = useUi.getState();
            const hand = run<{ cards: { id: string; name: string }[] }>('cards_draw', { x: Math.round(view.x), y: Math.round(view.y) });
            if (!hand) return;
            useUi.getState().select(null);
            useUi.getState().deal(hand.cards.map((card) => card.id));
            const names = hand.cards.map((card) => card.name);
            setDrawn(names.length ? `Drew ${names.slice(0, -1).join(', ')}${names.length > 1 ? ' and ' : ''}${names.at(-1)}` : 'Every card is already on the board');
          }}
        >DRAW 3</button>
      </span>
      <span className={`draw-status${drawn ? ' is-shown' : ''}`} role="status">{drawn}</span>
    </div>
  );
}

/** Enochian Slider 03 and Joystick, wired to the live board camera. */
export function BoardControls() {
  const zoom = useUi((s) => s.view.zoom);
  const [vector, setVector] = useState({ x: 0, y: 0 });
  const pointer = useRef<number | null>(null);
  const keys = useRef(new Set<string>());
  const stop = useCallback(() => {
    pointer.current = null;
    keys.current.clear();
    setVector({ x: 0, y: 0 });
  }, []);

  useEffect(() => {
    if (!vector.x && !vector.y) return;
    let frame = 0;
    let previous = performance.now();
    const move = (now: number) => {
      const { view, setView } = useUi.getState();
      setView(panCamera(view, vector.x, vector.y, Math.min(0.05, (now - previous) / 1000)));
      previous = now;
      frame = requestAnimationFrame(move);
    };
    frame = requestAnimationFrame(move);
    return () => cancelAnimationFrame(frame);
  }, [vector]);

  useEffect(() => {
    const hidden = () => { if (document.hidden) stop(); };
    window.addEventListener('blur', stop);
    document.addEventListener('visibilitychange', hidden);
    return () => {
      window.removeEventListener('blur', stop);
      document.removeEventListener('visibilitychange', hidden);
    };
  }, [stop]);

  const aim = (e: PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const travel = r.width * 0.24;
    const x = (e.clientX - r.left - r.width / 2) / travel;
    const y = (e.clientY - r.top - r.height / 2) / travel;
    const length = Math.max(1, Math.hypot(x, y));
    setVector({ x: x / length, y: y / length });
  };

  const keyVector = () => setVector({
    x: Number(keys.current.has('ArrowRight')) - Number(keys.current.has('ArrowLeft')),
    y: Number(keys.current.has('ArrowDown')) - Number(keys.current.has('ArrowUp')),
  });

  return (
    <div className="enochian-controls" role="group" aria-label="Camera controls">
      <label className="enochian-zoom">
        <span className="enochian-readout">Zoom <output>{Math.round(zoom * 100)}%</output></span>
        <input
          className="enochian-slider"
          type="range"
          aria-label="Board zoom"
          aria-valuetext={`${Math.round(zoom * 100)} percent`}
          min={0}
          max={100}
          step={0.1}
          value={zoomPosition(zoom)}
          style={{ '--zoom-progress': `${zoomPosition(zoom)}%` } as CSSProperties}
          onChange={(e) => useUi.getState().setView({ zoom: zoomAt(Number(e.currentTarget.value)) })}
          onKeyDown={(e) => e.stopPropagation()}
        />
        <span className="enochian-scale" aria-hidden="true"><span>15%</span><span>400%</span></span>
      </label>
      <div className="enochian-pan">
        <div
          className="enochian-joystick"
          role="group"
          tabIndex={0}
          aria-label="Pan board"
          aria-describedby="board-pan-hint"
          onPointerDown={(e) => {
            if (pointer.current !== null || e.button !== 0) return;
            e.preventDefault();
            e.currentTarget.focus();
            pointer.current = e.pointerId;
            e.currentTarget.setPointerCapture(e.pointerId);
            aim(e);
          }}
          onPointerMove={(e) => { if (pointer.current === e.pointerId) aim(e); }}
          onPointerUp={(e) => { if (pointer.current === e.pointerId) stop(); }}
          onPointerCancel={(e) => { if (pointer.current === e.pointerId) stop(); }}
          onLostPointerCapture={stop}
          onBlur={stop}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return;
            e.preventDefault();
            keys.current.add(e.key);
            keyVector();
          }}
          onKeyUp={(e) => {
            e.stopPropagation();
            if (keys.current.delete(e.key)) { e.preventDefault(); keyVector(); }
          }}
        >
          <span className="enochian-stick" style={{ transform: `translate(${vector.x * 24 / Math.max(1, Math.hypot(vector.x, vector.y))}%, ${vector.y * 24 / Math.max(1, Math.hypot(vector.x, vector.y))}%)` }} aria-hidden="true" />
        </div>
        <span className="enochian-readout">Move</span>
        <span id="board-pan-hint" className="visually-hidden">Push and hold to move the camera. Use arrow keys while focused. Release to stop.</span>
      </div>
    </div>
  );
}

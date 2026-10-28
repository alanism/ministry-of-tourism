// An on/off switch: the Enochian toggle, sprung and draggable. Its click
// follows the app's Sounds setting (the one in Typewriter mode).
import { useEffect, useRef } from 'react';
import { makeToggle, type Toggle } from '../vendor/enochian-controls/toggle.js';
import '../vendor/enochian-controls/toggle.css';

export const SOUNDS_KEY = 'writers-board:typewriter-sounds';

export function soundsOn(): boolean {
  try {
    return localStorage.getItem(SOUNDS_KEY) === 'true';
  } catch {
    return false;
  }
}

export function Switch({ checked, onChange, label, title }: { checked: boolean; onChange: (on: boolean) => void; label: string; title?: string }) {
  const button = useRef<HTMLButtonElement>(null);
  const knob = useRef<HTMLSpanElement>(null);
  const toggle = useRef<Toggle | null>(null);
  const latest = useRef(onChange);
  latest.current = onChange;

  useEffect(() => {
    const b = button.current!;
    const k = knob.current!;
    toggle.current = makeToggle(b, k, {
      travel: () => b.clientWidth - k.offsetWidth - 6,
      onChange: (on) => latest.current(on),
      sounds: soundsOn,
    });
    return () => toggle.current?.destroy();
  }, []);

  // Changes made elsewhere (an agent, undo) move the knob without a click sound.
  useEffect(() => {
    if (toggle.current && toggle.current.get() !== checked) toggle.current.set(checked, true);
  }, [checked]);

  return (
    <label className="switch-field" title={title}>
      <button ref={button} type="button" className="tg std" role="switch" aria-checked={checked} aria-label={label}>
        <span ref={knob} className="tg-k" />
      </button>
      <span aria-hidden="true">{label}</span>
    </label>
  );
}

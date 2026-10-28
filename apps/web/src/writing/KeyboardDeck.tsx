// The Enochian typing keyboard under the typewriter. Tapping a key types onto
// the current line; typing on a real keyboard presses the matching key. The
// Volume knob sets the typewriter's sounds and the Page light knob lights the
// paper. Markup is rendered once: after that the keyboard's own script owns it.
import { memo, useEffect, useRef } from 'react';
import { mount } from '../vendor/enochian-keyboard/keyboard.js';
import '../vendor/enochian-keyboard/keyboard.css';

export interface DeckHandlers {
  /** The line the keys type into. */
  input: () => HTMLInputElement | null;
  onEnter: () => void;
  onParameter: (name: 'volume' | 'backlight', value: number) => void;
  finish: 'ivory' | 'obsidian';
  onFinish: (finish: 'ivory' | 'obsidian') => void;
}

/** Keys the real keyboard lights up while held, by `KeyboardEvent.code`. */
export function pressKey(root: HTMLElement | null, code: string, down: boolean) {
  const key = root?.querySelector<HTMLElement>(`.mk-key[data-code="${CSS.escape(code)}"]`);
  if (key) key.dataset.down = String(down);
}

export function releaseKeys(root: HTMLElement | null) {
  root?.querySelectorAll<HTMLElement>('.mk-key[data-down="true"]').forEach((key) => (key.dataset.down = 'false'));
}

function Deck({ handlers, rootRef }: { handlers: React.MutableRefObject<DeckHandlers>; rootRef: React.MutableRefObject<HTMLElement | null> }) {
  const root = useRef<HTMLElement>(null);

  useEffect(() => {
    const element = root.current;
    const input = handlers.current.input();
    if (!element || !input) return;
    rootRef.current = element;
    const keyboard = mount(element, input);
    let lastPointer = 'mouse';
    const onPointer = (e: PointerEvent) => (lastPointer = e.pointerType);
    const onKey = (e: Event) => {
      const { code } = (e as CustomEvent<{ code: string }>).detail;
      if (code === 'Enter') handlers.current.onEnter();
      // With a mouse, go back to the line so real typing carries on; on a
      // touch screen stay on the keys so the on-screen keyboard doesn't open.
      if (lastPointer === 'mouse') handlers.current.input()?.focus({ preventScroll: true });
    };
    const onParameter = (e: Event) => {
      const { parameter, value } = (e as CustomEvent<{ parameter: 'volume' | 'backlight'; value: number }>).detail;
      handlers.current.onParameter(parameter, value);
    };
    const onFinish = (e: Event) => {
      const choice = (e.target as HTMLElement).closest<HTMLElement>('[data-finish-choice]')?.dataset.finishChoice;
      if (choice === 'ivory' || choice === 'obsidian') handlers.current.onFinish(choice);
    };
    // The keyboard's own sound is never used, so its "SOUND OFF" notices would only confuse.
    const status = element.querySelector('[data-keyboard-status]')!;
    const quiet = new MutationObserver(() => {
      if (/^SOUND (ON|OFF)$/.test(status.textContent ?? '')) status.textContent = 'READY';
    });
    quiet.observe(status, { childList: true, characterData: true, subtree: true });
    element.addEventListener('pointerdown', onPointer, true);
    element.addEventListener('enochian:keyboard-key', onKey);
    element.addEventListener('enochian:keyboard-parameter', onParameter);
    element.addEventListener('click', onFinish);
    return () => {
      quiet.disconnect();
      element.removeEventListener('pointerdown', onPointer, true);
      element.removeEventListener('enochian:keyboard-key', onKey);
      element.removeEventListener('enochian:keyboard-parameter', onParameter);
      element.removeEventListener('click', onFinish);
      keyboard.destroy();
      rootRef.current = null;
    };
  }, [handlers, rootRef]);

  const finish = handlers.current.finish;
  return (
    <section ref={root} className="mk-rig typewriter-deck" data-enochian-keyboard data-finish={finish} aria-label="Typewriter keyboard">
      <div className="mk-toolbar">
        <div className="mk-finishes" role="group" aria-label="Keyboard finish">
          <button type="button" data-finish-choice="ivory" aria-pressed={finish === 'ivory'}>Ivory</button>
          <button type="button" data-finish-choice="obsidian" aria-pressed={finish === 'obsidian'}>Obsidian</button>
        </div>
        {/* The keyboard's own click sound stays off (the typewriter's sounds play
            instead) and its Clear button stays hidden so it can't wipe the line. */}
        <div className="mk-actions" hidden>
          <button type="button" data-keyboard-sound aria-pressed="false" aria-label="Sound off">SOUND OFF</button>
          <button type="button" data-keyboard-clear>Clear</button>
        </div>
      </div>
      <div className="mk-scroll" tabIndex={0} role="region" aria-label="Keyboard surface; scroll sideways on smaller screens">
        <div className="mk-board" tabIndex={0} role="group" aria-label="Typewriter keys; type while focused">
          <div className="mk-keys" data-keyboard-keys />
          <div className="mk-rail">
            <div className="mk-dial" data-parameter="volume" role="slider" tabIndex={0} aria-label="Volume" aria-valuemin={0} aria-valuemax={100} aria-valuenow={40} aria-valuetext="40 percent">
              <svg className="mk-ticks" viewBox="0 0 100 100" aria-hidden="true" />
              <span className="mk-base" />
              <span className="mk-knob"><span className="mk-marker" /></span>
            </div>
            <div className="mk-dial mk-dot" data-parameter="backlight" role="slider" tabIndex={0} aria-label="Page light" aria-valuemin={0} aria-valuemax={100} aria-valuenow={80} aria-valuetext="80 percent">
              <svg className="mk-ticks" viewBox="0 0 100 100" aria-hidden="true" />
              <span className="mk-base" />
              <span className="mk-knob"><span className="mk-marker" /></span>
            </div>
            <div className="mk-screen">
              <div className="mk-illumination" />
              <div className="mk-clock">
                <time data-clock />
                <small data-clock-date />
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="mk-status">
        <span data-keyboard-status role="status">READY</span>
        <span>KNOBS: DRAG ↕ / ARROWS <span className="mk-pan-hint">· PAN THE KEYS ↔</span></span>
      </div>
    </section>
  );
}

/** Never re-rendered by React once mounted: the handlers ref carries what changes. */
export const KeyboardDeck = memo(Deck, () => true);

// @ts-nocheck
/* Enochian "Binary Gate" toggle, from volume-3/index.html: the shared Spring,
   SNAP constants, click sounds and makeToggle, unchanged except that sounds
   play only when the host allows them (`sounds()`).
   Based on Enochian UI UX Elements by alanism / UnCommon Core
   (https://github.com/alanism/Enochian-UI-UX-Elements), CC BY-NC 4.0. */
const SNAP = { stiffness: 700, damping: 35, mass: 0.8 };
const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

class Spring {
  constructor(value, cfg, onUpdate, prec = 0.01) { this.x = value; this.v = 0; this.t = value; this.cfg = cfg; this.on = onUpdate; this.prec = prec; this.raf = 0; onUpdate(value); }
  to(target, cfg) {
    this.t = target; if (cfg) this.cfg = cfg;
    if (reduce) { this.x = target; this.v = 0; this.on(target); return; }
    if (!this.raf) { this.last = performance.now(); this.raf = requestAnimationFrame(this.step); }
  }
  set(value) { this.x = this.t = value; this.v = 0; if (this.raf) { cancelAnimationFrame(this.raf); this.raf = 0; } this.on(value); }
  step = (now) => {
    let dt = Math.min(0.05, (now - this.last) / 1000); this.last = now;
    const { stiffness: k, damping: c, mass: m } = this.cfg;
    while (dt > 0) { const h = Math.min(1 / 240, dt); const a = (-k * (this.x - this.t) - c * this.v) / m; this.v += a * h; this.x += this.v * h; dt -= h; }
    if (Math.abs(this.x - this.t) < this.prec && Math.abs(this.v) < this.prec * 4) { this.x = this.t; this.v = 0; this.on(this.x); this.raf = 0; return; }
    this.on(this.x); this.raf = requestAnimationFrame(this.step);
  };
}

let AC = null, NB = null;
function click(sounds, freq = 3200, gain = 0.12, q = 1.4) {
  if (!sounds()) return;
  if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; } }
  if (AC.state === 'suspended') AC.resume();
  if (!NB) { NB = AC.createBuffer(1, Math.floor(AC.sampleRate * 0.08), AC.sampleRate); const d = NB.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 5); }
  const src = AC.createBufferSource(); src.buffer = NB;
  const f = AC.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
  const g = AC.createGain(); g.gain.value = gain;
  src.connect(f); f.connect(g); g.connect(AC.destination); src.start();
}

export function makeToggle(btn, knob, { travel, axis = 'x', onChange, sounds = () => false }) {
  const tick = () => click(sounds, 4200, 0.07, 2);
  const thock = () => click(sounds, 1100, 0.22, 1.1);
  let on = btn.getAttribute('aria-checked') === 'true', sp;
  const T = typeof travel === 'function' ? travel : () => travel;
  const draw = (x) => { knob.style.transform = axis === 'x' ? `translateX(${(x * T()).toFixed(2)}px)` : `translateY(${((1 - x) * T()).toFixed(2)}px)`; };
  sp = new Spring(on ? 1 : 0, SNAP, draw, 0.001);
  function set(v, quiet) { const ch = v !== on; on = v; btn.setAttribute('aria-checked', String(on)); sp.to(on ? 1 : 0); if (ch && !quiet) { on ? thock() : tick(); } if (!quiet) onChange && onChange(on); }
  let drag = false, s0 = 0, x0 = 0, moved = 0;
  const ac = new AbortController(); const opt = { signal: ac.signal };
  btn.addEventListener('pointerdown', (e) => { drag = true; s0 = axis === 'x' ? e.clientX : e.clientY; x0 = sp.x; moved = 0; try { btn.setPointerCapture(e.pointerId); } catch (_) {} }, opt);
  btn.addEventListener('pointermove', (e) => { if (!drag) return; const p = axis === 'x' ? e.clientX : e.clientY; const d = (p - s0) * (axis === 'x' ? 1 : -1); moved = Math.max(moved, Math.abs(d)); if (moved > 3) sp.set(clamp(x0 + d / T(), 0, 1)); }, opt);
  btn.addEventListener('pointerup', () => { if (!drag) return; drag = false; if (moved > 3) set(sp.x > 0.5); else set(!on); }, opt);
  btn.addEventListener('pointercancel', () => { drag = false; sp.to(on ? 1 : 0); }, opt);
  btn.addEventListener('click', (e) => { if (e.detail === 0) set(!on); }, opt); // keyboard Space / Enter
  btn.addEventListener('keydown', (e) => {
    const fwd = axis === 'x' ? 'ArrowRight' : 'ArrowUp', back = axis === 'x' ? 'ArrowLeft' : 'ArrowDown';
    if (e.key === fwd) { e.preventDefault(); set(true); } else if (e.key === back) { e.preventDefault(); set(false); }
  }, opt);
  return { set, get: () => on, destroy: () => ac.abort() };
}

import './main';
import './typography-preview/preview.css';

type Variant = 'a' | 'b' | 'c';
const descriptions: Record<Variant, string> = {
  a: 'A: Current IBM Plex typography',
  b: 'B: Zilla Slab headings · Nunito body and controls',
  c: 'C: Nunito headings · Zilla Slab body and controls',
};
const buttons = document.querySelectorAll<HTMLButtonElement>('[data-typography-choice]');

function choose(variant: Variant) {
  document.documentElement.dataset.typography = variant;
  for (const button of buttons) button.setAttribute('aria-pressed', String(button.dataset.typographyChoice === variant));
  document.getElementById('typography-description')!.textContent = descriptions[variant];
  const url = new URL(location.href);
  url.searchParams.set('typography', variant);
  history.replaceState(history.state, '', url);
}

for (const button of buttons) button.addEventListener('click', () => choose(button.dataset.typographyChoice as Variant));
const requested = new URLSearchParams(location.search).get('typography');
choose(requested === 'b' || requested === 'c' ? requested : 'a');

import {expect,it} from 'vitest';
import {magazineReadingHtml,magazineReadingText} from './magazine-markdown.ts';
it('renders the declared reading subset without rewriting the source',()=>{
  const source='## Our day\n\n**Museum** then *coffee*.\n\n- Walk\n- Rest\n\n1. First\n2. Second\n\n> Slow down\n\n`a < b`';
  const html=magazineReadingHtml(source);for(const fragment of ['<h4>Our day</h4>','<strong>Museum</strong>','<em>coffee</em>','<ul>','<ol>','<blockquote>Slow down</blockquote>','<code>a &lt; b</code>'])expect(html).toContain(fragment);
  expect(magazineReadingText(source)).not.toMatch(/##|\*\*Museum\*\*/);expect(source).toContain('**Museum**');
});
it('keeps active HTML and remote images inert and validates deliberate links',()=>{
  const html=magazineReadingHtml('<script>secret()</script>\n\n![Photo](https://example.org/a.png) [Bad](javascript:alert) [Good](https://example.org/source)');
  expect(html).not.toContain('<script>');expect(html).not.toContain('<img');expect(html).not.toContain('javascript:');expect(html).toContain('image not embedded');expect(html).toContain('href="https://example.org/source"');
});

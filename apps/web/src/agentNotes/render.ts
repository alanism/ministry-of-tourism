// Turns public/agents.md into the collapsible "For AI agents" block in the page.
// The page carries the same text agents get at /agents.md, rendered once at
// build time, so there is one source and it is plain HTML (no scripts needed to read it).
const escapeHtml = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function inline(text: string): string {
  // Code spans are set aside first so nothing inside them is changed.
  const code: string[] = [];
  const held = escapeHtml(text).replace(/`([^`]+)`/g, (_m, c: string) => `\u0000${code.push(`<code>${c}</code>`) - 1}\u0000`);
  const rich = held
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, label: string, href: string) => (/^(https?:\/\/|\/)/.test(href) ? `<a href="${href}">${label}</a>` : label));
  return rich.replace(/\u0000(\d+)\u0000/g, (_m, i: string) => code[Number(i)]!);
}

/** The Markdown subset agents.md uses: headings, paragraphs, lists, bold, code and links. */
export function renderAgentNotes(markdown: string): string {
  const html: string[] = [];
  let paragraph: string[] = [];
  let list: { tag: 'ul' | 'ol'; items: string[] } | null = null;

  const flushParagraph = () => {
    if (paragraph.length) html.push(`<p>${paragraph.map(inline).join('<br>')}</p>`);
    paragraph = [];
  };
  const flushList = () => {
    if (list) html.push(`<${list.tag}>${list.items.map((item) => `<li>${inline(item)}</li>`).join('')}</${list.tag}>`);
    list = null;
  };

  for (const raw of markdown.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trimEnd();
    const bullet = /^- (.+)/.exec(line);
    const numbered = /^\d+\. (.+)/.exec(line);
    if (!line.trim()) {
      flushParagraph();
      flushList();
    } else if (line.startsWith('# ')) {
      flushParagraph();
      flushList();
      html.push(`<h2>${inline(line.slice(2))}</h2>`);
    } else if (line.startsWith('## ')) {
      flushParagraph();
      flushList();
      html.push(`<h3>${inline(line.slice(3))}</h3>`);
    } else if (bullet || numbered) {
      flushParagraph();
      const tag = bullet ? 'ul' : 'ol';
      if (list && list.tag !== tag) flushList();
      list ??= { tag, items: [] };
      list.items.push((bullet ?? numbered)![1]!);
    } else {
      flushList();
      paragraph.push(line);
    }
  }
  flushParagraph();
  flushList();

  return `<details class="agent-notes"><summary>For AI agents</summary><div class="agent-notes-body" role="region" aria-label="Notes for AI agents">${html.join('')}</div></details>`;
}

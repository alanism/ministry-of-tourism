// Markdown export: the board as a plain document the writer can keep, share
// or paste anywhere: the draft, then every card by column in framework order
// (with its pinned passages and notes), sticky notes, guides and sources.
import type { BoardView, CardView } from '../commands/board-commands.ts';
import { CATEGORY_IDS, getCategory, getFrameworkCard } from '../framework/catalog.ts';

const quote = (text: string) =>
  text
    .trim()
    .split('\n')
    .map((line) => `> ${line}`)
    .join('\n');

function cardSection(card: CardView): string {
  const lines = [`### ${card.name}`, '', `*${card.question}*`, ''];
  lines.push(card.text.trim() ? card.text.trim() : '_(not written yet)_');
  for (const link of card.links) {
    if (link.status === 'gone') continue;
    lines.push('', quote(link.current || link.quote));
  }
  if (card.score) lines.push('', `Score: ${card.score.value}/5${card.score.note ? `: ${card.score.note}` : ''}`);
  if (card.annotation.trim()) lines.push('', `Note: ${card.annotation.trim()}`);
  return lines.join('\n');
}

export function exportMarkdown(board: BoardView): string {
  const out: string[] = [`# ${board.title || 'My board'}`];

  if (board.manuscript.trim()) out.push('## Draft', board.manuscript.trim());

  for (const category of CATEGORY_IDS) {
    const cards = board.cards
      .filter((c) => c.category === category)
      .sort((a, b) => (getFrameworkCard(a.type)?.order ?? 0) - (getFrameworkCard(b.type)?.order ?? 0) || a.y - b.y || a.x - b.x);
    if (cards.length === 0) continue;
    out.push(`## ${getCategory(category).label}`, ...cards.map(cardSection));
  }

  const notes = board.notes.filter((n) => n.text.trim());
  if (notes.length) out.push('## Sticky notes', notes.map((n) => `- ${n.text.trim().replace(/\n+/g, ' ')}`).join('\n'));

  const guides = board.guides.filter((g) => g.kind === 'path' && g.stops.some((s) => s.label.trim()));
  for (const guide of guides) {
    const stops = [...guide.stops].sort((a, b) => a.t - b.t).filter((s) => s.label.trim());
    out.push(`## ${guide.title}`, stops.map((s, i) => `${i + 1}. ${s.label.trim()}`).join('\n'));
  }

  const frames = board.images.filter((i) => i.stage && (i.caption || i.art));
  if (frames.length) {
    const ordered = [...frames].sort((a, b) => a.y - b.y || a.x - b.x);
    out.push('## Storyboard', ordered.map((f, i) => `${i + 1}. **${f.caption || `Frame ${i + 1}`}**${f.art ? `: ${f.art}` : ''}`).join('\n'));
  }

  if (board.sources.length) out.push('## Sources', board.sources.map((s) => `- ${s.title}${s.author ? `, ${s.author}` : ''}`).join('\n'));

  return `${out.join('\n\n')}\n`;
}

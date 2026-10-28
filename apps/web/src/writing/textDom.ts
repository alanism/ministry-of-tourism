// Helpers for a plain-text contenteditable: read its text, and convert between
// character offsets and DOM positions (for the caret and for highlights).

/** The element's text, with <br> read as a line break. */
export function readText(root: Node): string {
  let out = '';
  root.childNodes.forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE) out += node.nodeValue ?? '';
    else if (node.nodeName === 'BR') out += '\n';
    else out += readText(node);
  });
  return out;
}

/** The DOM position for a character offset. */
export function domPoint(root: Node, offset: number): { node: Node; offset: number } {
  let remaining = offset;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let last: Text | null = null;
  for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
    const length = node.data.length;
    if (remaining <= length) return { node, offset: remaining };
    remaining -= length;
    last = node;
  }
  return last ? { node: last, offset: last.data.length } : { node: root, offset: 0 };
}

/** The character offset of a DOM position inside root. */
export function textOffset(root: Node, node: Node, offset: number): number {
  const range = document.createRange();
  range.setStart(root, 0);
  range.setEnd(node, offset);
  return range.toString().length;
}

export function caretOffset(root: HTMLElement): number | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || !root.contains(selection.focusNode)) return null;
  return textOffset(root, selection.focusNode!, selection.focusOffset);
}

export function placeCaret(root: HTMLElement, offset: number) {
  const point = domPoint(root, offset);
  const selection = window.getSelection();
  selection?.collapse(point.node, point.offset);
}

export function rangeFor(root: Node, start: number, end: number): Range {
  const range = document.createRange();
  const a = domPoint(root, start);
  const b = domPoint(root, end);
  range.setStart(a.node, a.offset);
  range.setEnd(b.node, b.offset);
  return range;
}

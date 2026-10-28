// The writer's draft is shared text in the board document. Editors hand this
// module their new text; it works out the smallest change and sends it as
// commands, so the draft goes through the same command layer as everything
// else. A burst of typing becomes one undo step.
import { WRITER, boardSession, run } from './board';

const IDLE_MS = 900;
let typingTimer: ReturnType<typeof setTimeout> | undefined;
let inBurst = false;

function startBurst() {
  if (!inBurst) {
    boardSession().beginRun(WRITER);
    inBurst = true;
  }
  clearTimeout(typingTimer);
  typingTimer = setTimeout(endBurst, IDLE_MS);
}

export function endBurst() {
  clearTimeout(typingTimer);
  if (inBurst) {
    boardSession().endRun(WRITER);
    inBurst = false;
  }
}

/** The single changed range between two strings. */
export function diffText(before: string, after: string): { index: number; remove: number; insert: string } | null {
  if (before === after) return null;
  let start = 0;
  const max = Math.min(before.length, after.length);
  while (start < max && before[start] === after[start]) start++;
  let endBefore = before.length;
  let endAfter = after.length;
  while (endBefore > start && endAfter > start && before[endBefore - 1] === after[endAfter - 1]) {
    endBefore--;
    endAfter--;
  }
  return { index: start, remove: endBefore - start, insert: after.slice(start, endAfter) };
}

/** Replaces the draft with `next`, as the writer, sending only what changed. */
export function writeDraft(current: string, next: string) {
  const change = diffText(current, next);
  if (!change) return;
  startBurst();
  if (change.remove > 0) run('manuscript_delete', { index: change.index, length: change.remove });
  if (change.insert) run('manuscript_insert', { index: change.index, text: change.insert });
}

/** Appends to the end of the draft (the typewriter's carriage return). */
export function appendToDraft(current: string, text: string) {
  if (!text) return;
  startBurst();
  run('manuscript_insert', { index: current.length, text });
}

export function wordCount(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

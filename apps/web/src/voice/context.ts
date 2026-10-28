// Shared application context. Voice providers consume snapshots and transcripts;
// transport events, credentials and image bytes stay outside this module.
import type { BoardView } from '@writers-board/core';

export interface VoiceTurn { role: 'user' | 'assistant'; text: string }
export interface VoiceFocus {
  selectedId: string | null;
  editingId: string | null;
  mode: string;
  view: { x: number; y: number; zoom: number; width: number; height: number };
  draft?: { id: string; text: string; selectedText: string };
}
export interface VoiceSource {
  read(): { board: BoardView; focus: VoiceFocus };
  subscribe(listener: () => void): () => void;
}
interface ContextItem {
  id: string; kind: string; label: string; text: string;
  x?: number; y?: number; type?: string; annotation?: string;
}
interface Change { id: string; action: 'added' | 'updated' | 'removed'; item: ContextItem }
export interface VoiceSnapshot {
  revision: number;
  board: { title: string; agentMode: string; draftForMe: boolean; counts: Record<string, number> };
  mode: string;
  selected: ContextItem | null;
  related: ContextItem[];
  editing: VoiceFocus['draft'] | null;
  viewport: VoiceFocus['view'];
  changes: Change[];
  conversation: VoiceTurn[];
}

/** UTF-8 bounds also work for languages whose characters span several tokens. */
export function clipText(text: string, bytes: number): string {
  const encoder = new TextEncoder();
  if (encoder.encode(text).length <= bytes) return text;
  let result = '';
  let used = 0;
  for (const character of text) {
    const size = encoder.encode(character).length;
    if (used + size > bytes - 3) break;
    result += character; used += size;
  }
  return result + '…';
}

function items(board: BoardView) {
  const entries: { item: ContextItem; fingerprint: string }[] = [];
  const add = (item: ContextItem, raw: unknown) => entries.push({ item, fingerprint: JSON.stringify(raw) });
  for (const card of board.cards) add({ id: card.id, kind: 'card', label: card.name, type: card.type, text: card.text, annotation: card.annotation, x: card.x, y: card.y }, card);
  for (const note of board.notes) add({ id: note.id, kind: 'note', label: 'Sticky note', text: note.text, x: note.x, y: note.y }, note);
  // Captions identify images; they are never a claim to have seen their pixels.
  for (const image of board.images) add({ id: image.id, kind: 'image', label: image.caption || 'Picture', text: '', x: image.x, y: image.y }, image);
  for (const guide of board.guides) add({ id: guide.id, kind: 'guide', label: guide.title, text: guide.kind }, guide);
  for (const connection of board.connections) add({ id: connection.id, kind: 'connection', label: 'Yarn', text: `${connection.from} → ${connection.to}` }, connection);
  for (const stroke of board.strokes) add({ id: stroke.id, kind: 'stroke', label: 'Drawing', text: `${stroke.points.length / 2} points` }, stroke);
  return new Map(entries.map(entry => [entry.item.id, entry]));
}

export function createVoiceContext(source: VoiceSource, history: VoiceTurn[] = []) {
  let previousBoard: BoardView | undefined;
  let index: ReturnType<typeof items> = new Map();
  let changes: Change[] = [];
  let signature = '';
  let revision = 0;
  const conversation: VoiceTurn[] = [];
  const trimHistory = () => {
    while (conversation.length > 16 || new TextEncoder().encode(JSON.stringify(conversation)).length > 6000) conversation.shift();
  };
  const record = (turn: VoiceTurn) => {
    if (!turn.text.trim()) return;
    conversation.push({ role: turn.role, text: clipText(turn.text.trim(), 1200) });
    trimHistory();
  };
  history.forEach(record);
  return {
    record,
    correctAssistant(original: string, corrected: string) {
      const index = conversation.findLastIndex(turn => turn.role === 'assistant' && turn.text === clipText(original.trim(), 1200));
      if (index >= 0) {
        if (corrected.trim()) conversation[index] = { role: 'assistant', text: clipText(corrected.trim(), 1200) };
        else conversation.splice(index, 1);
        trimHistory();
      }
    },
    history: () => conversation.map(turn => ({ ...turn })),
    subscribe: (listener: () => void) => source.subscribe(listener),
    snapshot(): VoiceSnapshot {
      const { board, focus } = source.read();
      if (board !== previousBoard) {
        const next = items(board);
        if (previousBoard) {
          const delta: Change[] = [];
          for (const [id, entry] of next) if (index.get(id)?.fingerprint !== entry.fingerprint) delta.push({ id, action: index.has(id) ? 'updated' : 'added', item: { ...entry.item, text: clipText(entry.item.text, 400) } });
          for (const [id, entry] of index) if (!next.has(id)) delta.push({ id, action: 'removed', item: { ...entry.item, text: '' } });
          if (board.manuscript !== previousBoard.manuscript) delta.push({ id: 'manuscript', action: 'updated', item: { id: 'manuscript', kind: 'manuscript', label: 'Draft', text: 'The manuscript changed; read its current text before discussing details.' } });
          const changedIds = new Set(delta.map(change => change.id));
          changes = [...changes.filter(change => !changedIds.has(change.id)), ...delta].slice(-8);
        }
        index = next; previousBoard = board;
      }
      const selected = index.get(focus.selectedId ?? '')?.item ?? null;
      const connected = new Set(board.connections.flatMap(connection => connection.from === selected?.id ? [connection.to] : connection.to === selected?.id ? [connection.from] : []));
      const value = {
        board: { title: board.title, agentMode: board.agentMode, draftForMe: board.draftForMe, counts: { cards: board.cards.length, notes: board.notes.length, images: board.images.length, connections: board.connections.length, guides: board.guides.length, strokes: board.strokes.length, manuscriptCharacters: board.manuscript.length } },
        mode: focus.mode, selected,
        related: [...connected].flatMap(id => index.get(id)?.item ?? []).slice(0, 4),
        editing: focus.draft && focus.draft.id === focus.editingId ? { ...focus.draft } : null,
        viewport: { ...focus.view, x: Math.round(focus.view.x), y: Math.round(focus.view.y), zoom: Math.round(focus.view.zoom * 100) / 100 },
        changes, conversation: conversation.map(turn => ({ ...turn })),
      };
      const nextSignature = JSON.stringify(value);
      if (nextSignature !== signature) { revision++; signature = nextSignature; }
      return { revision, ...value };
    },
  };
}
export type VoiceContext = ReturnType<typeof createVoiceContext>;

/** Small factual update for a voice frontend; full details remain in the backend. */
export function voiceSummary(snapshot: VoiceSnapshot): string {
  const selected = snapshot.selected;
  return JSON.stringify({
    revision: snapshot.revision, board: clipText(snapshot.board.title, 100), mode: snapshot.board.agentMode,
    draftForMe: snapshot.board.draftForMe, counts: snapshot.board.counts,
    selected: selected ? { id: selected.id, kind: selected.kind, label: clipText(selected.label, 80), text: clipText(selected.text, 400) } : null,
    editing: snapshot.editing ? { id: snapshot.editing.id, unsavedText: clipText(snapshot.editing.text, 400), selectedText: clipText(snapshot.editing.selectedText, 160) } : null,
    changes: snapshot.changes.slice(-3).map(change => ({ id: change.id, action: change.action, label: clipText(change.item.label, 60), text: clipText(change.item.text, 100) })),
    viewport: snapshot.viewport,
  });
}

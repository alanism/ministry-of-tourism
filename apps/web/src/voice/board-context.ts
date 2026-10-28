import { boardSession, latestBoard } from '../state/board';
import { useUi } from '../state/ui';
import type { VoiceSource } from './context';

/** Subscriptions exist only while a live conversation is running. */
export function boardVoiceSource(): VoiceSource {
  return {
    read() {
      const ui = useUi.getState();
      const board = latestBoard();
      if (!board) throw new Error('Open the board first.');
      const editor = document.querySelector<HTMLTextAreaElement>('.card-editor textarea, .note-editor textarea');
      return { board, focus: { selectedId: ui.selectedId, editingId: ui.editingId, mode: ui.mode, view: ui.view,
        ...(editor && ui.editingId ? { draft: { id: ui.editingId, text: editor.value, selectedText: editor.value.slice(editor.selectionStart, editor.selectionEnd) } } : {}),
      } };
    },
    subscribe(listener) {
      const doc = boardSession().doc;
      doc.on('update', listener);
      const stopUi = useUi.subscribe((state, before) => {
        if (state.selectedId !== before.selectedId || state.editingId !== before.editingId || state.view !== before.view || state.mode !== before.mode) listener();
      });
      const editorChanged = () => {
        if (useUi.getState().editingId) listener();
      };
      document.addEventListener('input', editorChanged);
      document.addEventListener('selectionchange', editorChanged);
      return () => {
        doc.off('update', listener); stopUi();
        document.removeEventListener('input', editorChanged);
        document.removeEventListener('selectionchange', editorChanged);
      };
    },
  };
}

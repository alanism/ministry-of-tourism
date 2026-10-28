import { lazy, Suspense, useEffect, useState } from 'react';
import { Board } from './board/Board';
import { itemKind } from './board/bounds';
import { clientToBoard } from './board/pointer';
import { WRITER, boardSession, latestBoard, run, useBoard } from './state/board';
import { imagesFromClipboard, placeImages } from './state/images';
import { useUi } from './state/ui';
import { AccessibleBoard } from './ui/AccessibleBoard';
import { CardEditor } from './ui/CardEditor';
import { StoryboardDialog } from './ui/StoryboardDialog';
import { ReverseEngineerDialog } from './ui/ReverseEngineerDialog';
import { SettingsDialog } from './ui/SettingsDialog';
import { ConnectAgentsDialog } from './ui/ConnectAgentsDialog';
import { AgentView } from './ui/AgentView';
import { LensSheet } from './ui/LensSheet';
import { applyAgentLinks } from './state/bridge';
import { SidePanel } from './ui/SidePanel';
import { LabelEditor } from './ui/LabelEditor';
import { ModeTabs } from './ui/ModeTabs';
import { Notebook } from './writing/Notebook';
import { Typewriter } from './writing/Typewriter';
import { NoteEditor } from './ui/NoteEditor';
import { Palette } from './ui/Palette';
import { Toolbar } from './ui/Toolbar';
import { ViewCorner } from './ui/ViewCorner';
import { BoardsDialog } from './ui/BoardsDialog';
import { applyPalette } from './state/palette';


const ArtworkPicker = lazy(() => import('./artwork/ArtworkPicker'));

const REMOVE: Record<string, string> = {
  card: 'card_delete',
  note: 'note_delete',
  image: 'image_delete',
  guide: 'guide_delete',
  connection: 'connection_delete',
  stroke: 'stroke_delete',
};

function useShortcuts(ready: boolean) {
  useEffect(() => {
    if (!ready) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('input, textarea, select, [contenteditable="true"]')) return;
      const ui = useUi.getState();
      const board = latestBoard();
      const id = ui.selectedId;
      const kind = board && id ? itemKind(board, id) : null;
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      if (mod && key === 'z') {
        e.preventDefault();
        if (e.shiftKey) boardSession().redo(WRITER.id);
        else boardSession().undo(WRITER.id);
      } else if (mod && key === 'y') {
        e.preventDefault();
        boardSession().redo(WRITER.id);
      } else if (mod) {
        return;
      } else if (e.key === 'Escape') {
        if (ui.tool !== 'select') ui.setTool('select');
        ui.select(null);
      } else if (id && kind && (e.key === 'Delete' || e.key === 'Backspace')) {
        e.preventDefault();
        run(REMOVE[kind]!, { id });
        ui.select(null);
      } else if (id && e.key === 'Enter' && (kind === 'card' || kind === 'note')) {
        e.preventDefault();
        ui.edit(id);
      } else if (id && kind === 'card' && key === 'f') {
        ui.toggleFlip(id);
      } else if (id && kind === 'card' && key === 'r') {
        const card = board!.cards.find((c) => c.id === id)!;
        run('card_update', { id, orientation: card.orientation === 'portrait' ? 'landscape' : 'portrait' });
      } else if (key === 'v') ui.setTool('select');
      else if (key === 'm') ui.setTool('marker');
      else if (key === 'e') ui.setTool('eraser');
      else if (key === 'y') ui.setTool('yarn');
    };
    const onPaste = (e: ClipboardEvent) => {
      if ((e.target as HTMLElement).closest?.('input, textarea')) return;
      const files = imagesFromClipboard(e);
      if (files.length === 0) return;
      e.preventDefault();
      void placeImages(files);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('paste', onPaste);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('paste', onPaste);
    };
  }, [ready]);
}

export function WriterApp() {
  const open = useBoard();
  const mode = useUi((s) => s.mode);
  const editingId = useUi((s) => s.editingId);
  const labelEdit = useUi((s) => s.labelEdit);
  const dialog = useUi((s) => s.dialog);
  const [dropping, setDropping] = useState(false);
  useEffect(() => {
    const url = new URL(location.href);
    if (url.searchParams.has('chatgpt')) {
      useUi.getState().setDialog('settings');
    }
  }, []);
  useShortcuts(open !== null && mode === 'board' && dialog === null);
  const ready = open !== null;
  // Reconnect agent links saved from last time, once the board is open.
  useEffect(() => {
    if (ready) applyAgentLinks();
  }, [ready]);
  // Draw everything in the board's palette; it changes when anyone switches it.
  const palette = open?.view.palette;
  useEffect(() => {
    if (palette) applyPalette(palette);
  }, [palette]);


  if (!open) return <div className="loading">Opening your board…</div>;
  const editingCard = open.view.cards.find((c) => c.id === editingId);
  const editingNote = open.view.notes.find((n) => n.id === editingId);

  // A plain page for agents in cloud browsers (no WebGL needed): ?view=agent
  if (new URLSearchParams(location.search).get('view') === 'agent') return <AgentView board={open.view} />;

  if (mode !== 'board') {
    return (
      <div className={`app writing-mode mode-${mode}`}>
        <ModeTabs title={open.view.title} />
        {mode === 'notebook' ? <Notebook board={open.view} /> : <Typewriter board={open.view} />}
        {dialog === 'boards' && <BoardsDialog />}
      </div>
    );
  }

  return (
    <div
      className={`app ${dropping ? 'is-dropping' : ''}`}
      onDragOver={(e) => {
        if (![...e.dataTransfer.items].some((i) => i.kind === 'file')) return;
        e.preventDefault();
        setDropping(true);
      }}
      onDragLeave={() => setDropping(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDropping(false);
        void placeImages([...e.dataTransfer.files], clientToBoard(e.clientX, e.clientY));
      }}
    >
      <ModeTabs title={open.view.title} />
      <Toolbar board={open.view} />
      <main className="stage">
        <Board board={open.view} />
        <LensSheet />
        {editingCard && <CardEditor key={editingCard.id} card={editingCard} />}
        {editingNote && <NoteEditor key={editingNote.id} note={editingNote} />}
        {labelEdit && <LabelEditor key={`${labelEdit.guideId}:${labelEdit.field}`} edit={labelEdit} />}
      </main>
      <Palette board={open.view} />
      <SidePanel board={open.view} />
      <ViewCorner board={open.view} />
      {dialog === 'settings' && <SettingsDialog />}
      {dialog === 'reverse' && <ReverseEngineerDialog />}
      {dialog === 'agents' && <ConnectAgentsDialog />}
      {dialog === 'storyboard' && <StoryboardDialog board={open.view} />}
      {dialog === 'boards' && <BoardsDialog />}
      {dialog === 'artwork' && <Suspense fallback={<div className="dialog-backdrop"><section className="dialog" role="dialog" aria-label="Artwork"><p role="status">Opening artwork…</p><button onClick={() => useUi.getState().setDialog(null)}>Close</button></section></div>}><ArtworkPicker /></Suspense>}
      <AccessibleBoard board={open.view} />
    </div>
  );
}

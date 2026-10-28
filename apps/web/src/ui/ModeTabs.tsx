import { useEffect, useRef, useState } from 'react';
import { BOARD_ID, run } from '../state/board';
import { createBoard, openBoard } from '../state/boards';
import { endBurst } from '../state/manuscript';
import { useUi, type Mode } from '../state/ui';
import { ago, useBoardList } from './BoardsDialog';
import { Menu } from './Menu';
import { DrawThreeButton } from './BoardControls';

/** The open board's name, opening a menu of your other boards. */
function BoardSwitcher({ title }: { title: string }) {
  const [editing, setEditing] = useState(false);
  const boards = useBoardList().filter((b) => !b.deletedAt);
  const others = boards.filter((b) => b.id !== BOARD_ID).slice(0, 6);
  if (editing) {
    return (
      <input
        className="board-name-input"
        aria-label="Board name"
        defaultValue={title}
        maxLength={120}
        autoFocus
        onFocus={(e) => e.currentTarget.select()}
        onBlur={(e) => {
          const next = e.currentTarget.value.trim();
          if (next && next !== title) run('board_set_title', { title: next });
          setEditing(false);
        }}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key !== 'Enter' && e.key !== 'Escape') return;
          e.preventDefault();
          if (e.key === 'Escape') e.currentTarget.value = title;
          e.currentTarget.blur();
        }}
      />
    );
  }
  return (
    <Menu
      label={<span className="board-switcher-title">{title}</span>}
      heading="Your boards"
      items={[
        { label: title, hint: 'Open now', checked: true, onSelect: () => {} },
        { label: 'Rename board…', onSelect: () => setEditing(true) },
        // Size and last edit tell boards with the same name apart.
        ...others.map((b) => ({ label: b.title, hint: [`${b.cards} cards`, ago(b.updatedAt)].filter(Boolean).join(' · '), checked: false, onSelect: () => openBoard(b.id) })),
        { heading: ' ' },
        { label: 'New board', onSelect: () => void createBoard().then(openBoard) },
        { label: 'All boards…', hint: 'Rename, duplicate, import, back up and save to a folder', onSelect: () => useUi.getState().setDialog('boards') },
      ]}
    />
  );
}

// MOT-02: MoT hides the writing modes (Notebook, Typewriter). Code stays dormant, unreachable here.
const MODES: { id: Mode; label: string }[] = [{ id: 'board', label: 'Board' }];

export function ModeTabs({ title }: { title: string }) {
  const mode = useUi((s) => s.mode);
  const nav = useRef<HTMLElement>(null);
  useEffect(() => {
    const element = nav.current;
    if (!element) return;
    const header = element.parentElement;
    const report = () => {
      header?.style.setProperty('--top-nav-height', `${element.getBoundingClientRect().height}px`);
      if (header) document.documentElement.style.setProperty('--mode-header-bottom', `${header.getBoundingClientRect().bottom}px`);
    };
    report();
    const observer = new ResizeObserver(report);
    observer.observe(element);
    if (header) observer.observe(header);
    return () => {
      observer.disconnect();
      document.documentElement.style.removeProperty('--mode-header-bottom');
    };
  }, []);
  return (
    <div className="mode-header">
    <nav className="mode-tabs" aria-label="Mode" ref={nav}>
      <span className="brand-lockup" aria-label="UnCommon Core, Writer's Board">
        <span className="signal" aria-hidden="true">◆</span>
        <span aria-hidden="true">
          UnCommon Core <span className="brand-sep">//</span> Writer’s Board
        </span>
      </span>
      <div className="board-switcher">
        <BoardSwitcher title={title} />
      </div>
      {MODES.map((m) => (
        <button
          key={m.id}
          aria-current={mode === m.id ? 'page' : undefined}
          onClick={() => {
            endBurst();
            useUi.getState().setMode(m.id);
          }}
        >
          {m.label}
        </button>
      ))}
    </nav>
    {mode === 'board' && <DrawThreeButton />}
    </div>
  );
}

// The A5 notebook: free writing that flows from page to page across two-page
// spreads. Pages turn when the writing reaches the next spread (or with the
// arrows). Passages pinned to cards are highlighted; select a passage to pin it.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { BoardView } from '@writers-board/core';
import { endBurst, wordCount, writeDraft } from '../state/manuscript';
import { run } from '../state/board';
import { PinMenu, type PinTarget } from './PinMenu';
import { caretOffset, placeCaret, rangeFor, readText, textOffset } from './textDom';
import { joinDictation, MicButton } from '../voice/MicButton';
import { Switch } from '../ui/Switch';
import { ReadAloud } from '../voice/ReadAloud';

const PAGE_W = 420;
const PAGE_H = 596; // A5 proportions (148 x 210 mm)
const SPREAD_W = PAGE_W * 2;
const PAPERS = ['ruled', 'dotted', 'squared', 'blank'] as const;
type Paper = (typeof PAPERS)[number];
const PAPER_KEY = 'writers-board:notebook-paper';

function savedPaper(): Paper {
  try {
    const value = localStorage.getItem(PAPER_KEY);
    if (value && (PAPERS as readonly string[]).includes(value)) return value as Paper;
  } catch {
    // Fall back to ruled pages.
  }
  return 'ruled';
}

function fitScale() {
  return Math.min(1, (window.innerHeight - 150) / PAGE_H, (window.innerWidth - 32) / SPREAD_W);
}

export function Notebook({ board }: { board: BoardView }) {
  const text = board.manuscript;
  const editor = useRef<HTMLDivElement>(null);
  const pages = useRef<HTMLDivElement>(null);
  const shown = useRef(text);
  const [spread, setSpread] = useState(0);
  const spreadRef = useRef(0);
  spreadRef.current = spread;
  const [turning, setTurning] = useState<'forward' | 'back' | null>(null);
  const [pageCount, setPageCount] = useState(2);
  const [paper, setPaper] = useState<Paper>(savedPaper);
  const [scale, setScale] = useState(fitScale);
  const [pin, setPin] = useState<PinTarget | null>(null);
  const [toast, setToast] = useState('');
  const [reader, setReader] = useState(false);

  const measure = useCallback(() => {
    const el = editor.current;
    if (!el) return;
    const count = Math.max(2, Math.ceil(el.scrollWidth / PAGE_W));
    setPageCount(count + (count % 2));
  }, []);

  const turnTo = useCallback((next: number) => {
    setSpread((current) => {
      if (next === current) return current;
      setTurning(next > current ? 'forward' : 'back');
      setTimeout(() => setTurning(null), 520);
      return next;
    });
  }, []);

  /** Turn to whichever spread the caret is on. */
  const followCaret = useCallback(() => {
    const el = editor.current;
    const wrap = pages.current;
    const selection = window.getSelection();
    if (!el || !wrap || !selection || selection.rangeCount === 0 || !el.contains(selection.focusNode)) return;
    const range = selection.getRangeAt(0).cloneRange();
    range.collapse(false);
    const rect = range.getClientRects()[0] ?? (selection.focusNode as Element).getBoundingClientRect?.();
    if (!rect) return;
    // Position within the whole run of pages, whichever spread is showing.
    const x = (rect.left - wrap.getBoundingClientRect().left) / scale + spreadRef.current * SPREAD_W;
    turnTo(Math.max(0, Math.floor(x / SPREAD_W)));
  }, [scale, turnTo]);

  // Bring outside changes (another device, an agent with Draft for me) into the page.
  useLayoutEffect(() => {
    const el = editor.current;
    if (!el) return;
    if (readText(el) !== text) {
      const focused = document.activeElement === el;
      const caret = focused ? caretOffset(el) : null;
      el.textContent = text;
      if (caret !== null) placeCaret(el, Math.min(caret, text.length));
    }
    shown.current = text;
    measure();
  }, [text, measure]);

  // Highlight passages pinned to cards.
  useEffect(() => {
    const el = editor.current;
    if (!el || !('highlights' in CSS)) return;
    const ranges = board.cards
      .flatMap((card) => card.links)
      .filter((link) => link.target.kind === 'manuscript' && link.status !== 'gone' && link.end <= text.length)
      .map((link) => rangeFor(el, link.start, link.end));
    CSS.highlights.set('pinned', new Highlight(...ranges));
    // A reader's marks: green for "love it", red for "confused".
    const marks = (kind: 'love' | 'confused') =>
      board.feedback.filter((m) => m.kind === kind && m.status !== 'gone' && m.end <= text.length).map((m) => rangeFor(el, m.start, m.end));
    CSS.highlights.set('reader-love', new Highlight(...marks('love')));
    CSS.highlights.set('reader-confused', new Highlight(...marks('confused')));
    return () => {
      for (const name of ['pinned', 'reader-love', 'reader-confused']) CSS.highlights.delete(name);
    };
  }, [board.cards, board.feedback, text]);

  useEffect(() => {
    const onResize = () => setScale(fitScale());
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      endBurst();
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 2400);
    return () => clearTimeout(timer);
  }, [toast]);

  const onInput = () => {
    const el = editor.current!;
    const next = readText(el);
    writeDraft(shown.current, next);
    shown.current = next;
    measure();
    followCaret();
  };

  /** Offer "Pin to card" when a passage is selected. */
  const checkSelection = () => {
    const el = editor.current;
    const selection = window.getSelection();
    if (!el || !selection || selection.isCollapsed || !el.contains(selection.anchorNode)) {
      setPin(null);
      return;
    }
    const range = selection.getRangeAt(0);
    const quote = range.toString();
    if (!quote.trim()) return setPin(null);
    const rect = range.getBoundingClientRect();
    const host = el.closest('.notebook-stage')!.getBoundingClientRect();
    setPin({ quote, start: textOffset(el, range.startContainer, range.startOffset), x: rect.left - host.left, y: rect.bottom - host.top + 8 });
  };

  /** Dictated words go in at the caret (or the end), as the writer's own. */
  const dictate = (said: string) => {
    const el = editor.current;
    if (!el) return;
    const current = shown.current;
    const at = Math.min(caretOffset(el) ?? current.length, current.length);
    const before = joinDictation(current.slice(0, at), said);
    const next = joinDictation(current.slice(0, at), said, current.slice(at));
    writeDraft(current, next);
    shown.current = next;
    el.textContent = next;
    el.focus();
    placeCaret(el, before.length);
    measure();
    followCaret();
  };

  const words = wordCount(text);

  return (
    <section className="notebook" aria-label="Notebook">
      <div className="notebook-bar">
        <span className="notebook-meta">
          Pages {spread * 2 + 1}–{spread * 2 + 2} of {pageCount} · {words} words
        </span>
        <MicButton onText={dictate} onError={setToast} />
        <ReadAloud text={text} editor={editor} onMessage={setToast} />
        <Switch label="Reader marks" checked={reader} onChange={setReader} title="Hand the notebook to a reader: they select passages and mark them pink (love it) or grey (confused)" />
        {board.feedback.length > 0 && (
          <span>
            {board.feedback.filter((m) => m.kind === 'love').length} loved · {board.feedback.filter((m) => m.kind === 'confused').length} confused{' '}
            <button className="link" onClick={() => run('feedback_clear', {})}>
              clear
            </button>
          </span>
        )}
        <div className="segmented" role="group" aria-label="Paper">
          {PAPERS.map((p) => (
            <button
              key={p}
              aria-pressed={paper === p}
              onClick={() => {
                setPaper(p);
                try {
                  localStorage.setItem(PAPER_KEY, p);
                } catch {
                  // Remembering the paper is only a convenience.
                }
              }}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      <div className="notebook-stage" style={{ width: SPREAD_W * scale, height: PAGE_H * scale }}>
        <div className="notebook-book" style={{ transform: `scale(${scale})` }}>
          <div className="notebook-spine" />
          <div className="notebook-ribbon" />
          <div className="notebook-band" />
          {/* The paper is fixed to the spread; the text slides under it a spread at a time. */}
          <div className={`notebook-pages paper-${paper}`} ref={pages} onScroll={() => pages.current && (pages.current.scrollLeft = 0)}>
            <div
              ref={editor}
              className="notebook-text"
              style={{ transform: `translateX(${-spread * SPREAD_W}px)` }}
              contentEditable="plaintext-only"
              suppressContentEditableWarning
              spellCheck
              role="textbox"
              aria-multiline="true"
              aria-label="Notebook pages"
              onInput={onInput}
              onKeyUp={() => {
                followCaret();
                checkSelection();
              }}
              onMouseUp={checkSelection}
              onBlur={() => endBurst()}
            />
          </div>
          {turning && <div className={`notebook-turn turn-${turning} paper-${paper}`} />}
          <span className="notebook-folio left">{spread * 2 + 1}</span>
          <span className="notebook-folio right">{spread * 2 + 2}</span>
        </div>
        <button className="notebook-nav prev" aria-label="Previous pages" disabled={spread === 0} onClick={() => turnTo(spread - 1)}>
          ‹
        </button>
        <button className="notebook-nav next" aria-label="Next pages" disabled={spread * 2 + 2 >= pageCount} onClick={() => turnTo(spread + 1)}>
          ›
        </button>
        {pin && reader && (
          <div className="reader-marks" style={{ left: pin.x, top: pin.y }}>
            {(['love', 'confused'] as const).map((kind) => (
              <button
                key={kind}
                className={kind}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  let n = 0;
                  for (let at = text.indexOf(pin.quote); at !== -1 && at <= pin.start; at = text.indexOf(pin.quote, at + 1)) n++;
                  const ok = run('feedback_add', { kind, quote: pin.quote, occurrence: Math.max(1, n) });
                  setPin(null);
                  window.getSelection()?.removeAllRanges();
                  setToast(ok ? (kind === 'love' ? 'Marked: love it' : 'Marked: confused') : 'Could not mark that passage');
                }}
              >
                {kind === 'love' ? 'Love it' : 'Confused'}
              </button>
            ))}
          </div>
        )}
        {pin && !reader && (
          <PinMenu
            board={board}
            target={pin}
            onDone={(message) => {
              setPin(null);
              if (message) setToast(message);
            }}
          />
        )}
      </div>
      {toast && (
        <p className="toast" role="status">
          {toast}
        </p>
      )}
    </section>
  );
}

// A small menu button: the toolbar keeps a few things in view and puts the
// rest one click away. Arrow keys move through the items; Escape closes it.
import { useEffect, useRef, useState, type ReactNode } from 'react';

export interface MenuItem {
  label: string;
  onSelect: () => void;
  hint?: string;
  disabled?: boolean;
  /** For a choice among several: shown with a mark when it's the current one. */
  checked?: boolean;
}

export function Menu({ label, items, heading, align = 'left' }: { label: ReactNode; items: (MenuItem | { heading: string })[]; heading?: string; align?: 'left' | 'right' }) {
  const [open, setOpen] = useState(false);
  // Fixed to the screen beside its button, so a scrolling toolbar can't clip it.
  const [at, setAt] = useState<React.CSSProperties>({});
  const root = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if (!open) return;
    list.current?.querySelector<HTMLButtonElement>('[role^=menuitem]:not(:disabled)')?.focus();
    const outside = (e: PointerEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener('pointerdown', outside, true);
    return () => window.removeEventListener('pointerdown', outside, true);
  }, [open]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setOpen(false);
      root.current?.querySelector<HTMLButtonElement>('.menu-button')?.focus();
      return;
    }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const entries = [...(list.current?.querySelectorAll<HTMLButtonElement>('[role^=menuitem]:not(:disabled)') ?? [])];
    const at = entries.indexOf(document.activeElement as HTMLButtonElement);
    entries[(at + (e.key === 'ArrowDown' ? 1 : -1) + entries.length) % entries.length]?.focus();
  };

  return (
    <div className="menu" ref={root} onKeyDown={onKeyDown}>
      <button
        type="button"
        className="menu-button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const below = r.bottom + 6;
          const room = window.innerHeight - below;
          const vertical = room > 220 ? { top: below } : { bottom: window.innerHeight - r.top + 6 };
          setAt(align === 'right' ? { ...vertical, right: Math.max(8, window.innerWidth - r.right) } : { ...vertical, left: Math.max(8, r.left) });
          setOpen(!open);
        }}
      >
        {label}
        <span className="menu-caret" aria-hidden="true" />
      </button>
      {open && (
        <ul className="menu-list" style={at} role="menu" ref={list} aria-label={heading}>
          {items.map((item, i) =>
            'heading' in item ? (
              <li key={`h${i}`} className="menu-heading" role="presentation">
                {item.heading}
              </li>
            ) : (
              <li key={item.label} role="none">
                <button
                  type="button"
                  role={item.checked === undefined ? 'menuitem' : 'menuitemradio'}
                  aria-checked={item.checked}
                  disabled={item.disabled}
                  onClick={() => {
                    setOpen(false);
                    item.onSelect();
                  }}
                >
                  <span className="menu-item-text">
                    {item.label}
                    {item.hint && <span className="menu-hint">{item.hint}</span>}
                  </span>
                </button>
              </li>
            ),
          )}
        </ul>
      )}
    </div>
  );
}

// Shared pieces for the trip screens: icons, the ⋮ menu, the toast.
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';

const paths = {
  dots: <><circle cx="12" cy="5" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="12" cy="19" r="1.6" /></>,
  close: <path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />,
  checkCircle: <><circle cx="12" cy="12" r="9.5" fill="none" stroke="currentColor" strokeWidth="1.6" /><path d="M7.8 12.3l2.8 2.8 5.6-5.8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></>,
  chevronDown: <path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />,
  chevronUp: <path d="M6 15l6-6 6 6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />,
  chevronLeft: <path d="M15 6l-6 6 6 6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />,
  arrowRight: <path d="M5 12h13M13 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />,
  plus: <path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />,
  sparkle: <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM18.5 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />,
  device: <><rect x="5" y="3.5" width="14" height="17" rx="3" fill="none" stroke="currentColor" strokeWidth="1.5" /><path d="M10 17.5h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></>,
  file: <><path d="M7 3.5h7l4 4V20a.5.5 0 0 1-.5.5h-10.5a.5.5 0 0 1-.5-.5V4a.5.5 0 0 1 .5-.5z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /><path d="M14 3.5V8h4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /></>,
  doc: <><rect x="5" y="3.5" width="14" height="17" rx="2" fill="none" stroke="currentColor" strokeWidth="1.5" /><path d="M8.5 8h7M8.5 11.5h7M8.5 15h4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></>,
  postcard: <><rect x="4" y="5" width="16" height="14" rx="2" fill="none" stroke="currentColor" strokeWidth="1.5" /><path d="M7 15.5h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></>,
  memory: <><rect x="4" y="4" width="16" height="16" rx="2" fill="none" stroke="currentColor" strokeWidth="1.5" /><path d="M7.5 8.5h9M7.5 12h9M7.5 15.5h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></>,
  photo: <><rect x="3.5" y="5" width="17" height="14" rx="2" fill="none" stroke="currentColor" strokeWidth="1.5" /><circle cx="9" cy="10" r="1.6" fill="none" stroke="currentColor" strokeWidth="1.4" /><path d="M4 17l5-4.5 3.5 3 3-2.5L20 17" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /></>,
  pin: <><path d="M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11z" fill="none" stroke="currentColor" strokeWidth="1.5" /><circle cx="12" cy="10" r="2.2" fill="none" stroke="currentColor" strokeWidth="1.5" /></>,
};
export type IconName = keyof typeof paths;

export function Icon({ name, title }: { name: IconName; title?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden={title ? undefined : true} role={title ? 'img' : undefined} fill="currentColor">
      {title && <title>{title}</title>}
      {paths[name]}
    </svg>
  );
}

export function Diamond() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5l9.5 9.5-9.5 9.5L2.5 12z" fill="#cc0000" /></svg>;
}

/** The MOT wordmark as supplied (outlined, black). Its 48-unit clear space is part of the file. */
export function Logo({ large = false }: { large?: boolean }) {
  return <img className={large ? 'mot-logo large' : 'mot-logo'} src="/brand/mot-horizontal-gotham-book.svg" alt="MOT, Ministry of Tourism" />;
}

export interface MenuItem { label: string; onSelect: () => void; danger?: boolean; }
export type MenuEntry = MenuItem | 'divider' | { heading: string };

/** Native modal focus, Escape and return-focus behavior for decisions, on every screen size. */
export function FocusSheet({ label, onClose, children }: { label: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return <dialog ref={ref} className="mot-dialog" aria-label={label} onCancel={(e) => { e.preventDefault(); onClose(); }}
    onClick={(e) => { if (e.target === ref.current) onClose(); }}>{children}</dialog>;
}

/** The ⋮ menu: every card action lives here so the card itself stays calm. */
export function Menu({ label, items, icon = 'dots', trigger }: { label: string; items: MenuEntry[]; icon?: IconName; trigger?: { className: string; content: ReactNode } }) {
  // Fixed to the viewport, so a lane's scroll area never clips it.
  const [at, setAt] = useState<{ top: number; left: number } | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const toggle = () => {
    if (at) { setAt(null); return; }
    const r = wrap.current!.getBoundingClientRect();
    setAt({ top: r.bottom + 4, left: Math.max(8, Math.min(r.right - 220, window.innerWidth - 228)) });
  };
  useLayoutEffect(() => {
    if (!at) return;
    const menu = wrap.current?.querySelector<HTMLElement>('[role="menu"]');
    if (!menu) return;
    const top = Math.max(8, Math.min(at.top, window.innerHeight - menu.offsetHeight - 8));
    if (Math.abs(top - at.top) > 1) setAt({ ...at, top });
  }, [at]);
  useEffect(() => {
    if (!at) return;
    const close = () => setAt(null);
    const away = (e: PointerEvent) => { if (!wrap.current?.contains(e.target as Node)) close(); };
    const scroll = (e: Event) => { if (!wrap.current?.querySelector('[role="menu"]')?.contains(e.target as Node)) close(); };
    const keys = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); close(); wrap.current?.querySelector('button')?.focus({ preventScroll: true }); return; }
      if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return;
      const items = [...(wrap.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [])];
      if (!items.length) return;
      e.preventDefault();
      const current = items.indexOf(document.activeElement as HTMLButtonElement);
      const index = e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1 : (current + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
      items[index]?.focus();
    };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', keys);
    document.addEventListener('scroll', scroll, true);
    window.addEventListener('resize', close);
    wrap.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus({ preventScroll: true });
    return () => {
      document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', keys);
      document.removeEventListener('scroll', scroll, true); window.removeEventListener('resize', close);
    };
  }, [at]);
  const open = at !== null;
  return (
    <div className="m-menu-wrap" ref={wrap}>
      <button type="button" className={trigger?.className ?? 'm-icon-btn'} aria-label={label} aria-haspopup="menu" aria-expanded={open} onClick={toggle}>{trigger?.content ?? <Icon name={icon} />}</button>
      {at && (
        <div className="m-menu" role="menu" aria-label={label} style={{ position: 'fixed', top: at.top, left: at.left, right: 'auto', width: 220 }}>
          {items.map((item, i) => item === 'divider' ? <hr key={i} />
            : 'heading' in item ? <div key={i} className="m-eyebrow">{item.heading}</div>
            : <button key={i} type="button" role="menuitem" className={item.danger ? 'danger' : undefined} onClick={() => { setAt(null); item.onSelect(); }}>{item.label}</button>)}
        </div>
      )}
    </div>
  );
}

export function Toast({ message, action, onClose }: { message: string; action?: { label: string; run: () => void }; onClose: () => void }) {
  return (
    <div className="mot-toast" role="status">
      <Icon name="checkCircle" /><span>{message}</span>
      {action && <button type="button" className="m-toast-action" onClick={() => { onClose(); action.run(); }}>{action.label}</button>}
      <button type="button" className="m-icon-btn" aria-label="Dismiss" onClick={onClose}><Icon name="close" /></button>
    </div>
  );
}

export function Thumb({ url, fallback = 'photo' }: { url: string | null; fallback?: IconName }): ReactNode {
  return <span className="mot-thumb">{url ? <img src={url} alt="" /> : <Icon name={fallback} />}</span>;
}

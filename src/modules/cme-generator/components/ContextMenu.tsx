import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

export interface MenuItem {
  label: string;
  icon?: ReactNode;
  danger?: boolean;
  disabled?: boolean;
  /** Riga di intestazione non cliccabile */
  header?: boolean;
  onClick?: () => void;
}

// Pannello opzioni del tasto destro: si chiude con clic fuori, Esc o scorrimento
export function ContextMenu({ x, y, items, onClose }: { x: number; y: number; items: MenuItem[]; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });

  // resta dentro lo schermo
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({ left: Math.max(4, Math.min(x, window.innerWidth - r.width - 4)), top: Math.max(4, Math.min(y, window.innerHeight - r.height - 4)) });
  }, [x, y]);

  useEffect(() => {
    const close = () => onClose();
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', key);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('keydown', key);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [onClose]);

  return (
    <>
      <div className="fixed inset-0 z-[90]" onMouseDown={onClose} onContextMenu={e => { e.preventDefault(); onClose(); }} />
      <div
        ref={ref} style={pos} role="menu"
        className="fixed z-[91] min-w-[230px] max-w-[360px] py-1 rounded border border-slate-200 dark:border-white/15 bg-white dark:bg-[#141C2B] shadow-xl text-[12px] text-slate-900 dark:text-white"
      >
        {items.map((it, i) => it.header ? (
          <div key={i} className="px-3 py-1.5 text-[11px] text-slate-500 dark:text-slate-400 truncate border-b border-slate-100 dark:border-white/10 mb-1">{it.label}</div>
        ) : (
          <button
            key={i} role="menuitem" disabled={it.disabled}
            onClick={() => { onClose(); it.onClick?.(); }}
            className={`w-full flex items-center gap-2 px-3 py-1.5 text-left disabled:opacity-40 ${it.danger ? 'text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10' : 'hover:bg-slate-100 dark:hover:bg-white/10'}`}
          >
            <span className="w-4 shrink-0 flex justify-center">{it.icon}</span>
            <span className="truncate">{it.label}</span>
          </button>
        ))}
      </div>
    </>
  );
}

import clsx from 'clsx';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

export interface MenuItem {
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
  /** Render as a link (e.g. downloads) instead of a button. */
  href?: string;
  download?: boolean;
  checked?: boolean;
}
export type MenuEntry = MenuItem | 'separator' | { heading: string };

interface Anchor {
  x: number;
  y: number;
  /** Width of the trigger, so the menu can right-align to it. */
  alignRight?: number;
}

/**
 * Floating action menu, rendered in a portal with fixed positioning so it is
 * never clipped by cards or scroll containers. Keyboard: arrows, Home/End,
 * Enter/Space, Escape; focus returns to the trigger on close.
 */
export function MenuPopover({
  anchor,
  entries,
  onClose,
  label,
  trigger,
}: {
  anchor: Anchor;
  entries: MenuEntry[];
  onClose: () => void;
  label: string;
  /** The opening button; pressing it again toggles instead of close-then-reopen. */
  trigger?: HTMLElement | null;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { offsetWidth: w, offsetHeight: h } = el;
    let left = anchor.alignRight !== undefined ? anchor.alignRight - w : anchor.x;
    let top = anchor.y;
    left = Math.max(8, Math.min(left, window.innerWidth - w - 8));
    if (top + h > window.innerHeight - 8) top = Math.max(8, top - h - (anchor.alignRight !== undefined ? 40 : 0));
    setPos({ left, top });
    el.querySelector<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])')?.focus();
  }, [anchor]);

  useEffect(() => {
    const close = (e: Event) => {
      if (e.type === 'pointerdown') {
        const target = e.target as Node;
        if (ref.current?.contains(target) || trigger?.contains(target)) return;
      }
      onClose();
    };
    window.addEventListener('pointerdown', close);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', close, true);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', close, true);
    };
  }, [onClose, trigger]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    const items = [...(ref.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]:not([aria-disabled="true"])') ?? [])];
    const i = items.indexOf(document.activeElement as HTMLElement);
    const focus = (n: number) => items[(n + items.length) % items.length]?.focus();
    if (e.key === 'ArrowDown') focus(i + 1);
    else if (e.key === 'ArrowUp') focus(i - 1);
    else if (e.key === 'Home') focus(0);
    else if (e.key === 'End') focus(items.length - 1);
    else if (e.key === 'Escape' || e.key === 'Tab') onClose();
    else return;
    e.preventDefault();
  };

  return createPortal(
    <div
      ref={ref}
      role="menu"
      aria-label={label}
      onKeyDown={onKeyDown}
      onContextMenu={(e) => e.preventDefault()}
      style={{ left: pos?.left ?? -9999, top: pos?.top ?? -9999 }}
      className="fixed z-50 min-w-48 rounded-xl border border-line bg-surface p-1 shadow-pop animate-in"
    >
      {entries.map((entry, idx) => {
        if (entry === 'separator') return <div key={idx} role="separator" className="my-1 h-px bg-line" />;
        if ('heading' in entry)
          return (
            <div key={idx} className="px-2.5 pt-1.5 pb-1 text-[11px] font-medium tracking-wide text-fg-subtle uppercase">
              {entry.heading}
            </div>
          );
        const className = clsx(
          'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] outline-none',
          'focus-visible:outline-none',
          entry.disabled
            ? 'cursor-not-allowed text-fg-subtle'
            : entry.danger
              ? 'text-danger hover:bg-danger-soft focus:bg-danger-soft'
              : 'text-fg hover:bg-surface-2 focus:bg-surface-2',
        );
        const content = (
          <>
            <span className="flex size-4 items-center justify-center opacity-80" aria-hidden="true">
              {entry.icon}
            </span>
            <span className="flex-1">{entry.label}</span>
          </>
        );
        const select = () => {
          if (entry.disabled) return;
          onClose();
          entry.onSelect();
        };
        if (entry.href) {
          return (
            <a
              key={idx}
              role="menuitem"
              href={entry.href}
              download={entry.download || undefined}
              className={className}
              tabIndex={-1}
              onClick={() => onClose()}
            >
              {content}
            </a>
          );
        }
        return (
          <button
            key={idx}
            type="button"
            role={entry.checked !== undefined ? 'menuitemradio' : 'menuitem'}
            aria-checked={entry.checked}
            aria-disabled={entry.disabled || undefined}
            tabIndex={-1}
            className={className}
            onClick={select}
          >
            {content}
          </button>
        );
      })}
    </div>,
    document.body,
  );
}

/** Hook managing a menu opened from a button or a right-click. */
export function useMenu() {
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const triggerRef = useRef<HTMLElement | null>(null);

  /** Toggles the menu below/aligned to a button. */
  const openFromButton = useCallback((el: HTMLElement) => {
    triggerRef.current = el;
    const r = el.getBoundingClientRect();
    setAnchor((current) => (current ? null : { x: r.left, y: r.bottom + 4, alignRight: r.right }));
  }, []);

  const openAtPointer = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    triggerRef.current = e.currentTarget as HTMLElement;
    setAnchor({ x: e.clientX, y: e.clientY });
  }, []);

  const close = useCallback(() => {
    setAnchor(null);
    // Return focus to whatever opened the menu (keyboard users stay oriented).
    requestAnimationFrame(() => {
      if (document.activeElement === document.body) triggerRef.current?.focus();
    });
  }, []);

  return { anchor, open: anchor !== null, openFromButton, openAtPointer, close, trigger: triggerRef.current };
}

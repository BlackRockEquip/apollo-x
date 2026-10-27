"use client";

import { useCallback, useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { ChevronDown, MoreHorizontal } from "lucide-react";

export type ActionMenuItem = {
  key: string;
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
  dividerBefore?: boolean;
};

// A small dropdown for the job screen's Print and More menus and the parts-row kebab.
// Closes on Escape, on a click outside, and after an item is chosen; arrow keys move between items.
export function ActionMenu({
  label,
  icon,
  items,
  variant = "button",
  align = "right",
  ariaLabel,
  disabled,
}: {
  label?: string;
  icon?: ReactNode;
  items: ActionMenuItem[];
  variant?: "button" | "icon";
  align?: "left" | "right";
  ariaLabel?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  // The list is position:fixed so it is never clipped by a scrolling table wrapper or the fixed job header.
  const [pos, setPos] = useState<CSSProperties>({});
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuId = useId();

  const close = useCallback((returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  }, []);

  const toggle = () => {
    if (open) { setOpen(false); return; }
    const rect = triggerRef.current?.getBoundingClientRect();
    if (rect) {
      const estimatedHeight = items.length * 34 + 14;
      const above = rect.bottom + estimatedHeight > window.innerHeight - 8 && rect.top > estimatedHeight;
      const base: CSSProperties = above ? { bottom: window.innerHeight - rect.top + 4 } : { top: rect.bottom + 4 };
      setPos(align === "right" ? { ...base, right: Math.max(8, window.innerWidth - rect.right) } : { ...base, left: Math.max(8, rect.left) });
    }
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const onDismiss = () => setOpen(false);
    window.addEventListener("scroll", onDismiss, true);
    window.addEventListener("resize", onDismiss);
    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.stopPropagation(); close(true); }
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("scroll", onDismiss, true);
      window.removeEventListener("resize", onDismiss);
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close]);

  if (items.length === 0) return null;

  const moveFocus = (delta: number) => {
    const nodes = Array.from(rootRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') ?? []);
    if (nodes.length === 0) return;
    const index = nodes.indexOf(document.activeElement as HTMLButtonElement);
    nodes[(index + delta + nodes.length) % nodes.length]?.focus();
  };

  return (
    <div className="jw-menu" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className={variant === "icon" ? "jw-menu-trigger icon" : "jw-menu-trigger"}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={ariaLabel ?? label}
        disabled={disabled}
        onClick={toggle}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" && !open) { event.preventDefault(); toggle(); }
        }}
      >
        {variant === "icon" ? <MoreHorizontal size={16} /> : <>{icon}{label}<ChevronDown size={13} /></>}
      </button>
      {open && (
        <div
          id={menuId}
          role="menu"
          className="jw-menu-list"
          style={pos}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") { event.preventDefault(); moveFocus(1); }
            else if (event.key === "ArrowUp") { event.preventDefault(); moveFocus(-1); }
          }}
        >
          {items.map((item) => (
            <div key={item.key} role="none">
              {item.dividerBefore && <div className="jw-menu-divider" role="separator" />}
              <button
                type="button"
                role="menuitem"
                className={item.danger ? "jw-menu-item danger" : "jw-menu-item"}
                disabled={item.disabled}
                onClick={() => { close(false); item.onSelect(); }}
              >
                {item.icon}{item.label}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

"use client";

import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";

// A touch-sized popup for the mechanic tablet layout: big close button, closes on Escape or a tap on the dim area.
export function TabletSheet({ title, subtitle, size = "medium", onClose, footer, children }: { title: string; subtitle?: string; size?: "medium" | "large"; onClose: () => void; footer?: ReactNode; children: ReactNode }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="jt-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`jt-sheet ${size}`} role="dialog" aria-modal="true" aria-label={title}>
        <header className="jt-sheet-head">
          <div>
            <h2>{title}</h2>
            {subtitle ? <p>{subtitle}</p> : null}
          </div>
          <button type="button" className="jt-icon-button" onClick={onClose} aria-label="Close"><X size={22} /></button>
        </header>
        <div className="jt-sheet-body">{children}</div>
        {footer ? <footer className="jt-sheet-foot">{footer}</footer> : null}
      </div>
    </div>
  );
}

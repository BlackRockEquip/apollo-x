"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { tagLabel, tagOptions } from "@/lib/jobs/attachment-tags";

// 2026-11-03, user request: the tag on a photo / attachment is a small chip that only takes the room it needs (it used to stretch across
// the card), and clicking it changes the tag at any time. A file with no tag shows "+ Add tag". Read-only users just see the chip.
export function AttachmentTagChip({ tag, isPhoto, canEdit, busy, onChange }: {
  tag?: string | null;
  isPhoto: boolean;
  canEdit: boolean;
  busy?: boolean;
  onChange: (next: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (event: PointerEvent) => { if (root.current && !root.current.contains(event.target as Node)) setOpen(false); };
    const esc = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("pointerdown", away); document.removeEventListener("keydown", esc); };
  }, [open]);

  if (!canEdit) return tag ? <span className="jfu-chip jfu-chip-static">{tagLabel(tag)}</span> : null;

  const pick = (next: string | null) => { setOpen(false); if ((next || null) !== (tag || null)) onChange(next); };

  return (
    <span className="jfu-chip-wrap" ref={root}>
      <button type="button" className={tag ? "jfu-chip" : "jfu-chip jfu-chip-empty"} aria-haspopup="menu" aria-expanded={open} disabled={busy} onClick={() => setOpen((v) => !v)}>
        {tag ? <>{tagLabel(tag)} <ChevronDown size={12} aria-hidden="true" /></> : "+ Add tag"}
      </button>
      {open && (
        <div className="jfu-menu" role="menu">
          {tagOptions(isPhoto).map((option) => (
            <button key={option} type="button" role="menuitemradio" aria-checked={option === tag} className={option === tag ? "on" : ""} onClick={() => pick(option)}>
              {tagLabel(option)}{option === tag && <Check size={13} aria-hidden="true" />}
            </button>
          ))}
          {tag && <><hr /><button type="button" role="menuitem" className="muted" onClick={() => pick(null)}>No tag</button></>}
        </div>
      )}
    </span>
  );
}

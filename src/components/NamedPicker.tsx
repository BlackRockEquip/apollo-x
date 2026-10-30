"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Plus, Search } from "lucide-react";

// 2026-10-30, user request: a machinist or sales rep typed on a job that is not in the dropdown is added to it. A type-ahead box over
// a short named list: pick an existing name, or type a new one and choose "Add <name>" (the parent creates it and hands back the
// new option, which is then selected). Same look as the Machine make box (party-selector / selector-results).
export type NamedOption = { id: string; label: string };

type Props = {
  value: string;
  options: NamedOption[];
  onChange: (id: string) => void;
  /** Adds a name that is not in the list yet; resolve with the new option, reject with an Error to show its message. Omit to forbid adding. */
  onCreate?: (name: string) => Promise<NamedOption>;
  /** Wording of the "nothing chosen" row, e.g. "None" or "Same as the job". */
  emptyLabel?: string;
  placeholder?: string;
  disabled?: boolean;
  ariaLabel?: string;
};

export function filterNamedOptions(options: NamedOption[], query: string): NamedOption[] {
  const needle = query.trim().toLowerCase();
  return needle ? options.filter((option) => option.label.toLowerCase().includes(needle)) : options;
}

/** Can the typed text be offered as a new name? At least two letters and not already in the list (any capitals). */
export function canAddName(options: NamedOption[], query: string): boolean {
  const name = query.trim().toLowerCase();
  return name.length >= 2 && !options.some((option) => option.label.trim().toLowerCase() === name);
}

export function NamedPicker({ value, options, onChange, onCreate, emptyLabel = "None", placeholder = "Search or type new", disabled, ariaLabel }: Props) {
  const listId = useId();
  const root = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [active, setActive] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // 2026-10-30, user report: the list was clipped by / hidden behind the cards and the scrolling item table around it. It is drawn in a
  // portal on <body> with fixed coordinates taken from the input, so no card, table or sticky bar can cover or clip it.
  const box = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState<{ left: number; width: number; top: number | "auto"; bottom: number | "auto"; maxHeight: number } | null>(null);

  const selected = options.find((option) => option.id === value);
  const matches = filterNamedOptions(options, text);
  const showAdd = !!onCreate && canAddName(options, text);
  // Rows in order: the "nothing" row (while not typing), the matches, then "Add <name>".
  type Row = { key: string; kind: "empty" | "option" | "add"; option?: NamedOption };
  const rows: Row[] = [
    ...(text.trim() === "" ? [{ key: "empty", kind: "empty" as const }] : []),
    ...matches.map((option) => ({ key: option.id, kind: "option" as const, option })),
    ...(showAdd ? [{ key: "add", kind: "add" as const }] : []),
  ];

  useEffect(() => { setActive(0); }, [text, open]);

  const showList = open && !disabled && rows.length > 0;
  useLayoutEffect(() => {
    if (!showList) { setPlace(null); return; }
    // 2026-10-30, user report: the list must open below the field like a normal dropdown. Near the bottom of the screen the page is
    // first scrolled so the field has room under it; only when the page cannot scroll any further (end of the page) does it open upward.
    let scrolled = false;
    function measure() {
      const el = box.current;
      if (!el) return;
      let rect = el.getBoundingClientRect();
      if (!scrolled && window.innerHeight - rect.bottom < 240) {
        scrolled = true;
        el.scrollIntoView({ block: "center" });
        rect = el.getBoundingClientRect();
      }
      const below = window.innerHeight - rect.bottom - 8;
      const above = rect.top - 8;
      const up = below < 140 && above > below;
      const maxHeight = Math.max(120, Math.min(280, up ? above : below));
      // top and bottom are both always set ("auto" for the unused one): the shared .selector-results style has its own top.
      setPlace(up
        ? { left: rect.left, width: rect.width, top: "auto", bottom: window.innerHeight - rect.top + 2, maxHeight }
        : { left: rect.left, width: rect.width, top: rect.bottom + 2, bottom: "auto", maxHeight });
    }
    measure();
    window.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);
    return () => { window.removeEventListener("scroll", measure, true); window.removeEventListener("resize", measure); };
  }, [showList, rows.length]);

  function close() { setOpen(false); setText(""); }
  async function addTyped() {
    if (!onCreate || busy) return;
    const name = text.trim();
    setBusy(true); setError("");
    try {
      const created = await onCreate(name);
      onChange(created.id);
      close();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to add that name.");
    } finally {
      setBusy(false);
    }
  }
  function choose(row: Row) {
    if (row.kind === "add") { void addTyped(); return; }
    onChange(row.kind === "empty" ? "" : row.option!.id);
    close();
  }
  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") { event.preventDefault(); setOpen(true); setActive((index) => Math.min(index + 1, rows.length - 1)); }
    else if (event.key === "ArrowUp") { event.preventDefault(); setActive((index) => Math.max(index - 1, 0)); }
    else if (event.key === "Enter") {
      if (!open) return;
      event.preventDefault();
      // Typing a name that is already listed and pressing Enter picks it; otherwise the highlighted row.
      const exact = options.find((option) => option.label.trim().toLowerCase() === text.trim().toLowerCase());
      if (exact && text.trim()) { onChange(exact.id); close(); return; }
      const row = rows[active];
      if (row) choose(row);
    } else if (event.key === "Escape") { if (open) { event.preventDefault(); close(); } }
  }

  return (
    <div
      ref={root}
      className="party-selector npk"
      onBlur={(event) => { if (!root.current?.contains(event.relatedTarget as Node | null)) close(); }}
    >
      <div ref={box}>
        <Search size={14} />
        <input
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-label={ariaLabel}
          autoComplete="off"
          disabled={disabled}
          value={open ? text : selected?.label ?? ""}
          placeholder={open ? (selected ? selected.label : placeholder) : value ? "" : emptyLabel}
          onFocus={() => { setOpen(true); setText(""); setError(""); }}
          onChange={(event) => { setText(event.target.value); setOpen(true); setError(""); }}
          onKeyDown={onKeyDown}
        />
      </div>
      {showList && place && typeof document !== "undefined" && createPortal(
        <div
          className="selector-results npk-list"
          id={listId}
          role="listbox"
          style={{ position: "fixed", left: place.left, width: place.width, top: place.top, bottom: place.bottom, maxHeight: place.maxHeight }}
          onMouseDown={(event) => event.preventDefault()}
        >
          {rows.map((row, index) => (
            <button
              key={row.key}
              type="button"
              role="option"
              aria-selected={index === active}
              className={`npk-row${index === active ? " is-active" : ""}${row.kind === "add" ? " npk-add" : ""}`}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setActive(index)}
              onClick={() => choose(row)}
              disabled={busy && row.kind === "add"}
            >
              {row.kind === "empty" && <span className="npk-none">{emptyLabel}</span>}
              {row.kind === "option" && <strong>{row.option!.label}</strong>}
              {row.kind === "add" && <strong><Plus size={13} /> {busy ? "Adding..." : `Add "${text.trim()}" as a new name`}</strong>}
            </button>
          ))}
        </div>,
        document.body,
      )}
      {error && <span className="npk-error" role="alert">{error}</span>}
    </div>
  );
}

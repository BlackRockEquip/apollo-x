import type { ReactNode } from "react";
import { avatarTone, initialsOf } from "@/lib/ui/avatar";

// Small shared pieces for the redesigned Customers / Suppliers pages (list + detail) — 2026-10-29.

/** Rounded tile with the name's initials; the colour is stable for a given name (see avatarTone). */
export function PartyAvatar({ name, size = 36 }: { name: string; size?: number }) {
  const tone = avatarTone(name);
  return (
    <span className="pt-avatar" aria-hidden style={{ width: size, height: size, background: tone.bg, color: tone.fg, fontSize: Math.round(size * 0.36), borderRadius: size >= 48 ? 16 : 10 }}>
      {initialsOf(name)}
    </span>
  );
}

export function PartyTile({ label, value, hint, danger }: { label: string; value: ReactNode; hint?: ReactNode; danger?: boolean }) {
  return (
    <div className="pt-tile">
      <div className="pt-tile-label">{label}</div>
      <div className={`pt-tile-value${danger ? " is-danger" : ""}`}>{value}</div>
      {hint ? <div className="pt-tile-hint">{hint}</div> : null}
    </div>
  );
}

/** "27 Oct 2026", or an em dash when there is no date. */
export function fmtDay(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" });
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

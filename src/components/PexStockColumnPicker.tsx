"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SlidersHorizontal, X } from "lucide-react";
import { PEX_STOCK_COLUMNS, normalizePexStockColumns, type PexStockColumnId } from "@/lib/pex/stock-columns";

// PEX Stock - the "Columns" button and picker dialog (2026-10-28, user request:
// "allow a user to select custom columns like job wip ... Job #, Unit, Make,
// Model, Status are not removable, a user can only add to it"). Same dialog
// markup as the Jobs & WIP picker. Imports only the plain-data stock-columns.ts
// so this client bundle never pulls in the database client. Saves to
// /api/v1/pex/stock-columns (kept per user) then refreshes the page.

type ApiErrorBody = { error?: { message?: string } };

async function readErrorMessage(response: Response, fallback: string): Promise<string> {
  const body = (await response.json().catch(() => null)) as ApiErrorBody | null;
  return body?.error?.message || fallback;
}

export function PexStockColumnPicker({ selected }: { selected: PexStockColumnId[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [checked, setChecked] = useState<Set<PexStockColumnId>>(new Set(selected));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function openPicker() {
    setChecked(new Set(selected));
    setError("");
    setOpen(true);
  }

  function toggle(id: PexStockColumnId) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleSave() {
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/v1/pex/stock-columns", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ columns: normalizePexStockColumns(Array.from(checked)) }),
      });
      if (!response.ok) throw new Error(await readErrorMessage(response, "Unable to save your column choices."));
      setOpen(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save your column choices.");
    } finally {
      setSaving(false);
    }
  }

  async function handleReset() {
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/v1/pex/stock-columns", { method: "DELETE" });
      if (!response.ok) throw new Error(await readErrorMessage(response, "Unable to reset your column choices."));
      setOpen(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to reset your column choices.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <button type="button" className="quiet-button" onClick={openPicker}>
        <SlidersHorizontal size={14} /> Columns
      </button>

      {open && (
        <div className="drawer-backdrop" role="dialog" aria-modal="true">
          <aside className="form-drawer compact-dialog">
            <header>
              <div>
                <p className="eyebrow">PEX Stock</p>
                <h2>Columns</h2>
              </div>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close dialog">
                <X size={18} />
              </button>
            </header>
            <div style={{ overflow: "auto", padding: "4px 0 14px" }}>
              <p style={{ margin: "0 0 10px", fontSize: 11, color: "var(--ink-500)" }}>
                Job #, Unit, Make, Model and Status are always shown; tick any others you want added. Model lists the machine model and the component model together (e.g. R1700G / C6.6). Saved to your account, so it follows you to any device or browser.
              </p>
              {error && <div className="inline-error">{error}</div>}
              <div style={{ display: "grid", gap: 6 }}>
                {PEX_STOCK_COLUMNS.map((col) => (
                  <label key={col.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: col.locked ? "var(--ink-400)" : "var(--ink-700)" }}>
                    <input type="checkbox" checked={col.locked ? true : checked.has(col.id)} disabled={col.locked || saving} onChange={() => toggle(col.id)} />
                    {col.label}
                    {col.locked && <em style={{ fontStyle: "normal", fontSize: 10 }}> (always shown)</em>}
                  </label>
                ))}
              </div>
            </div>
            <footer className="detail-actions">
              <button type="button" className="quiet-button" disabled={saving} onClick={() => void handleReset()}>
                Reset to default
              </button>
              <button type="button" className="gold-button" disabled={saving} onClick={() => void handleSave()}>
                {saving ? "Saving..." : "Save"}
              </button>
            </footer>
          </aside>
        </div>
      )}
    </>
  );
}

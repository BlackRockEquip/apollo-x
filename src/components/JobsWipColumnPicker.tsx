"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SlidersHorizontal, X } from "lucide-react";
import { JOBS_WIP_COLUMNS, type JobsWipColumnId } from "@/lib/jobs/wip-columns";

// ---------------------------------------------------------------------------
// Jobs & WIP list — the "Columns" button + picker dialog for the
// customizable-columns feature, at the user's direct request. Deliberately
// only imports from wip-columns.ts (plain data, no prisma) — never
// wip-columns-service.ts — so this client bundle never pulls in the
// database client. Same drawer/dialog markup pattern as
// ImportExportWorkspace.tsx's results dialog and JobWorkspace.tsx's own
// register/status dialogs (`.drawer-backdrop` + `.form-drawer
// .compact-dialog`), rather than introducing a new dropdown/popover style
// this app doesn't have yet.
//
// Saving PUTs the full checked set to /api/v1/jobs/wip-columns (persisted
// server-side per user, see wip-columns-service.ts) and then calls
// router.refresh() so the server-rendered table (src/app/(tenant)/jobs/
// page.tsx) re-fetches with the new selection immediately, in the same tab,
// without a full page reload.
// ---------------------------------------------------------------------------

type ApiErrorBody = { error?: { message?: string } };

async function readErrorMessage(response: Response, fallback: string): Promise<string> {
  const body = (await response.json().catch(() => null)) as ApiErrorBody | null;
  return body?.error?.message || fallback;
}

// 2026-10-01 — `available` (new prop; see jobs/page.tsx) is the subset of
// JOBS_WIP_COLUMNS this viewer's role may pick from — a column like
// "Customer" is dropped before it ever reaches this component for a
// viewer lacking CUSTOMERS_VIEW. Defaults to every column so every other
// existing caller keeps working unchanged.
export function JobsWipColumnPicker({ selected, available }: { selected: JobsWipColumnId[]; available?: JobsWipColumnId[] }) {
  const router = useRouter();
  const availableSet = available ? new Set(available) : null;
  const pickableColumns = availableSet ? JOBS_WIP_COLUMNS.filter((col) => availableSet.has(col.id)) : JOBS_WIP_COLUMNS;
  const [open, setOpen] = useState(false);
  const [checked, setChecked] = useState<Set<JobsWipColumnId>>(new Set(selected));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function openPicker() {
    setChecked(new Set(selected));
    setError("");
    setOpen(true);
  }

  function toggle(id: JobsWipColumnId) {
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
      const response = await fetch("/api/v1/jobs/wip-columns", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ columns: Array.from(checked) }),
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
      const response = await fetch("/api/v1/jobs/wip-columns", { method: "DELETE" });
      if (!response.ok) throw new Error(await readErrorMessage(response, "Unable to reset your column choices."));
      const body = (await response.json()) as { columns: JobsWipColumnId[] };
      setChecked(new Set(body.columns));
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
                <p className="eyebrow">Jobs &amp; WIP</p>
                <h2>Columns</h2>
              </div>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close dialog">
                <X size={18} />
              </button>
            </header>
            <div style={{ overflow: "auto", padding: "4px 0 14px" }}>
              <p style={{ margin: "0 0 10px", fontSize: 11, color: "var(--ink-500)" }}>
                Choose which columns show on this list. Saved to your account, so it follows you to any device or browser.
              </p>
              {error && <div className="inline-error">{error}</div>}
              <div style={{ display: "grid", gap: 6 }}>
                {pickableColumns.map((col) => (
                  <label
                    key={col.id}
                    style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: col.locked ? "var(--ink-400)" : "var(--ink-700)" }}
                  >
                    <input
                      type="checkbox"
                      checked={col.locked ? true : checked.has(col.id)}
                      disabled={col.locked || saving}
                      onChange={() => toggle(col.id)}
                    />
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
                {saving ? "Saving…" : "Save"}
              </button>
            </footer>
          </aside>
        </div>
      )}
    </>
  );
}

"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { GripVertical, SlidersHorizontal, X } from "lucide-react";
import { JOBS_WIP_COLUMNS, moveWipColumn, normalizeJobsWipColumns, wipColumnLabel, type JobsWipColumnId } from "@/lib/jobs/wip-columns";

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
// 2026-10-27: columns can also be dragged into the order the user wants (see `shown` below).
//
// Saving PUTs the full ordered set to /api/v1/jobs/wip-columns (persisted
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
export function JobsWipColumnPicker({ selected, available, build }: { selected: JobsWipColumnId[]; available?: JobsWipColumnId[]; build?: string | null }) {
  const router = useRouter();
  const availableSet = available ? new Set(available) : null;
  const pickableColumns = availableSet ? JOBS_WIP_COLUMNS.filter((col) => availableSet.has(col.id)) : JOBS_WIP_COLUMNS;
  const [open, setOpen] = useState(false);
  // 2026-10-27, user request: "a user can drag and rearrange the columns as
  // they require". `shown` is the ordered list of columns on the table
  // (Job # first, always); everything else pickable sits in "Not shown".
  const pickableIds = new Set<JobsWipColumnId>(pickableColumns.map((col) => col.id));
  const lockedIds = new Set<JobsWipColumnId>(JOBS_WIP_COLUMNS.filter((col) => col.locked).map((col) => col.id));
  const startShown = () => normalizeJobsWipColumns(selected).filter((id) => pickableIds.has(id));
  const [shown, setShown] = useState<JobsWipColumnId[]>(startShown);
  const [dragId, setDragId] = useState<JobsWipColumnId | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const listRef = useRef<HTMLDivElement | null>(null);
  const hidden = pickableColumns.filter((col) => !shown.includes(col.id));

  function openPicker() {
    setShown(startShown());
    setError("");
    setOpen(true);
  }

  function toggle(id: JobsWipColumnId) {
    setShown((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  // Pointer-based drag (mouse and touch) from the grip handle. While the
  // pointer is captured, whichever row is under it swaps places with the
  // dragged one, and the list scrolls when the pointer nears its edge.
  function onHandleDown(e: React.PointerEvent<HTMLElement>, id: JobsWipColumnId) {
    if (saving) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragId(id);
  }

  function onHandleMove(e: React.PointerEvent<HTMLElement>) {
    if (!dragId) return;
    const box = listRef.current;
    if (box) {
      const rect = box.getBoundingClientRect();
      if (e.clientY < rect.top + 28) box.scrollTop -= 12;
      else if (e.clientY > rect.bottom - 28) box.scrollTop += 12;
    }
    const row = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>("[data-shown-row]");
    const overId = row?.dataset.shownRow as JobsWipColumnId | undefined;
    if (overId && overId !== dragId) setShown((prev) => moveWipColumn(prev, dragId, overId));
  }

  function onHandleUp() {
    setDragId(null);
  }

  // Keyboard alternative for the handle: focus it and press the up/down arrows.
  function onHandleKey(e: React.KeyboardEvent<HTMLElement>, id: JobsWipColumnId) {
    if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
    e.preventDefault();
    setShown((prev) => {
      const i = prev.indexOf(id);
      const target = prev[e.key === "ArrowUp" ? i - 1 : i + 1];
      return target ? moveWipColumn(prev, id, target) : prev;
    });
  }

  async function handleSave() {
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/v1/jobs/wip-columns", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ columns: shown }),
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
      setShown(normalizeJobsWipColumns(body.columns).filter((id) => pickableIds.has(id)));
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
            <div ref={listRef} style={{ overflow: "auto", padding: "4px 0 14px" }}>
              <p style={{ margin: "0 0 10px", fontSize: 11, color: "var(--ink-500)" }}>
                Tick the columns you want, then drag the handle beside a column to put it where you want it on the list. Saved to your account, so it follows you to any device or browser.
              </p>
              {error && <div className="inline-error">{error}</div>}
              <p style={{ margin: "0 0 6px", fontSize: 11, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--ink-500)" }}>
                On the list, left to right ({shown.length})
              </p>
              <div style={{ display: "grid", gap: 4 }}>
                {shown.map((id) => {
                  const locked = lockedIds.has(id);
                  const dragging = dragId === id;
                  return (
                    <div
                      key={id}
                      data-shown-row={locked ? undefined : id}
                      style={{
                        display: "flex", alignItems: "center", gap: 8, fontSize: 12, padding: "5px 6px", borderRadius: 8,
                        border: dragging ? "1px solid var(--gold-500)" : "1px solid transparent",
                        background: dragging ? "rgba(214,168,59,.16)" : "transparent",
                        color: locked ? "var(--ink-400)" : "var(--ink-700)",
                      }}
                    >
                      {locked ? (
                        <span style={{ width: 18, flex: "none" }} />
                      ) : (
                        <span
                          role="button"
                          tabIndex={0}
                          aria-label={`Drag to move ${wipColumnLabel(id, build)}, or press the up or down arrow`}
                          title="Drag to reorder"
                          onPointerDown={(e) => onHandleDown(e, id)}
                          onPointerMove={onHandleMove}
                          onPointerUp={onHandleUp}
                          onPointerCancel={onHandleUp}
                          onKeyDown={(e) => onHandleKey(e, id)}
                          style={{ display: "inline-flex", flex: "none", width: 18, cursor: dragging ? "grabbing" : "grab", color: "var(--ink-400)", touchAction: "none", userSelect: "none" }}
                        >
                          <GripVertical size={16} />
                        </span>
                      )}
                      <label style={{ display: "flex", flex: 1, alignItems: "center", gap: 8, cursor: locked ? "default" : "pointer" }}>
                        <input type="checkbox" checked disabled={locked || saving} onChange={() => toggle(id)} />
                        {wipColumnLabel(id, build)}
                        {locked && <em style={{ fontStyle: "normal", fontSize: 10 }}> (always shown, first)</em>}
                      </label>
                    </div>
                  );
                })}
              </div>
              {hidden.length > 0 && (
                <>
                  <p style={{ margin: "14px 0 6px", fontSize: 11, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--ink-500)" }}>
                    Not shown - tick to add to the end of the list
                  </p>
                  <div style={{ display: "grid", gap: 4 }}>
                    {hidden.map((col) => (
                      <label key={col.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, padding: "5px 6px 5px 32px", color: "var(--ink-700)", cursor: "pointer" }}>
                        <input type="checkbox" checked={false} disabled={saving} onChange={() => toggle(col.id)} />
                        {wipColumnLabel(col.id, build)}
                      </label>
                    ))}
                  </div>
                </>
              )}
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

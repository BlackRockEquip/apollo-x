"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Archive, Eye, Inbox, RotateCcw, X } from "lucide-react";
import type { DemoRequestRow, DemoRequestView } from "@/lib/platform/demo-requests-service";

// 2026-10-19 — list + view window for Platform > Demo Requests (see platform/demo-requests/page.tsx).
function when(iso: string) {
  return new Date(iso).toLocaleString("en-ZA", { dateStyle: "medium", timeStyle: "short" });
}

export function DemoRequestsWorkspace({ view, items, canEdit }: { view: DemoRequestView; items: DemoRequestRow[]; canEdit: boolean }) {
  const router = useRouter();
  const [openId, setOpenId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const open = items.find((item) => item.id === openId) ?? null;
  const target: DemoRequestView = view === "NEW" ? "HISTORY" : "NEW";

  async function move(id: string) {
    setBusyId(id);
    setError("");
    try {
      const response = await fetch(`/api/v1/platform/demo-requests/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: target }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error?.message || "Could not update this request.");
      setOpenId(null);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update this request.");
    } finally {
      setBusyId(null);
    }
  }

  const moveLabel = view === "NEW" ? "Move to history" : "Move back to New";
  const MoveIcon = view === "NEW" ? Archive : RotateCcw;

  return (
    <section className="detail-panel">
      {error ? <div className="inline-error">{error}</div> : null}
      <div className="data-table-wrap">
        <table className="data-table">
          <thead><tr><th>Received</th><th>Name</th><th>Company</th><th>Email</th><th>Business type</th>{view === "HISTORY" && <th>Moved to history</th>}<th></th></tr></thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td>{when(item.createdAt)}</td>
                <td><strong>{item.name}</strong></td>
                <td>{item.company || "—"}</td>
                <td><a href={`mailto:${item.email}`}>{item.email}</a></td>
                <td>{item.businessType || "—"}</td>
                {view === "HISTORY" && <td>{item.movedToHistoryAt ? `${when(item.movedToHistoryAt)}${item.movedToHistoryBy ? ` · ${item.movedToHistoryBy}` : ""}` : "—"}</td>}
                <td>
                  <button type="button" className="table-action" onClick={() => setOpenId(item.id)}><Eye size={13} /> View</button>
                  {canEdit && <button type="button" className="table-action" disabled={busyId === item.id} onClick={() => void move(item.id)}><MoveIcon size={13} /> {moveLabel}</button>}
                </td>
              </tr>
            ))}
            {items.length === 0 && <tr><td colSpan={view === "HISTORY" ? 7 : 6} className="table-state compact-empty-state"><Inbox size={16} /> {view === "NEW" ? "No new demo requests." : "Nothing in history yet."}</td></tr>}
          </tbody>
        </table>
      </div>

      {open && (
        <div className="drawer-backdrop" role="dialog" aria-modal="true" aria-label="Demo request">
          <aside className="form-drawer compact-dialog">
            <header><div><p className="eyebrow">Demo request</p><h2>{open.name}</h2></div><button type="button" onClick={() => setOpenId(null)} aria-label="Close"><X size={18} /></button></header>
            <dl className="platform-detail-list" style={{ padding: "12px 16px" }}>
              <div><dt>Received</dt><dd>{when(open.createdAt)}</dd></div>
              <div><dt>Company</dt><dd>{open.company || "—"}</dd></div>
              <div><dt>Email</dt><dd><a href={`mailto:${open.email}`}>{open.email}</a></dd></div>
              <div><dt>Phone</dt><dd>{open.phone ? <a href={`tel:${open.phone}`}>{open.phone}</a> : "—"}</dd></div>
              <div><dt>Business type</dt><dd>{open.businessType || "—"}</dd></div>
              <div><dt>Message</dt><dd style={{ whiteSpace: "pre-wrap" }}>{open.message || "—"}</dd></div>
              {open.status === "HISTORY" && <div><dt>Moved to history</dt><dd>{open.movedToHistoryAt ? `${when(open.movedToHistoryAt)}${open.movedToHistoryBy ? ` by ${open.movedToHistoryBy}` : ""}` : "—"}</dd></div>}
            </dl>
            <footer className="detail-actions">
              <a className="quiet-button" href={`mailto:${open.email}?subject=${encodeURIComponent("Your Flo X demo request")}`}>Reply by email</a>
              {canEdit && <button type="button" className="gold-button" disabled={busyId === open.id} onClick={() => void move(open.id)}>{moveLabel}</button>}
              <button type="button" className="quiet-button" onClick={() => setOpenId(null)}>Close</button>
            </footer>
          </aside>
        </div>
      )}
    </section>
  );
}

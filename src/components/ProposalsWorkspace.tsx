"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { FileText, Pencil, Trash2 } from "lucide-react";
import { PROPOSAL_STATUSES, PROPOSAL_STATUS_LABEL, formatMoney, type ProposalStatusValue } from "@/lib/proposals/model";
import type { ProposalRow } from "@/lib/proposals/service";

// 2026-10-21 — list for Platform > Proposals (see platform/proposals/page.tsx). The status can be changed right in the
// table; opening a row goes to the builder.
function when(iso: string) {
  return new Date(iso).toLocaleDateString("en-ZA", { dateStyle: "medium" });
}

export function ProposalsWorkspace({ items, canEdit }: { items: ProposalRow[]; canEdit: boolean }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function call(id: string, init: RequestInit) {
    setBusyId(id);
    setError("");
    try {
      const response = await fetch(`/api/v1/platform/proposals/${id}`, { ...init, headers: { "Content-Type": "application/json" } });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error?.message || "That did not work.");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That did not work.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="detail-panel">
      {error ? <div className="inline-error">{error}</div> : null}
      <div className="data-table-wrap">
        <table className="data-table">
          <thead><tr><th>Quote no.</th><th>Client</th><th>Contact</th><th>Created</th><th style={{ textAlign: "right" }}>Once-off (incl. VAT)</th><th style={{ textAlign: "right" }}>Monthly (incl. VAT)</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td><Link href={`/platform/proposals/${item.id}`}><strong>{item.number}</strong></Link></td>
                <td>{item.clientCompany}</td>
                <td>{item.contactName || "—"}</td>
                <td>{when(item.createdAt)}</td>
                <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>{formatMoney(item.onceOffTotal)}</td>
                <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>{formatMoney(item.monthlyTotal)}</td>
                <td>
                  {canEdit ? (
                    <select value={item.status} disabled={busyId === item.id} aria-label={`Status of ${item.number}`} onChange={(e) => void call(item.id, { method: "PATCH", body: JSON.stringify({ status: e.target.value as ProposalStatusValue }) })}>
                      {PROPOSAL_STATUSES.map((s) => <option key={s} value={s}>{PROPOSAL_STATUS_LABEL[s]}</option>)}
                    </select>
                  ) : PROPOSAL_STATUS_LABEL[item.status]}
                </td>
                <td style={{ whiteSpace: "nowrap" }}>
                  <Link className="table-action" href={`/platform/proposals/${item.id}`}><Pencil size={13} /> Open</Link>
                  {canEdit && (
                    <button type="button" className="table-action" disabled={busyId === item.id} onClick={() => { if (window.confirm(`Delete proposal ${item.number} for ${item.clientCompany}? This cannot be undone.`)) void call(item.id, { method: "DELETE" }); }}><Trash2 size={13} /> Delete</button>
                  )}
                </td>
              </tr>
            ))}
            {items.length === 0 && <tr><td colSpan={8} className="table-state compact-empty-state"><FileText size={16} /> No proposals here yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}

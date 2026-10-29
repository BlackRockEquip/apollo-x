"use client";

import { useState } from "react";
import { Pencil, Plus, Trash2, X } from "lucide-react";
import { StatusPill } from "@/components/StatusPill";
import { itemTag, summarizeItemStatuses } from "@/lib/jobs/item-model";
import { ItemsStatusBadge, itemsAreMixed } from "./ItemsStatusBadge";
import { blankDraft, draftToPayload, rowToDraft, type ItemDraft, type ItemRow } from "./item-draft";

// 2026-10-29, user request (Engineering): the job screen's item list. One job holds every item the customer sent in; each item is
// listed here with its own status and ETA, and can be moved, edited or removed on its own. The job's status follows the least
// advanced item (the job shows "Mixed" while they differ). Parts, outwork and specification reports are still job-wide.
type Props = {
  jobId: string;
  jobNumber: string | null | undefined;
  jobType: string;
  build: string | null | undefined;
  items: ItemRow[];
  steps: string[];
  statusLabels: Record<string, string>;
  staffEtaLabel: string;
  /** May this person change items (Jobs edit rights, not view-only, not the mechanic role)? */
  canEdit: boolean;
  /** The job is complete, closed or cancelled: items are read-only until it is reopened. */
  locked: boolean;
  confirm: (options: { message: string; tone?: "warning" | "danger" | "neutral"; confirmLabel?: string }) => Promise<boolean>;
  onChanged: () => Promise<void> | void;
  onError: (message: string) => void;
};

function fmtDate(value: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleDateString("en-ZA");
}

export function JobItemsPanel({ jobId, jobNumber, jobType, build, items, steps, statusLabels, staffEtaLabel, canEdit, locked, confirm, onChanged, onError }: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<ItemDraft | null>(null);
  const [adding, setAdding] = useState<ItemDraft | null>(null);

  const rollup = summarizeItemStatuses(items.map((item) => item.status), steps);
  const editable = canEdit && !locked;
  const base = `/api/v1/jobs/${jobId}/items`;

  async function call(key: string, url: string, init: RequestInit): Promise<boolean> {
    setBusy(key); onError("");
    try {
      const response = await fetch(url, { ...init, headers: { "content-type": "application/json" } });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error?.message || "Unable to save the item.");
      await onChanged();
      return true;
    } catch (error) {
      onError(error instanceof Error ? error.message : "Unable to save the item.");
      return false;
    } finally {
      setBusy(null);
    }
  }

  function startEdit(item: ItemRow) {
    setAdding(null);
    setEditing(item.id);
    setDraft(rowToDraft(item));
  }
  async function saveEdit(item: ItemRow) {
    if (!draft) return;
    const ok = await call(item.id, `${base}?itemId=${item.id}`, { method: "PATCH", body: JSON.stringify(draftToPayload(draft)) });
    if (ok) { setEditing(null); setDraft(null); }
  }
  async function moveItem(item: ItemRow, status: string) {
    if (status === item.status) return;
    await call(item.id, `${base}?itemId=${item.id}`, { method: "PATCH", body: JSON.stringify({ status }) });
  }
  async function removeItem(item: ItemRow) {
    const tag = itemTag(jobNumber, item.sequence);
    if (!(await confirm({ message: `Remove item ${tag}${item.component ? ` (${item.component})` : ""} from this job? This cannot be undone.`, tone: "warning", confirmLabel: "Remove item" }))) return;
    await call(item.id, `${base}?itemId=${item.id}`, { method: "DELETE" });
  }
  async function saveNew() {
    if (!adding) return;
    const ok = await call("new", base, { method: "POST", body: JSON.stringify(draftToPayload(adding)) });
    if (ok) setAdding(null);
  }

  const field = (target: ItemDraft, set: (next: ItemDraft) => void, key: keyof ItemDraft, label: string, extra?: { type?: string; wide?: boolean; placeholder?: string }) => (
    <label className={extra?.wide ? "ji-wide" : undefined}>
      <span>{label}</span>
      <input type={extra?.type ?? "text"} value={target[key]} placeholder={extra?.placeholder} onChange={(e) => set({ ...target, [key]: e.target.value })} />
    </label>
  );

  return (
    <section className="detail-panel full-row ji-card">
      <header className="ji-card-head">
        <div>
          <h2>Items on this job</h2>
          <p>Each item has its own status and ETA. The job follows the least advanced item.</p>
        </div>
        <div className="ji-head-right">
          {itemsAreMixed(items.map((item) => item.status))
            ? <ItemsStatusBadge statuses={items.map((item) => item.status)} jobType={jobType} build={build} />
            : rollup.status && <StatusPill status={rollup.status} build={build} />}
          <span className="ji-count">{items.length} {items.length === 1 ? "item" : "items"}</span>
        </div>
      </header>

      <ul className="ji-steps" aria-label="Where the items are">
        {steps.map((step) => {
          const count = rollup.counts.find((entry) => entry.status === step)?.count ?? 0;
          return (
            <li key={step} className={count > 0 ? "has" : undefined}>
              <b>{count}</b>
              <span>{statusLabels[step] ?? step}</span>
            </li>
          );
        })}
      </ul>

      <div className="ji-scroll">
        <table className="ji-table readonly">
          <thead>
            <tr>
              <th>Tag</th>
              <th>Component</th>
              <th>Component model</th>
              <th>Serial</th>
              <th>Machine</th>
              <th>Status</th>
              <th>ETA</th>
              <th>{staffEtaLabel}</th>
              {editable && <th className="ji-actions-col"><span className="ji-sr">Actions</span></th>}
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const tag = itemTag(jobNumber, item.sequence);
              const machine = [item.machineMake, item.machineModel].filter(Boolean).join(" ");
              const isEditing = editing === item.id && draft;
              return (
                <ItemRowView key={item.id} isEditing={!!isEditing} columns={editable ? 9 : 8}
                  main={(
                    <tr className={isEditing ? "ji-row open" : "ji-row"}>
                      <td><span className="ji-tag">{tag}</span></td>
                      <td>{item.component || "-"}{item.workRequested && <small className="ji-sub">{item.workRequested}</small>}</td>
                      <td>{item.componentModel || "-"}</td>
                      <td>{item.componentSerial || "-"}</td>
                      <td>{machine || "-"}</td>
                      <td>
                        {editable ? (
                          <select className="ji-status-select" value={item.status} disabled={busy === item.id} aria-label={`Status of ${tag}`} onChange={(e) => void moveItem(item, e.target.value)}>
                            {steps.map((step) => <option key={step} value={step}>{statusLabels[step] ?? step}</option>)}
                            <option value="CANCELLED">{statusLabels.CANCELLED ?? "Cancelled"}</option>
                          </select>
                        ) : <StatusPill status={item.status} build={build} />}
                      </td>
                      <td>{fmtDate(item.etaDate)}</td>
                      <td>{fmtDate(item.mechanicEtaDate)}</td>
                      {editable && (
                        <td className="ji-actions-col">
                          <button type="button" className="ji-icon" onClick={() => (isEditing ? (setEditing(null), setDraft(null)) : startEdit(item))} aria-label={`Edit ${tag}`} title="Edit item"><Pencil size={15} /></button>
                          <button type="button" className="ji-icon danger" onClick={() => void removeItem(item)} disabled={items.length <= 1 || busy === item.id} aria-label={`Remove ${tag}`} title={items.length <= 1 ? "A job needs at least one item" : "Remove item"}><Trash2 size={15} /></button>
                        </td>
                      )}
                    </tr>
                  )}
                  editor={isEditing && draft ? (
                    <div className="ji-more-grid">
                      {field(draft, setDraft, "component", "Component")}
                      {field(draft, setDraft, "componentModel", "Component model")}
                      {field(draft, setDraft, "componentSerial", "Component serial")}
                      {field(draft, setDraft, "componentPartNumber", "Part number")}
                      {field(draft, setDraft, "machineMake", "Machine make")}
                      {field(draft, setDraft, "machineModel", "Machine model")}
                      {field(draft, setDraft, "machineSerial", "Machine serial")}
                      {field(draft, setDraft, "plantNumber", "Plant number")}
                      {field(draft, setDraft, "machineHours", "Machine hours", { type: "number" })}
                      {field(draft, setDraft, "etaDate", "ETA date", { type: "date" })}
                      {field(draft, setDraft, "mechanicEtaDate", staffEtaLabel, { type: "date" })}
                      {field(draft, setDraft, "workRequested", "Work requested", { wide: true })}
                      {field(draft, setDraft, "conditionOnReceipt", "Condition on receipt", { wide: true })}
                      <div className="ji-wide ji-edit-actions">
                        <button type="button" className="gold-button" disabled={busy === item.id} onClick={() => void saveEdit(item)}>Save item</button>
                        <button type="button" className="quiet-button" onClick={() => { setEditing(null); setDraft(null); }}>Cancel</button>
                      </div>
                    </div>
                  ) : null}
                />
              );
            })}
          </tbody>
        </table>
      </div>

      {editable && (
        <div className="ji-foot">
          {adding ? (
            <div className="ji-add">
              <div className="ji-paste-head">
                <strong>Add an item to this job</strong>
                <button type="button" className="ji-icon" onClick={() => setAdding(null)} aria-label="Cancel adding an item"><X size={15} /></button>
              </div>
              <div className="ji-more-grid">
                {field(adding, setAdding, "component", "Component")}
                {field(adding, setAdding, "componentModel", "Component model")}
                {field(adding, setAdding, "componentSerial", "Component serial")}
                {field(adding, setAdding, "componentPartNumber", "Part number")}
                {field(adding, setAdding, "machineMake", "Machine make")}
                {field(adding, setAdding, "machineModel", "Machine model")}
                {field(adding, setAdding, "workRequested", "Work requested", { wide: true })}
                {field(adding, setAdding, "conditionOnReceipt", "Condition on receipt", { wide: true })}
              </div>
              <div className="ji-edit-actions">
                <button type="button" className="gold-button" disabled={busy === "new"} onClick={() => void saveNew()}>Add item</button>
                <button type="button" className="quiet-button" onClick={() => setAdding(null)}>Cancel</button>
              </div>
            </div>
          ) : (
            <button type="button" className="section-action-button" onClick={() => { setEditing(null); setDraft(null); setAdding(blankDraft()); }}><Plus size={14} /> Add item</button>
          )}
        </div>
      )}
    </section>
  );
}

// A table row plus, while it is being edited, a full-width editor row beneath it.
function ItemRowView({ main, editor, isEditing, columns }: { main: React.ReactNode; editor: React.ReactNode; isEditing: boolean; columns: number }) {
  return (
    <>
      {main}
      {isEditing && <tr className="ji-more"><td colSpan={columns}>{editor}</td></tr>}
    </>
  );
}

// 2026-10-29: an ordinary one-item Engineering job offers "Add another item" under its Machine / component card. The first extra
// item turns the job into a multi-item job: the machine / component details already on the job become item 1.
export function AddAnotherItem({ jobId, onChanged, onError }: { jobId: string; onChanged: () => Promise<void> | void; onError: (message: string) => void }) {
  const [draft, setDraft] = useState<ItemDraft | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!draft) return;
    setBusy(true); onError("");
    try {
      const response = await fetch(`/api/v1/jobs/${jobId}/items`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(draftToPayload(draft)) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error?.message || "Unable to add the item.");
      setDraft(null);
      await onChanged();
    } catch (error) {
      onError(error instanceof Error ? error.message : "Unable to add the item.");
    } finally {
      setBusy(false);
    }
  }

  const set = (key: keyof ItemDraft, label: string, wide?: boolean) => (
    <label className={wide ? "ji-wide" : undefined}><span>{label}</span><input value={draft?.[key] ?? ""} onChange={(e) => setDraft((current) => (current ? { ...current, [key]: e.target.value } : current))} /></label>
  );

  return (
    <section className="detail-panel full-row ji-card ji-starter">
      {draft ? (
        <>
          <header className="ji-card-head">
            <div><h2>Add another item</h2><p>The machine / component details above become item 1. The job then tracks each item on its own.</p></div>
            <button type="button" className="ji-icon" onClick={() => setDraft(null)} aria-label="Cancel adding an item"><X size={15} /></button>
          </header>
          <div className="ji-more-grid">
            {set("component", "Component")}
            {set("componentModel", "Component model")}
            {set("componentSerial", "Component serial")}
            {set("componentPartNumber", "Part number")}
            {set("machineMake", "Machine make")}
            {set("machineModel", "Machine model")}
            {set("workRequested", "Work requested", true)}
            {set("conditionOnReceipt", "Condition on receipt", true)}
          </div>
          <div className="ji-edit-actions">
            <button type="button" className="gold-button" disabled={busy} onClick={() => void save()}>Add item</button>
            <button type="button" className="quiet-button" onClick={() => setDraft(null)}>Cancel</button>
          </div>
        </>
      ) : (
        <div className="ji-starter-row">
          <p>Did the customer send more than one item? Add them to this same job.</p>
          <button type="button" className="section-action-button" onClick={() => setDraft(blankDraft())}><Plus size={14} /> Add another item</button>
        </div>
      )}
    </section>
  );
}

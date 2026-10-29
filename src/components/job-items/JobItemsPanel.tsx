"use client";

import { useState } from "react";
import { FileText, Pencil, Plus, Printer, Trash2, X } from "lucide-react";
import { StatusPill } from "@/components/StatusPill";
import { itemLinkSummary, itemLinkTotal, itemTag, summarizeItemStatuses, type ItemLinkCounts } from "@/lib/jobs/item-model";
import { ItemsStatusBadge, itemsAreMixed } from "./ItemsStatusBadge";
import { blankDraft, draftToPayload, rowToDraft, type ItemDraft, type ItemRow } from "./item-draft";

// 2026-10-29, user request (Engineering): the job screen's item list. One job holds every item the customer sent in; each item is
// listed here with its own status and ETA, and can be moved, edited or removed on its own. The job's status follows the least
// advanced item (the job shows "Mixed" while they differ). Click an item to select it: the Parts, Outwork, Photos, Files,
// Specifications and Activity tabs then show that item's records, and the status stepper in the header moves that item.
// An ordinary one-item job shows the same list with its single item (`virtual`); the first extra item turns it into a real
// multi-item job.
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
  /** Opens the delivery note for this job with the items to send out ticked. */
  onDeliveryNote?: () => void;
  /** Asks "are all documents uploaded?" before an item moves to ready-to-deliver or later; false = stay where it is. */
  confirmDocuments?: (status: string) => Promise<boolean>;
  /** What is tied to each item (parts, outwork, photos, files), by item id. */
  links?: Record<string, ItemLinkCounts>;
  /** The selected item's id ("" = every item). */
  selectedId?: string;
  onSelect?: (itemId: string) => void;
  /** Opens the Print job tags window. */
  onPrintTags?: () => void;
  /** The single item of an ordinary one-item job, built from the job's own fields: shown read-only; "Add item" makes it item 1. */
  virtual?: boolean;
};

function fmtDate(value: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleDateString("en-ZA");
}

export function JobItemsPanel({ jobId, jobNumber, jobType, build, items, steps, statusLabels, staffEtaLabel, canEdit, locked, confirm, onChanged, onError, onDeliveryNote, confirmDocuments, links, selectedId = "", onSelect, onPrintTags, virtual = false }: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<ItemDraft | null>(null);
  const [adding, setAdding] = useState<ItemDraft | null>(null);

  const rollup = summarizeItemStatuses(items.map((item) => item.status), steps);
  const editable = canEdit && !locked && !virtual;
  const canAdd = canEdit && !locked;
  const selected = virtual ? undefined : items.find((item) => item.id === selectedId);
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
    if (confirmDocuments && !(await confirmDocuments(status))) return;
    await call(item.id, `${base}?itemId=${item.id}`, { method: "PATCH", body: JSON.stringify({ status }) });
  }
  async function removeItem(item: ItemRow) {
    const tag = itemTag(jobNumber, item.sequence);
    const tied = itemLinkTotal(links?.[item.id]);
    const tiedNote = tied > 0 ? ` The ${tied} record${tied === 1 ? "" : "s"} tied to it (${itemLinkSummary(links?.[item.id])}) stay on the job, as whole-job records.` : "";
    if (!(await confirm({ message: `Remove item ${tag}${item.component ? ` (${item.component})` : ""} from this job? This cannot be undone.${tiedNote}`, tone: "warning", confirmLabel: "Remove item" }))) return;
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

  const selectedTag = selected ? itemTag(jobNumber, selected.sequence) : "";
  const selectedMachine = selected ? [selected.machineMake, selected.machineModel].filter(Boolean).join(" ") : "";
  const detail = (label: string, value: string | number | null | undefined) => (
    <div><dt>{label}</dt><dd>{value === null || value === undefined || value === "" ? "-" : value}</dd></div>
  );

  return (
    <>
    <section className="detail-panel full-row ji-card">
      <header className="ji-card-head">
        <div>
          <h2>Items on this job</h2>
          <p>{virtual ? "This job has one item. Add another if the customer sent more." : "Select an item to see its details, parts, outwork and history. The job follows the least advanced item."}</p>
        </div>
        <div className="ji-head-right">
          {itemsAreMixed(items.map((item) => item.status))
            ? <ItemsStatusBadge statuses={items.map((item) => item.status)} jobType={jobType} build={build} />
            : rollup.status && <StatusPill status={rollup.status} build={build} />}
          <span className="ji-count">{items.length} {items.length === 1 ? "item" : "items"}</span>
          {selected && onSelect && <button type="button" className="quiet-button" onClick={() => onSelect("")}>Show all items</button>}
          {onPrintTags && <button type="button" className="quiet-button" onClick={onPrintTags}><Printer size={13} /> Print tags</button>}
          {onDeliveryNote && <button type="button" className="quiet-button" onClick={onDeliveryNote}><FileText size={13} /> Delivery note</button>}
        </div>
      </header>

      <div className="ji-scroll">
        <table className="ji-table readonly">
          <thead>
            <tr>
              <th>Tag</th>
              <th>Component</th>
              <th>Machine</th>
              <th>Status</th>
              <th>ETA</th>
              <th>Linked</th>
              {editable && <th className="ji-actions-col"><span className="ji-sr">Actions</span></th>}
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const tag = itemTag(jobNumber, item.sequence);
              const machine = [item.machineMake, item.machineModel].filter(Boolean).join(" ");
              const isEditing = editing === item.id && draft;
              const isSelected = !virtual && selectedId === item.id;
              return (
                <ItemRowView key={item.id} isEditing={!!isEditing} columns={editable ? 7 : 6}
                  main={(
                    <tr className={`ji-row${isEditing ? " open" : ""}${isSelected ? " selected" : ""}${onSelect && !virtual ? " pickable" : ""}`} aria-selected={isSelected || undefined}
                      onClick={(event) => { if (!onSelect || virtual || (event.target as HTMLElement).closest("button, select, input, a")) return; onSelect(isSelected ? "" : item.id); }}>
                      <td><span className="ji-tag">{tag}</span></td>
                      <td>
                        {onSelect && !virtual
                          ? <button type="button" className="ji-pick" onClick={() => onSelect(isSelected ? "" : item.id)} aria-pressed={isSelected}><strong>{item.component || "-"}</strong></button>
                          : <strong>{item.component || "-"}</strong>}
                        <small className="ji-sub">{[item.componentModel, item.componentSerial ? `S/N ${item.componentSerial}` : ""].filter(Boolean).join(" · ") || "No model or serial"}</small>
                      </td>
                      <td>{machine || "-"}{item.plantNumber && <small className="ji-sub">Plant {item.plantNumber}</small>}</td>
                      <td>
                        {editable ? (
                          <select className="ji-status-select" value={item.status} disabled={busy === item.id} aria-label={`Status of ${tag}`} onChange={(e) => void moveItem(item, e.target.value)}>
                            {steps.map((step) => <option key={step} value={step}>{statusLabels[step] ?? step}</option>)}
                            <option value="CANCELLED">{statusLabels.CANCELLED ?? "Cancelled"}</option>
                          </select>
                        ) : <StatusPill status={item.status} build={build} />}
                      </td>
                      <td>{fmtDate(item.etaDate)}<small className="ji-sub">{staffEtaLabel} {fmtDate(item.mechanicEtaDate)}</small></td>
                      <td>{links?.[item.id] && itemLinkTotal(links[item.id]) > 0 ? <span className="ji-links-sub">{itemLinkSummary(links[item.id])}</span> : <span className="ji-none">-</span>}</td>
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

      {canAdd && (
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

    {selected && (
      <section className="detail-panel full-row ji-card ji-selected" aria-label={`Selected item ${selectedTag}`}>
        <header className="ji-card-head">
          <div>
            <h2>Details of {selectedTag}</h2>
            <p>The tabs below show only this item. Use the status steps above, or Change status, to move it.</p>
          </div>
          <div className="ji-head-right">
            {editable && <button type="button" className="quiet-button" onClick={() => startEdit(selected)}><Pencil size={13} /> Edit item</button>}
          </div>
        </header>
        <div className="ji-selected-body">
          <dl className="ji-dl">
            {detail("Component model", selected.componentModel)}
            {detail("Component serial", selected.componentSerial)}
            {detail("Part number", selected.componentPartNumber)}
            {detail("Machine", selectedMachine)}
            {detail("Machine serial", selected.machineSerial)}
            {detail("Plant number", selected.plantNumber)}
            {detail("Machine hours", selected.machineHours)}
            {detail(staffEtaLabel, fmtDate(selected.mechanicEtaDate))}
          </dl>
          <div className="ji-work">
            <span>Work requested</span>
            <p>{selected.workRequested || "-"}</p>
            <span>Condition on receipt</span>
            <p>{selected.conditionOnReceipt || "-"}</p>
            {links?.[selected.id] && itemLinkTotal(links[selected.id]) > 0 && <small className="ji-links-sub">On this item: {itemLinkSummary(links[selected.id])}</small>}
          </div>
        </div>
      </section>
    )}
    </>
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

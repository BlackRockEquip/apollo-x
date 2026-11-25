"use client";

import { useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, FileText, Pencil, Plus, Printer, Trash2, UserCog, X } from "lucide-react";
import { StatusPill } from "@/components/StatusPill";
import { NamedPicker, type NamedOption } from "@/components/NamedPicker";
import { itemEffectivePo, itemEffectiveType, itemLinkSummary, itemLinkTotal, itemMachinists, itemTag, machinistSummary, summarizeFlowItems, type ItemLinkCounts, type MachinistRefs } from "@/lib/jobs/item-model";
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
  /**
   * 2026-11-25, "multiple jobs within a job": the steps of each job type (an inside job follows the steps of the type it works as),
   * the type names, and the types a person may pick. `noun` is what an inside job is called: Engineering "item", other builds "job".
   */
  stepsForType: (type: string) => string[];
  typeLabels: Record<string, string>;
  typeOptions: Array<[string, string]>;
  noun?: "item" | "job";
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
  /**
   * 2026-10-29, user request: the item list sits ABOVE the item header and tabs, so it is on screen whatever tab is open. The selected
   * item's detail card belongs to the Details tab, so it is drawn into this element (a portal) when one is given.
   */
  selectedSlot?: HTMLElement | null;
  /**
   * 2026-10-30, user request: an item can have its own Machinist 'Assess' / 'Final' (a blank one follows the job's). The company's
   * machinists, the Engineering field names, and the job's own two machinists (what a blank item follows).
   */
  mechanics?: Array<{ id: string; label: string }>;
  machinistLabels?: { strip: string; build: string };
  jobMachinists?: MachinistRefs;
  /** Adds a machinist that is not in the list yet (typed in a picker); resolves with the new option. */
  onCreateMechanic?: (name: string) => Promise<NamedOption>;
  /**
   * 2026-11-25, tabbed layout: show the jobs as tabs (an Overview tab with one card per job, a tab for each job, and "Add job") instead of
   * a table. Used where an inside job is called a "job"; Engineering keeps its item table.
   */
  tabs?: boolean;
  /** The job's own customer PO: what an inside job with no PO of its own works under. */
  jobCustomerPo?: string | null;
};

// 2026-11-25: the colour of a job type on its tab and Overview card (field blue, repair gold, partial purple, sale green).
function typeColor(type: string): string {
  switch (type) {
    case "FIELD_SERVICE": return "#155fca";
    case "STANDARD_REPAIR": return "#d6a83b";
    case "PARTIAL_REPAIR": return "#8a6bd0";
    case "OUTRIGHT_SALE": return "#1d8f5a";
    default: return "#6b7689";
  }
}

function fmtDate(value: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleDateString("en-ZA");
}

export function JobItemsPanel({ jobId, jobNumber, jobType, build, items, stepsForType, typeLabels, typeOptions, noun = "item", statusLabels, staffEtaLabel, canEdit, locked, confirm, onChanged, onError, onDeliveryNote, confirmDocuments, links, selectedId = "", onSelect, onPrintTags, virtual = false, selectedSlot, mechanics = [], machinistLabels = { strip: "Machinist 'Assess'", build: "Machinist 'Final'" }, jobMachinists = {}, onCreateMechanic, tabs = false, jobCustomerPo = null }: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  // The id of the job just added, so the new job opens on its own tab (tabbed layout).
  const createdId = useRef<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<ItemDraft | null>(null);
  const [adding, setAdding] = useState<ItemDraft | null>(null);
  // The list can be folded away to give the tabs more room; it starts open.
  const [collapsed, setCollapsed] = useState(false);
  // "Reassign machinist" on the selected item: the two choices being made, before they are saved.
  const [reassign, setReassign] = useState<{ id: string; strip: string; build: string } | null>(null);
  const mechanicName = (id: string | null | undefined) => (id ? mechanics.find((m) => m.id === id)?.label ?? "" : "");
  const machinistsOf = (item: ItemRow) => {
    const m = itemMachinists(item, jobMachinists);
    return { ...m, stripName: mechanicName(m.strip), buildName: mechanicName(m.build) };
  };

  const typeOf = (item: ItemRow) => itemEffectiveType(item.type, jobType);
  const rollup = summarizeFlowItems(items.map((item) => ({ status: item.status, steps: stepsForType(typeOf(item)) })));
  const nouns = `${noun}s`;
  // Workshop (and other non-Engineering) jobs that are still one job show a slim "Add job" strip instead of the whole list.
  const compact = virtual && (noun === "job" || jobType === "FIELD_SERVICE");
  // More than one type among the inside jobs: the table shows each one's type.
  const typesDiffer = new Set(items.map(typeOf)).size > 1;
  // What "Add job" starts as: a different type from the job's, since that is the usual reason to add one.
  const typeValues = typeOptions.map(([value]) => value);
  const wanted = jobType === "FIELD_SERVICE" ? "STANDARD_REPAIR" : "FIELD_SERVICE";
  const otherType = typeValues.includes(wanted) ? wanted : (typeValues.find((value) => value !== jobType) ?? jobType);
  const editable = canEdit && !locked && !virtual;
  const canAdd = canEdit && !locked;
  const selected = virtual ? undefined : items.find((item) => item.id === selectedId);
  const base = `/api/v1/jobs/${jobId}/items`;
  // Tabbed layout (2026-11-25): only once there are real jobs; a single job keeps the slim "Add job" strip.
  const tabsMode = tabs && !virtual;
  const poOf = (item: ItemRow) => itemEffectivePo(item.customerPo, jobCustomerPo);
  const poPlaceholder = jobCustomerPo ? `Same as the job (${jobCustomerPo})` : "";

  async function call(key: string, url: string, init: RequestInit): Promise<boolean> {
    setBusy(key); onError("");
    try {
      const response = await fetch(url, { ...init, headers: { "content-type": "application/json" } });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error?.message || "Unable to save the item.");
      createdId.current = init.method === "POST" && typeof body?.id === "string" ? body.id : null;
      await onChanged();
      return true;
    } catch (error) {
      onError(error instanceof Error ? error.message : "Unable to save the item.");
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function saveReassign() {
    if (!reassign) return;
    const ok = await call(reassign.id, `${base}?itemId=${reassign.id}`, { method: "PATCH", body: JSON.stringify({ stripMechanicId: reassign.strip || null, buildMechanicId: reassign.build || null }) });
    if (ok) setReassign(null);
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
    if (!(await confirm({ message: `Remove ${noun} ${tag}${item.component ? ` (${item.component})` : ""} from this job? This cannot be undone.${tiedNote}`, tone: "warning", confirmLabel: `Remove ${noun}` }))) return;
    await call(item.id, `${base}?itemId=${item.id}`, { method: "DELETE" });
  }
  async function saveNew() {
    if (!adding) return;
    const ok = await call("new", base, { method: "POST", body: JSON.stringify(draftToPayload(adding)) });
    if (ok) {
      setAdding(null);
      // Tabbed layout: the job just added opens on its own tab.
      if (tabs && createdId.current) onSelect?.(createdId.current);
    }
  }

  const field = (target: ItemDraft, set: (next: ItemDraft) => void, key: keyof ItemDraft, label: string, extra?: { type?: string; wide?: boolean; placeholder?: string }) => (
    <label className={extra?.wide ? "ji-wide" : undefined}>
      <span>{label}</span>
      <input type={extra?.type ?? "text"} value={target[key]} placeholder={extra?.placeholder} onChange={(e) => set({ ...target, [key]: e.target.value })} />
    </label>
  );

  // The job type of an inside job. Changing it to a type with other steps puts the job back at that type's first step (said in the hint).
  const typeField = (target: ItemDraft, set: (next: ItemDraft) => void, current: string) => (
    <label>
      <span>Job type</span>
      <select value={target.type || current} onChange={(e) => set({ ...target, type: e.target.value })}>
        {typeOptions.map(([value, text]) => <option key={value} value={value}>{text}</option>)}
      </select>
    </label>
  );

  const selectedTag = selected ? itemTag(jobNumber, selected.sequence) : "";
  const selectedMachine = selected ? [selected.machineMake, selected.machineModel].filter(Boolean).join(" ") : "";
  const detail = (label: string, value: string | number | null | undefined) => (
    <div><dt>{label}</dt><dd>{value === null || value === undefined || value === "" ? "-" : value}</dd></div>
  );

  const selectedCard = selected ? (
      <section className="detail-panel full-row ji-card ji-selected" aria-label={`Selected item ${selectedTag}`}>
        <header className="ji-card-head">
          <div>
            <h2>Details of {selectedTag}{typesDiffer && selected && <span className="ji-type">{typeLabels[typeOf(selected)] ?? typeOf(selected)}</span>}</h2>
            <p>The tabs below show only this {noun}. Use the status steps above, or Change status, to move it.</p>
          </div>
          <div className="ji-head-right">
            {editable && mechanics.length > 0 && <button type="button" className="quiet-button" onClick={() => setReassign(reassign?.id === selected.id ? null : { id: selected.id, strip: selected.stripMechanicId ?? "", build: selected.buildMechanicId ?? "" })} aria-expanded={reassign?.id === selected.id}><UserCog size={13} /> Reassign machinist</button>}
            {editable && <button type="button" className="quiet-button" onClick={() => startEdit(selected)}><Pencil size={13} /> Edit {noun}</button>}
            {editable && tabsMode && <button type="button" className="quiet-button" disabled={items.length <= 1 || busy === selected.id} title={items.length <= 1 ? "A job needs at least one job inside it" : undefined} onClick={() => void removeItem(selected)}><Trash2 size={13} /> Remove {noun}</button>}
          </div>
        </header>
        <div className="ji-selected-body">
          <dl className="ji-dl">
            {detail("Customer PO", poOf(selected) ? `${poOf(selected)}${selected.customerPo ? "" : " (from the job)"}` : "")}
            {detail("Component model", selected.componentModel)}
            {detail("Component serial", selected.componentSerial)}
            {detail("Part number", selected.componentPartNumber)}
            {detail("Machine", selectedMachine)}
            {detail("Machine serial", selected.machineSerial)}
            {detail("Plant number", selected.plantNumber)}
            {detail("Machine hours", selected.machineHours)}
            {detail(staffEtaLabel, fmtDate(selected.mechanicEtaDate))}
            {(() => {
              const m = machinistsOf(selected);
              return (
                <>
                  {detail(machinistLabels.strip, m.stripName ? `${m.stripName}${m.stripInherited ? " (from the job)" : ""}` : "")}
                  {detail(machinistLabels.build, m.buildName ? `${m.buildName}${m.buildInherited ? " (from the job)" : ""}` : "")}
                </>
              );
            })()}
          </dl>
          <div className="ji-work">
            <span>Work requested</span>
            <p>{selected.workRequested || "-"}</p>
            <span>Condition on receipt</span>
            <p>{selected.conditionOnReceipt || "-"}</p>
            {links?.[selected.id] && itemLinkTotal(links[selected.id]) > 0 && <small className="ji-links-sub">On this item: {itemLinkSummary(links[selected.id])}</small>}
          </div>
        </div>
        {reassign && reassign.id === selected.id && (
          <div className="ji-reassign" role="group" aria-label={`Reassign the machinists of ${selectedTag}`}>
            <p>Who works on {selectedTag}? Pick a name, or type a new one to add it. Leave a box on &quot;Same as the job&quot; and the item follows the job&apos;s machinist{jobMachinists.stripMechanicId || jobMachinists.buildMechanicId ? ` (${machinistLabels.strip}: ${mechanicName(jobMachinists.stripMechanicId) || "-"}, ${machinistLabels.build}: ${mechanicName(jobMachinists.buildMechanicId) || "-"})` : ""}.</p>
            <label><span>{machinistLabels.strip}</span><NamedPicker value={reassign.strip} options={mechanics} emptyLabel="Same as the job" ariaLabel={machinistLabels.strip} onChange={(id) => setReassign({ ...reassign, strip: id })} onCreate={onCreateMechanic} /></label>
            <label><span>{machinistLabels.build}</span><NamedPicker value={reassign.build} options={mechanics} emptyLabel="Same as the job" ariaLabel={machinistLabels.build} onChange={(id) => setReassign({ ...reassign, build: id })} onCreate={onCreateMechanic} /></label>
            <div className="ji-edit-actions">
              <button type="button" className="gold-button" disabled={busy === selected.id} onClick={() => void saveReassign()}>Save machinists</button>
              <button type="button" className="quiet-button" onClick={() => setReassign(null)}>Cancel</button>
            </div>
          </div>
        )}
      </section>
  ) : null;

  const startAdd = () => { setEditing(null); setDraft(null); setAdding({ ...blankDraft(), type: otherType }); };
  const renderEditor = (item: ItemRow) => draft ? (
                    <div className="ji-more-grid">
                      {!virtual && typeField(draft, setDraft, typeOf(item))}
                      {field(draft, setDraft, "customerPo", "Customer PO", { placeholder: poPlaceholder })}
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
                      {!virtual && mechanics.length > 0 && (
                        <>
                          <label><span>{machinistLabels.strip}</span><NamedPicker value={draft.stripMechanicId} options={mechanics} emptyLabel="Same as the job" ariaLabel={machinistLabels.strip} onChange={(id) => setDraft({ ...draft, stripMechanicId: id })} onCreate={onCreateMechanic} /></label>
                          <label><span>{machinistLabels.build}</span><NamedPicker value={draft.buildMechanicId} options={mechanics} emptyLabel="Same as the job" ariaLabel={machinistLabels.build} onChange={(id) => setDraft({ ...draft, buildMechanicId: id })} onCreate={onCreateMechanic} /></label>
                        </>
                      )}
                      {field(draft, setDraft, "workRequested", "Work requested", { wide: true })}
                      {field(draft, setDraft, "conditionOnReceipt", "Condition on receipt", { wide: true })}
                      <div className="ji-wide ji-edit-actions">
                        <button type="button" className="gold-button" disabled={busy === item.id} onClick={() => void saveEdit(item)}>Save {noun}</button>
                        <button type="button" className="quiet-button" onClick={() => { setEditing(null); setDraft(null); }}>Cancel</button>
                      </div>
                    </div>
  ) : null;
  const renderAddForm = () => adding ? (
            <div className="ji-add">
              <div className="ji-paste-head">
                <strong>{noun === "job" ? "Add a job to this job" : "Add an item to this job"}</strong>
                <button type="button" className="ji-icon" onClick={() => setAdding(null)} aria-label={`Cancel adding ${noun === "job" ? "a job" : "an item"}`}><X size={15} /></button>
              </div>
              <div className="ji-more-grid">
                {typeField(adding, setAdding, otherType)}
                {field(adding, setAdding, "customerPo", "Customer PO", { placeholder: poPlaceholder })}
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
                <button type="button" className="gold-button" disabled={busy === "new"} onClick={() => void saveNew()}>{noun === "job" ? "Add job" : "Add item"}</button>
                <button type="button" className="quiet-button" onClick={() => setAdding(null)}>Cancel</button>
              </div>
            </div>
  ) : null;
  const addButton = (
    <button type="button" className="section-action-button" onClick={startAdd}><Plus size={14} /> {noun === "job" ? "Add job to this job" : "Add item"}</button>
  );

  // ---- Tabbed layout: Overview + a tab per job + Add job ----
  const editingItem = editing ? items.find((item) => item.id === editing) : undefined;
  const tabsView = (
    <section className="detail-panel full-row ji-card ji-tabs-card">
      <div className="ji-tabbar" role="tablist" aria-label={`${nouns} in this job`}>
        <button type="button" role="tab" aria-selected={!selected} className={`ji-tab ji-tab-overview${!selected ? " active" : ""}`} onClick={() => onSelect?.("")}>Overview</button>
        {items.map((item) => {
          const type = typeOf(item);
          const isSelected = selectedId === item.id;
          return (
            <button key={item.id} type="button" role="tab" aria-selected={isSelected} className={`ji-tab${isSelected ? " active" : ""}`} style={{ "--ji-tab-color": typeColor(type) } as CSSProperties} onClick={() => onSelect?.(item.id)}>
              <span className="ji-tab-dot" aria-hidden="true" />
              <span className="ji-tab-text"><b>{itemTag(jobNumber, item.sequence)}</b><small>{typeLabels[type] ?? type}</small></span>
              <StatusPill status={item.status} build={build} />
            </button>
          );
        })}
        {canAdd && <button type="button" className="ji-tab-add" onClick={startAdd}><Plus size={14} /> Add job</button>}
        <span className="ji-tabbar-spacer" />
        {onPrintTags && <button type="button" className="quiet-button" onClick={onPrintTags}><Printer size={13} /> Print tags</button>}
        {onDeliveryNote && <button type="button" className="quiet-button" onClick={onDeliveryNote}><FileText size={13} /> Delivery note</button>}
      </div>
      {adding && <div className="ji-tab-pane">{renderAddForm()}</div>}
      {editingItem && draft && (
        <div className="ji-tab-pane">
          <div className="ji-paste-head">
            <strong>Edit {itemTag(jobNumber, editingItem.sequence)}</strong>
            <button type="button" className="ji-icon" onClick={() => { setEditing(null); setDraft(null); }} aria-label="Close the editor"><X size={15} /></button>
          </div>
          {renderEditor(editingItem)}
        </div>
      )}
      {!selected && !adding && !editingItem && (
        <div className="ji-overview">
          {items.map((item) => {
            const type = typeOf(item);
            const tag = itemTag(jobNumber, item.sequence);
            const steps = stepsForType(type).filter((step) => step !== "TO_BE_COLLECTED");
            const position = item.status === "CANCELLED" ? -1 : Math.max(0, steps.indexOf(item.status === "WAITING_FOR_PARTS" ? "AWAIT_OUTWORK" : item.status));
            const m = machinistsOf(item);
            const people = machinistSummary(m.stripName, m.buildName);
            return (
              <article key={item.id} className="ji-ov-card" style={{ "--ji-tab-color": typeColor(type) } as CSSProperties}>
                <header><strong>{tag}</strong><span className="ji-type">{typeLabels[type] ?? type}</span></header>
                <div className="ji-ov-progress">
                  <div className="ji-ov-bar" aria-hidden="true">{steps.map((step, index) => <span key={step} className={index <= position ? "on" : ""} />)}</div>
                  <div className="ji-ov-status"><b>{statusLabels[item.status] ?? item.status}</b>{position >= 0 && <small>step {position + 1} of {steps.length}</small>}</div>
                </div>
                <dl className="ji-ov-facts">
                  <div><dt>Component</dt><dd>{item.component || "-"}</dd></div>
                  <div><dt>Customer PO</dt><dd>{poOf(item) || "-"}{poOf(item) && !item.customerPo && <small> (job&apos;s PO)</small>}</dd></div>
                  <div><dt>{staffEtaLabel}</dt><dd>{fmtDate(item.mechanicEtaDate ?? item.etaDate)}</dd></div>
                  <div><dt>People</dt><dd>{people || "-"}</dd></div>
                </dl>
                {links?.[item.id] && itemLinkTotal(links[item.id]) > 0 && <small className="ji-links-sub">{itemLinkSummary(links[item.id])}</small>}
                <div className="ji-ov-actions">
                  <button type="button" className="quiet-button" onClick={() => onSelect?.(item.id)}>Open {noun}</button>
                  {editable && (
                    <select className="ji-status-select" value={item.status} disabled={busy === item.id} aria-label={`Status of ${tag}`} onChange={(e) => void moveItem(item, e.target.value)}>
                      {stepsForType(type).map((step) => <option key={step} value={step}>{statusLabels[step] ?? step}</option>)}
                      <option value="CANCELLED">{statusLabels.CANCELLED ?? "Cancelled"}</option>
                    </select>
                  )}
                  {editable && <button type="button" className="ji-icon" onClick={() => startEdit(item)} aria-label={`Edit ${tag}`} title={`Edit ${noun}`}><Pencil size={15} /></button>}
                </div>
              </article>
            );
          })}
          {canAdd && <button type="button" className="ji-ov-add" onClick={startAdd}><Plus size={18} /> Add another {noun}</button>}
        </div>
      )}
    </section>
  );

  return (
    <>
    {tabsMode ? tabsView : (
    <section className="detail-panel full-row ji-card">
      <header className="ji-card-head">
        <div>
          <h2>{noun === "job" ? "Jobs in this job" : "Items on this job"}</h2>
          <p>{virtual
            ? (noun === "job" ? `This job is one ${typeLabels[jobType] ?? "job"}. Add another job to it, for example a field job and a repair, and each keeps its own steps.` : "This job has one item. Add another if the customer sent more.")
            : `Select ${noun === "job" ? "a job" : "an item"} to see its details, parts, outwork and history. The job follows the least advanced ${noun}.`}</p>
        </div>
        <div className="ji-head-right">
          {!compact && (itemsAreMixed(items.map((item) => item.status))
            ? <ItemsStatusBadge statuses={items.map((item) => item.status)} jobType={jobType} itemTypes={items.map((item) => item.type)} build={build} />
            : rollup.status && <StatusPill status={rollup.status} build={build} />)}
          {!compact && <span className="ji-count">{items.length} {items.length === 1 ? noun : nouns}</span>}
          {selected && onSelect && <button type="button" className="quiet-button" onClick={() => onSelect("")}>Show all {nouns}</button>}
          {onPrintTags && <button type="button" className="quiet-button" onClick={onPrintTags}><Printer size={13} /> Print tags</button>}
          {onDeliveryNote && <button type="button" className="quiet-button" onClick={onDeliveryNote}><FileText size={13} /> Delivery note</button>}
          {!compact && <button type="button" className={`quiet-button ji-fold${collapsed ? " is-closed" : ""}`} aria-expanded={!collapsed} onClick={() => setCollapsed((value) => !value)} title={collapsed ? "Show the item list" : "Hide the item list"}><ChevronDown size={14} /> {collapsed ? "Show list" : "Hide list"}</button>}
        </div>
      </header>

      {!collapsed && !compact && <div className="ji-scroll">
        <table className="ji-table readonly">
          <thead>
            <tr>
              <th>Tag</th>
              {typesDiffer && <th>Job type</th>}
              <th>Component</th>
              <th>Machine</th>
              <th>Status</th>
              <th>ETA</th>
              <th>Machinists</th>
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
                <ItemRowView key={item.id} isEditing={!!isEditing} columns={(editable ? 8 : 7) + (typesDiffer ? 1 : 0)}
                  main={(
                    <tr className={`ji-row${isEditing ? " open" : ""}${isSelected ? " selected" : ""}${onSelect && !virtual ? " pickable" : ""}`} aria-selected={isSelected || undefined}
                      onClick={(event) => { if (!onSelect || virtual || (event.target as HTMLElement).closest("button, select, input, a")) return; onSelect(isSelected ? "" : item.id); }}>
                      <td><span className="ji-tag">{tag}</span></td>
                      {typesDiffer && <td><span className="ji-type">{typeLabels[typeOf(item)] ?? typeOf(item)}</span></td>}
                      <td>
                        {onSelect && !virtual
                          ? <button type="button" className="ji-pick" onClick={() => onSelect(isSelected ? "" : item.id)} aria-pressed={isSelected}><strong>{item.component || "-"}</strong></button>
                          : <strong>{item.component || "-"}</strong>}
                        <small className="ji-sub">{[item.componentModel, item.componentSerial ? `S/N ${item.componentSerial}` : "", item.customerPo ? `PO ${item.customerPo}` : ""].filter(Boolean).join(" · ") || "No model or serial"}</small>
                      </td>
                      <td>{machine || "-"}{item.plantNumber && <small className="ji-sub">Plant {item.plantNumber}</small>}</td>
                      <td>
                        {editable ? (
                          <select className="ji-status-select" value={item.status} disabled={busy === item.id} aria-label={`Status of ${tag}`} onChange={(e) => void moveItem(item, e.target.value)}>
                            {stepsForType(typeOf(item)).map((step) => <option key={step} value={step}>{statusLabels[step] ?? step}</option>)}
                            <option value="CANCELLED">{statusLabels.CANCELLED ?? "Cancelled"}</option>
                          </select>
                        ) : <StatusPill status={item.status} build={build} />}
                      </td>
                      <td>{fmtDate(item.etaDate)}<small className="ji-sub">{staffEtaLabel} {fmtDate(item.mechanicEtaDate)}</small></td>
                      <td>{(() => {
                        const m = machinistsOf(item);
                        const text = machinistSummary(m.stripName, m.buildName);
                        if (!text) return <span className="ji-none">-</span>;
                        const own = !m.stripInherited || !m.buildInherited;
                        return <span className={own ? "ji-mach" : "ji-mach ji-inherit"} title={`${machinistLabels.strip}: ${m.stripName || "-"}${m.stripInherited ? " (from the job)" : ""}\n${machinistLabels.build}: ${m.buildName || "-"}${m.buildInherited ? " (from the job)" : ""}`}>{text}</span>;
                      })()}</td>
                      <td>{links?.[item.id] && itemLinkTotal(links[item.id]) > 0 ? <span className="ji-links-sub">{itemLinkSummary(links[item.id])}</span> : <span className="ji-none">-</span>}</td>
                      {editable && (
                        <td className="ji-actions-col">
                          <button type="button" className="ji-icon" onClick={() => (isEditing ? (setEditing(null), setDraft(null)) : startEdit(item))} aria-label={`Edit ${tag}`} title="Edit item"><Pencil size={15} /></button>
                          <button type="button" className="ji-icon danger" onClick={() => void removeItem(item)} disabled={items.length <= 1 || busy === item.id} aria-label={`Remove ${tag}`} title={items.length <= 1 ? "A job needs at least one item" : "Remove item"}><Trash2 size={15} /></button>
                        </td>
                      )}
                    </tr>
                  )}
                  editor={isEditing && draft ? renderEditor(item) : null}
                />
              );
            })}
          </tbody>
        </table>
      </div>}

      {canAdd && (!collapsed || compact) && (
        <div className="ji-foot">
          {adding ? renderAddForm() : addButton}
        </div>
      )}
    </section>)}

    {selectedCard && (selectedSlot ? createPortal(selectedCard, selectedSlot) : selectedCard)}
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

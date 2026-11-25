"use client";

import { useState, type CSSProperties } from "react";
import { ChevronDown, ChevronUp, ClipboardList, Copy, Plus, Trash2, X } from "lucide-react";
import { MAX_ITEMS_PER_JOB, parseItemsPaste } from "@/lib/jobs/item-model";
import { NamedPicker, type NamedOption } from "@/components/NamedPicker";
import { blankDraft, isBlankDraft, newItemKey, type ItemDraft } from "./item-draft";

// 2026-10-29, user request (Engineering): "Items received" on the New Job screen. A customer can send several items in together
// (e.g. Blackrock sends 5 items to Hi-Gear); every item is listed here and they are all saved on ONE job. Job-level details
// (customer, PO, dates, transport, notes) are entered once in the cards around this one.
type Props = {
  items: ItemDraft[];
  onChange: (items: ItemDraft[]) => void;
  disabled?: boolean;
  /** The Engineering wording for the staff ETA ("Machinist ETA"). */
  staffEtaLabel: string;
  /** 2026-10-30: the company's machinists and the field names ('Assess' / 'Final'); an item can have its own once there are several. */
  mechanics?: Array<{ id: string; label: string }>;
  machinistLabels?: { strip: string; build: string };
  /** Adds a machinist that is not in the list yet (typed in a picker); resolves with the new option. */
  onCreateMechanic?: (name: string) => Promise<NamedOption>;
  /**
   * 2026-11-25, "multiple jobs within a job": every row is one inside job with its own job type. `jobType` is the job's own type (what a
   * row with no type of its own works as; row 1 IS the job's type). `typeOptions` are the types the person may pick.
   */
  jobType?: string;
  typeOptions?: Array<[string, string]>;
  onJobTypeChange?: (type: string) => void;
  /** What a row is called: Engineering says "item", the other builds say "job". */
  noun?: "item" | "job";
  /** The whole job's PO (the "default"): a job with no PO of its own works under it. */
  jobCustomerPo?: string;
};

export function JobItemsEditor({ items, onChange, disabled, staffEtaLabel, mechanics = [], machinistLabels, onCreateMechanic, jobType = "", typeOptions, onJobTypeChange, noun = "item", jobCustomerPo = "" }: Props) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  // 2026-11-25, tabbed layout: the job whose tab is open (jobs, not items, get tabs).
  const [active, setActive] = useState(0);
  const [several, setSeveral] = useState(4);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [pasteMessage, setPasteMessage] = useState("");

  const room = MAX_ITEMS_PER_JOB - items.length;
  const filled = items.filter((item) => !isBlankDraft(item)).length;

  function patch(key: string, field: keyof ItemDraft, value: string) {
    onChange(items.map((item) => (item.key === key ? { ...item, [field]: value } : item)));
  }
  function toggle(key: string) {
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }
  function addOne() {
    if (room <= 0) return;
    onChange([...items, blankDraft()]);
    setActive(items.length);
  }
  function duplicate(key: string) {
    if (room <= 0) return;
    const index = items.findIndex((item) => item.key === key);
    if (index === -1) return;
    // A copy keeps what is the same across identical items; the serial and part number are specific to one item.
    const copy: ItemDraft = { ...items[index], key: newItemKey(), componentSerial: "", machineSerial: "" };
    onChange([...items.slice(0, index + 1), copy, ...items.slice(index + 1)]);
  }
  function remove(key: string) {
    const next = items.filter((item) => item.key !== key);
    onChange(next.length > 0 ? next : [blankDraft()]);
    setActive((current) => Math.max(0, Math.min(current, next.length - 1)));
  }
  // "Add several": N more rows that start as copies of item 1 (same component, model, machine and work), with no serials.
  function addSeveral() {
    const count = Math.max(1, Math.min(several, room));
    const first = items[0] ?? blankDraft();
    const copies = Array.from({ length: count }, (): ItemDraft => ({
      ...blankDraft(),
      type: first.type,
      customerPo: first.customerPo,
      component: first.component, componentModel: first.componentModel,
      machineMake: first.machineMake, machineModel: first.machineModel,
      workRequested: first.workRequested, conditionOnReceipt: first.conditionOnReceipt,
      etaDate: first.etaDate, mechanicEtaDate: first.mechanicEtaDate,
      stripMechanicId: first.stripMechanicId, buildMechanicId: first.buildMechanicId,
    }));
    onChange([...items, ...copies]);
  }
  function applyPaste() {
    const parsed = parseItemsPaste(pasteText);
    if (parsed.length === 0) { setPasteMessage("Nothing to add - paste one item per line, columns separated by tabs."); return; }
    const drafts = parsed.slice(0, Math.max(room, 0) + (items.length === 1 && isBlankDraft(items[0]) ? 1 : 0)).map((row): ItemDraft => ({ ...blankDraft(), ...row }));
    const base = items.length === 1 && isBlankDraft(items[0]) ? [] : items;
    onChange([...base, ...drafts]);
    setPasteText(""); setPasteMessage(""); setPasteOpen(false);
  }

  const tabsLayout = noun === "job" && !!typeOptions;
  const activeIndex = Math.min(active, items.length - 1);
  const current = items[activeIndex];
  const typeOfDraft = (item: ItemDraft, index: number) => (index === 0 ? jobType : item.type || jobType);
  const typeText = (value: string) => typeOptions?.find(([key]) => key === value)?.[1] ?? "";
  const typeColour = (value: string) => ({ FIELD_SERVICE: "#155fca", STANDARD_REPAIR: "#d6a83b", PARTIAL_REPAIR: "#8a6bd0", OUTRIGHT_SALE: "#1d8f5a" } as Record<string, string>)[value] ?? "#6b7689";
  const currentType = current ? typeOfDraft(current, activeIndex) : jobType;
  const input = (field: keyof ItemDraft, label: string, extra?: { type?: string; wide?: boolean; placeholder?: string }) => current ? (
    <label className={extra?.wide ? "ji-wide" : undefined}>
      <span>{label}</span>
      <input type={extra?.type ?? "text"} value={current[field]} placeholder={extra?.placeholder} onChange={(e) => patch(current.key, field, e.target.value)} />
    </label>
  ) : null;
  const tabsBody = !current ? null : (
    <>
      <div className="ji-tabbar" role="tablist" aria-label="Jobs on this job">
        {items.map((item, index) => {
          const type = typeOfDraft(item, index);
          const blank = isBlankDraft(item);
          return (
            <button key={item.key} type="button" role="tab" aria-selected={index === activeIndex} className={`ji-tab${index === activeIndex ? " active" : ""}`} style={{ "--ji-tab-color": typeColour(type) } as CSSProperties} onClick={() => setActive(index)}>
              <span className="ji-tab-dot" aria-hidden="true" />
              <span className="ji-tab-text"><b>Job {index + 1}</b><small>{typeText(type) || "Pick a type"}</small></span>
              <span className={`ji-tab-state ${blank ? "empty" : "ready"}`}>{blank ? "Empty" : "Ready"}</span>
            </button>
          );
        })}
        <button type="button" className="ji-tab-add" onClick={addOne} disabled={room <= 0}><Plus size={14} /> Add job</button>
      </div>
      <div className="ji-tab-pane">
        <div className="ji-tab-pane-head">
          <strong>Job {activeIndex + 1} will be</strong>
          <select value={currentType} aria-label={`Job ${activeIndex + 1} job type`} onChange={(e) => { if (activeIndex === 0) onJobTypeChange?.(e.target.value); else patch(current.key, "type", e.target.value); }}>
            {typeOptions?.map(([value, text]) => <option key={value} value={value}>{text}</option>)}
          </select>
          <span className="ji-tabbar-spacer" />
          <button type="button" className="quiet-button" onClick={() => duplicate(current.key)} disabled={room <= 0}><Copy size={13} /> Duplicate (serials cleared)</button>
          {items.length > 1 && <button type="button" className="quiet-button danger" onClick={() => remove(current.key)}><Trash2 size={13} /> Remove this job</button>}
        </div>
        <div className="ji-more-grid">
          {input("customerPo", "Customer PO", { placeholder: jobCustomerPo ? `Same as the job (${jobCustomerPo})` : "Optional" })}
          {input("component", "Component")}
          {input("componentModel", "Component model")}
          {input("componentSerial", "Component serial")}
          {input("componentPartNumber", "Part number")}
          {input("machineMake", "Machine make")}
          {input("machineModel", "Machine model")}
          {input("machineSerial", "Machine serial")}
          {input("plantNumber", "Plant number")}
          {input("machineHours", "Machine hours", { type: "number" })}
          {input("etaDate", "ETA date", { type: "date" })}
          {input("mechanicEtaDate", staffEtaLabel, { type: "date" })}
          {items.length >= 2 && mechanics.length > 0 && machinistLabels && (
            <>
              <label><span>{machinistLabels.strip}</span>
                <NamedPicker value={current.stripMechanicId} options={mechanics} emptyLabel="Same as the job" ariaLabel={machinistLabels.strip} onChange={(id) => patch(current.key, "stripMechanicId", id)} onCreate={onCreateMechanic} />
              </label>
              <label><span>{machinistLabels.build}</span>
                <NamedPicker value={current.buildMechanicId} options={mechanics} emptyLabel="Same as the job" ariaLabel={machinistLabels.build} onChange={(id) => patch(current.key, "buildMechanicId", id)} onCreate={onCreateMechanic} />
              </label>
            </>
          )}
          {input("workRequested", "Work requested", { wide: true })}
          {input("conditionOnReceipt", "Condition on receipt", { wide: true, placeholder: "e.g. Cracked housing, oil leak, arrived without end cap" })}
        </div>
      </div>
    </>
  );

  return (
    <section className={`detail-panel full-row ji-card${tabsLayout ? " ji-tabs-card" : ""}`}>
      <header className="ji-card-head">
        <div>
          <h2>{noun === "job" ? "Jobs in this job" : "Items received"}</h2>
          <p>{noun === "job" ? "One job number and customer, with a job for each piece of work. Pick a job type for each: it decides that job's steps and layout." : "One job, every item the customer brought in. Each item is tracked on its own from here on."}</p>
        </div>
        <span className="ji-count" aria-live="polite">{filled > 0 ? filled : items.length} {(filled > 0 ? filled : items.length) === 1 ? noun : `${noun}s`}</span>
      </header>
      {/* Enter inside a box must not submit the New Job form (the job would be created half way through typing the list). */}
      <fieldset disabled={disabled} className="unstyled-fieldset" onKeyDown={(e) => { if (e.key === "Enter" && (e.target as HTMLElement).tagName === "INPUT") e.preventDefault(); }}>
        {tabsLayout ? tabsBody : (
        <div className="ji-scroll">
          <table className="ji-table">
            <thead>
              <tr>
                <th className="ji-num">#</th>
                {typeOptions && <th>Job type</th>}
                <th>Component</th>
                <th>Component model</th>
                <th>Component serial</th>
                <th>Machine make</th>
                <th>Machine model</th>
                <th>Work requested</th>
                <th className="ji-actions-col"><span className="ji-sr">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, index) => {
                const isOpen = open.has(item.key);
                return (
                  <ItemRows key={item.key} item={item} index={index} isOpen={isOpen} staffEtaLabel={staffEtaLabel} canDuplicate={room > 0} noun={noun}
                    jobType={jobType} typeOptions={typeOptions} onJobTypeChange={onJobTypeChange}
                    mechanics={items.length >= 2 ? mechanics : []} machinistLabels={machinistLabels} onCreateMechanic={onCreateMechanic}
                    onPatch={(field, value) => patch(item.key, field, value)} onToggle={() => toggle(item.key)}
                    onDuplicate={() => duplicate(item.key)} onRemove={() => remove(item.key)} />
                );
              })}
            </tbody>
          </table>
        </div>
        )}
        <div className="ji-toolbar">
          <button type="button" className="section-action-button" onClick={addOne} disabled={room <= 0}><Plus size={14} /> {noun === "job" ? "Add another job" : "Add item"}</button>
          <span className="ji-several">
            <input type="number" min={1} max={Math.max(room, 1)} value={several} aria-label="How many more items" onChange={(e) => setSeveral(Number(e.target.value) || 1)} />
            <button type="button" className="quiet-button" onClick={addSeveral} disabled={room <= 0}><Copy size={13} /> Add {several} more like {noun} 1</button>
          </span>
          <button type="button" className="quiet-button" onClick={() => setPasteOpen((v) => !v)}><ClipboardList size={13} /> Paste from spreadsheet</button>
          {room <= 0 && <span className="ji-note">The most a job can hold is {MAX_ITEMS_PER_JOB} items.</span>}
        </div>
        {pasteOpen && (
          <div className="ji-paste">
            <div className="ji-paste-head">
              <strong>Paste a list</strong>
              <button type="button" className="ji-icon" onClick={() => setPasteOpen(false)} aria-label="Close paste box"><X size={15} /></button>
            </div>
            <p>One item per line. Columns, in this order, separated by tabs (copy straight out of Excel): Component, Component model, Component serial, Machine make, Machine model, Work requested.</p>
            <textarea rows={5} value={pasteText} onChange={(e) => setPasteText(e.target.value)} placeholder={"Final drive gearbox\tPC400-8\tSN-88213\tKomatsu\tPC400\tStrip, inspect, rebuild"} />
            {pasteMessage && <p className="ji-note">{pasteMessage}</p>}
            <div className="ji-paste-actions">
              <button type="button" className="gold-button" onClick={applyPaste} disabled={!pasteText.trim()}>Add to list</button>
              <button type="button" className="quiet-button" onClick={() => { setPasteOpen(false); setPasteText(""); setPasteMessage(""); }}>Cancel</button>
            </div>
          </div>
        )}
      </fieldset>
    </section>
  );
}

function ItemRows({ item, index, isOpen, staffEtaLabel, canDuplicate, noun, jobType, typeOptions, onJobTypeChange, mechanics, machinistLabels, onCreateMechanic, onPatch, onToggle, onDuplicate, onRemove }: {
  item: ItemDraft; index: number; isOpen: boolean; staffEtaLabel: string; canDuplicate: boolean; noun: "item" | "job";
  jobType: string; typeOptions?: Array<[string, string]>; onJobTypeChange?: (type: string) => void;
  mechanics: Array<{ id: string; label: string }>; machinistLabels?: { strip: string; build: string }; onCreateMechanic?: (name: string) => Promise<NamedOption>;
  onPatch: (field: keyof ItemDraft, value: string) => void; onToggle: () => void; onDuplicate: () => void; onRemove: () => void;
}) {
  const label = `${noun === "job" ? "Job" : "Item"} ${index + 1}`;
  // The row works as its own type, else the job's. Row 1 is the job itself, so changing it changes the job's type.
  const shownType = item.type || jobType;
  const cell = (field: keyof ItemDraft, name: string) => (
    <td><input value={item[field]} onChange={(e) => onPatch(field, e.target.value)} aria-label={`${label} ${name}`} /></td>
  );
  return (
    <>
      <tr className={isOpen ? "ji-row open" : "ji-row"}>
        <td className="ji-num"><span className="ji-badge">{index + 1}</span></td>
        {typeOptions && (
          <td>
            <select value={shownType} aria-label={`${label} job type`} onChange={(e) => { if (index === 0) onJobTypeChange?.(e.target.value); else onPatch("type", e.target.value); }}>
              {typeOptions.map(([value, text]) => <option key={value} value={value}>{text}</option>)}
            </select>
          </td>
        )}
        {cell("component", "component")}
        {cell("componentModel", "component model")}
        {cell("componentSerial", "component serial")}
        {cell("machineMake", "machine make")}
        {cell("machineModel", "machine model")}
        {cell("workRequested", "work requested")}
        <td className="ji-actions-col">
          <button type="button" className="ji-icon" onClick={onToggle} aria-expanded={isOpen} aria-label={isOpen ? `Hide more details for ${label}` : `More details for ${label}`} title="More details">{isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</button>
          <button type="button" className="ji-icon" onClick={onDuplicate} disabled={!canDuplicate} aria-label={`Duplicate ${label}`} title="Duplicate (serials cleared)"><Copy size={15} /></button>
          <button type="button" className="ji-icon danger" onClick={onRemove} aria-label={`Remove ${label}`} title="Remove"><Trash2 size={15} /></button>
        </td>
      </tr>
      {isOpen && (
        <tr className="ji-more">
          <td />
          <td colSpan={typeOptions ? 8 : 7}>
            <div className="ji-more-grid">
              <label><span>Customer PO</span><input value={item.customerPo} onChange={(e) => onPatch("customerPo", e.target.value)} placeholder="Same as the job" /></label>
              <label><span>Part number</span><input value={item.componentPartNumber} onChange={(e) => onPatch("componentPartNumber", e.target.value)} /></label>
              <label><span>Machine serial</span><input value={item.machineSerial} onChange={(e) => onPatch("machineSerial", e.target.value)} /></label>
              <label><span>Plant number</span><input value={item.plantNumber} onChange={(e) => onPatch("plantNumber", e.target.value)} /></label>
              <label><span>Machine hours</span><input type="number" min="0" step="0.01" value={item.machineHours} onChange={(e) => onPatch("machineHours", e.target.value)} /></label>
              <label><span>ETA date</span><input type="date" value={item.etaDate} onChange={(e) => onPatch("etaDate", e.target.value)} /></label>
              <label><span>{staffEtaLabel}</span><input type="date" value={item.mechanicEtaDate} onChange={(e) => onPatch("mechanicEtaDate", e.target.value)} /></label>
              {mechanics.length > 0 && machinistLabels && (
                <>
                  <label><span>{machinistLabels.strip}</span>
                    <NamedPicker value={item.stripMechanicId} options={mechanics} emptyLabel="Same as the job" ariaLabel={machinistLabels.strip} onChange={(id) => onPatch("stripMechanicId", id)} onCreate={onCreateMechanic} />
                  </label>
                  <label><span>{machinistLabels.build}</span>
                    <NamedPicker value={item.buildMechanicId} options={mechanics} emptyLabel="Same as the job" ariaLabel={machinistLabels.build} onChange={(id) => onPatch("buildMechanicId", id)} onCreate={onCreateMechanic} />
                  </label>
                </>
              )}
              <label className="ji-wide"><span>Condition on receipt</span><input value={item.conditionOnReceipt} onChange={(e) => onPatch("conditionOnReceipt", e.target.value)} placeholder="e.g. Cracked housing, oil leak, arrived without end cap" /></label>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

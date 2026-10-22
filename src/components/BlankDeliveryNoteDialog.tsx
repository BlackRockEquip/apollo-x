"use client";

import { useEffect, useState } from "react";
import type { FocusEvent } from "react";
import { Loader2, Plus, Search, X } from "lucide-react";
import { useTenantPermissions } from "@/components/AppShell";

// 2026-10-22, user request: Outwork page > "Blank Delivery Note" - "select a customer/supplier, fill in job number, capture PO
// Reference field, then the table of contents that is getting delivered as well as notes field, with signature fields. The PO
// Reference is not pulled from the job but an editable field the user must fill in."
// The dialog collects those, the server builds the PDF with the company letterhead (see lib/outwork/blank-delivery-note.ts) and
// it opens in a new tab to print or save. Nothing is stored.
type PartyKind = "CUSTOMER" | "SUPPLIER";
type PartyOption = { id: string; name: string };
type Line = { id: string; description: string; quantity: string };

const today = () => new Date().toISOString().slice(0, 10);
const newLine = (n: number): Line => ({ id: `line-${n}-${Date.now()}`, description: "", quantity: "1" });

export function BlankDeliveryNoteDialog({ onClose }: { onClose: () => void }) {
  const { tenantPermissions } = useTenantPermissions();
  const canCustomer = (tenantPermissions as ReadonlySet<string>).has("CUSTOMERS_VIEW");
  const canSupplier = (tenantPermissions as ReadonlySet<string>).has("SUPPLIERS_VIEW");
  const [kind, setKind] = useState<PartyKind>(canSupplier ? "SUPPLIER" : "CUSTOMER");
  const [partyQuery, setPartyQuery] = useState("");
  const [partyId, setPartyId] = useState("");
  const [options, setOptions] = useState<PartyOption[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [jobNumber, setJobNumber] = useState("");
  const [poReference, setPoReference] = useState("");
  const [deliveryDate, setDeliveryDate] = useState(today());
  const [lines, setLines] = useState<Line[]>([newLine(1)]);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!pickerOpen) { setOptions([]); return; }
    const q = partyQuery.trim();
    if (q.length < 2) { setOptions([]); return; }
    const timer = setTimeout(async () => {
      try {
        const r = await fetch(`/api/v1/master-data/${kind === "CUSTOMER" ? "customers" : "suppliers"}?q=${encodeURIComponent(q)}&status=active&pageSize=20`, { cache: "no-store" });
        const b = await r.json();
        setOptions(r.ok ? (b.items || []) : []);
      } catch { setOptions([]); }
    }, 200);
    return () => clearTimeout(timer);
  }, [partyQuery, pickerOpen, kind]);

  function closeUnlessWithin(close: () => void) {
    return (e: FocusEvent<HTMLElement>) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) close(); };
  }
  function switchKind(next: PartyKind) { setKind(next); setPartyId(""); setPartyQuery(""); setOptions([]); setPickerOpen(false); }
  function updateLine(id: string, field: "description" | "quantity", value: string) { setLines((rows) => rows.map((r) => (r.id === id ? { ...r, [field]: value } : r))); }
  function removeLine(id: string) { setLines((rows) => (rows.length > 1 ? rows.filter((r) => r.id !== id) : rows)); }

  async function create() {
    setError("");
    if (!partyId) { setError(`Pick a ${kind === "CUSTOMER" ? "customer" : "supplier"} from the list.`); return; }
    if (!jobNumber.trim()) { setError("Enter the job number."); return; }
    if (!poReference.trim()) { setError("Enter the PO reference."); return; }
    const items = lines.filter((l) => l.description.trim() || l.quantity.trim());
    if (!items.some((l) => l.description.trim())) { setError("Add at least one item being delivered."); return; }
    // Open the tab now (inside the click) so the pop-up blocker allows it; it is pointed at the PDF once that is ready.
    const win = window.open("", "_blank");
    setBusy(true);
    try {
      const r = await fetch("/api/v1/outwork/blank-delivery-note", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ partyKind: kind, partyId, jobNumber, poReference, deliveryDate, items: items.map((l) => ({ description: l.description, quantity: l.quantity })), notes }),
      });
      const b = await r.json();
      if (!r.ok) throw new Error(b.error?.message || "Couldn't create the delivery note.");
      const bytes = Uint8Array.from(atob(b.contentBase64), (c) => c.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
      if (win) win.location.href = url;
      else { const a = document.createElement("a"); a.href = url; a.download = b.fileName; a.click(); }
      setTimeout(() => URL.revokeObjectURL(url), 5 * 60 * 1000);
      onClose();
    } catch (e) {
      win?.close();
      setError(e instanceof Error ? e.message : "Couldn't create the delivery note.");
    } finally {
      setBusy(false);
    }
  }

  const word = kind === "CUSTOMER" ? "customer" : "supplier";
  return <div className="drawer-backdrop"><aside className="form-drawer wide-drawer" role="dialog" aria-modal="true">
    <header><div><p className="eyebrow">Outwork</p><h2>Blank Delivery Note</h2></div><button type="button" onClick={onClose} aria-label="Close"><X size={18} /></button></header>
    <div className="drawer-fields">
      {error && <div className="inline-error wide">{error}</div>}
      <label><span>Deliver to a</span>
        <select value={kind} onChange={(e) => switchKind(e.target.value as PartyKind)}>
          {canCustomer && <option value="CUSTOMER">Customer</option>}
          {canSupplier && <option value="SUPPLIER">Supplier</option>}
          {!canCustomer && !canSupplier && <option value="CUSTOMER">Customer</option>}
        </select>
      </label>
      <label className="party-selector" onBlur={closeUnlessWithin(() => setPickerOpen(false))}><span>{kind === "CUSTOMER" ? "Customer" : "Supplier"}</span>
        <div><Search size={15} /><input value={partyQuery} onChange={(e) => { setPartyQuery(e.target.value); setPartyId(""); setPickerOpen(true); }} onFocus={() => setPickerOpen(true)} placeholder={`Search active ${word}`} /></div>
        {pickerOpen && options.length > 0 && <div className="selector-results">{options.map((o) => (
          <button key={o.id} type="button" onClick={() => { setPartyId(o.id); setPartyQuery(o.name); setOptions([]); setPickerOpen(false); }}><strong>{o.name}</strong></button>
        ))}</div>}
      </label>
      <label><span>Job number</span><input value={jobNumber} onChange={(e) => setJobNumber(e.target.value)} placeholder="e.g. BRE1152" /></label>
      <label><span>PO reference</span><input value={poReference} onChange={(e) => setPoReference(e.target.value)} placeholder="Type the PO reference" /></label>
      <label><span>Delivery date</span><input type="date" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} /></label>
      {lines.map((line, i) => (
        <label key={line.id} className="wide"><span>{i === 0 ? "Items being delivered" : ""}</span>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input style={{ flex: 3 }} placeholder="Description" value={line.description} onChange={(e) => updateLine(line.id, "description", e.target.value)} />
            <input style={{ flex: 1 }} placeholder="Qty" value={line.quantity} onChange={(e) => updateLine(line.id, "quantity", e.target.value)} />
            {lines.length > 1 && <button type="button" className="quiet-button" aria-label="Remove item" onClick={() => removeLine(line.id)}><X size={14} /></button>}
          </div>
        </label>
      ))}
      <label><span>&nbsp;</span><button type="button" className="quiet-button" onClick={() => setLines((rows) => [...rows, newLine(rows.length + 1)])}><Plus size={14} /> Add another item</button></label>
      <label className="wide"><span>Notes</span><textarea rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
      <p className="muted small-line wide">The note is printed with Dispatched by / Received by name, signature and date fields. Nothing is saved on a job.</p>
    </div>
    <footer className="detail-actions">
      <button type="button" className="gold-button" disabled={busy} onClick={() => void create()}>{busy ? <Loader2 className="spin" size={14} /> : null} Print / PDF</button>
      <button type="button" className="quiet-button" onClick={onClose}>Cancel</button>
    </footer>
  </aside></div>;
}

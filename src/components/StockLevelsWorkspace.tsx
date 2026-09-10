"use client";

/* eslint-disable react-hooks/set-state-in-effect -- async list/option loading intentionally mirrors existing workspace patterns (MasterDataWorkspace, UsersWorkspace) */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Eye, Loader2, Plus, Search, Trash2, X } from "lucide-react";
import { STOCK_STATE_LABEL, STOCK_STATE_CLASS, type StockState } from "@/lib/inventory/stock-state";

// 2026-09-10 — Parts Catalog merged into Stock Levels at the user's request
// ("combine parts catalog to Stock levels... One page, Stock Levels only").
// This replaces the old server-rendered, read-only inventory/page.tsx with
// a client workspace (same pattern as MasterDataWorkspace/UsersWorkspace)
// so a part can be created, edited, and deleted without leaving this page,
// and so bin-location assignment (new this task) can offer "pick an
// existing location, create one inline, or leave blank" without a full
// page round-trip. Stock figures (on hand/reserved/available/state) still
// come from listInventoryPositions, now extended with the catalog fields
// and bin location (see src/lib/inventory/service.ts).

type PositionRow = {
  id: string;
  partNumber: string;
  description: string;
  manufacturerId: string | null;
  manufacturerName: string | null;
  manufacturerPartNumber: string | null;
  category: string | null;
  unitOfMeasure: string;
  notes: string | null;
  taxCodeId: string | null;
  taxCodeLabel: string | null;
  binLocationId: string | null;
  binLocationLabel: string | null;
  reorderMinimum: string | null;
  reorderMaximum: string | null;
  reorderQuantity: string | null;
  active: boolean;
  quantityOnHand: string;
  quantityReserved: string;
  quantityAvailable: string;
  stockState: string;
  locationCount: number;
  cost: string | null;
  sellingPrice: string | null;
};
type ListResponse = { items: PositionRow[]; total: number; page: number; pageSize: number };
type Option = { id: string; label: string };

type PartForm = {
  partNumber: string; description: string; manufacturerId: string; manufacturerPartNumber: string;
  category: string; unitOfMeasure: string; taxCodeId: string;
  defaultPurchaseCost: string; defaultSellingPrice: string;
  reorderMinimum: string; reorderMaximum: string; reorderQuantity: string;
  notes: string; active: boolean; binLocationId: string;
};
const NEW_BIN = "__new__";
const BLANK_FORM: PartForm = {
  partNumber: "", description: "", manufacturerId: "", manufacturerPartNumber: "",
  category: "", unitOfMeasure: "EA", taxCodeId: "",
  defaultPurchaseCost: "", defaultSellingPrice: "",
  reorderMinimum: "", reorderMaximum: "", reorderQuantity: "",
  notes: "", active: true, binLocationId: "",
};

export function StockLevelsWorkspace({ hasManage }: { hasManage: boolean }) {
  const [data, setData] = useState<ListResponse>({ items: [], total: 0, page: 1, pageSize: 25 });
  const [q, setQ] = useState("");
  const [stockState, setStockState] = useState("ALL");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [manufacturers, setManufacturers] = useState<Option[]>([]);
  const [taxCodes, setTaxCodes] = useState<Option[]>([]);
  const [locations, setLocations] = useState<Option[]>([]);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<PositionRow | null>(null);
  const [form, setForm] = useState<PartForm>(BLANK_FORM);
  const [newBinCode, setNewBinCode] = useState("");
  const [newBinName, setNewBinName] = useState("");
  const [saving, setSaving] = useState(false);
  const [rowBusy, setRowBusy] = useState<string | null>(null);
  const [deletingAll, setDeletingAll] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const params = new URLSearchParams({ q, stockState, page: String(page), pageSize: "25" });
      const response = await fetch(`/api/v1/inventory/positions?${params}`, { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message || "Unable to load stock levels.");
      setData(body);
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to load stock levels."); }
    finally { setLoading(false); }
  }, [q, stockState, page]);
  useEffect(() => { const t = setTimeout(load, 200); return () => clearTimeout(t); }, [load]);

  const loadOptions = useCallback(async () => {
    try {
      const [mfrRes, taxRes, locRes] = await Promise.all([
        fetch("/api/v1/master-data/manufacturers?status=active&pageSize=200", { cache: "no-store" }),
        fetch("/api/v1/master-data/tax-codes?status=active&pageSize=200", { cache: "no-store" }),
        fetch("/api/v1/master-data/storage-locations?status=active&pageSize=200", { cache: "no-store" }),
      ]);
      const [mfrBody, taxBody, locBody] = await Promise.all([mfrRes.json(), taxRes.json(), locRes.json()]);
      if (mfrRes.ok) setManufacturers((mfrBody.items || []).map((m: { id: string; name: string }) => ({ id: m.id, label: m.name })));
      if (taxRes.ok) setTaxCodes((taxBody.items || []).map((t: { id: string; code: string }) => ({ id: t.id, label: t.code })));
      if (locRes.ok) setLocations((locBody.items || []).map((l: { id: string; code: string; name: string }) => ({ id: l.id, label: `${l.name} (${l.code})` })));
    } catch {
      // Dropdown options are a convenience for picking existing records —
      // if they fail to load the form still works (bin location falls back
      // to "no location assigned" / "create new").
    }
  }, []);

  function openCreate() {
    setEditing(null); setForm(BLANK_FORM); setNewBinCode(""); setNewBinName(""); setError("");
    void loadOptions();
    setOpen(true);
  }
  function openEdit(row: PositionRow) {
    setEditing(row);
    setForm({
      partNumber: row.partNumber, description: row.description,
      manufacturerId: row.manufacturerId || "", manufacturerPartNumber: row.manufacturerPartNumber || "",
      category: row.category || "", unitOfMeasure: row.unitOfMeasure || "EA", taxCodeId: row.taxCodeId || "",
      defaultPurchaseCost: row.cost || "", defaultSellingPrice: row.sellingPrice || "",
      reorderMinimum: row.reorderMinimum || "", reorderMaximum: row.reorderMaximum || "", reorderQuantity: row.reorderQuantity || "",
      notes: row.notes || "", active: row.active, binLocationId: row.binLocationId || "",
    });
    setNewBinCode(""); setNewBinName(""); setError("");
    void loadOptions();
    setOpen(true);
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setSaving(true); setError("");
    try {
      let binLocationId: string | null = form.binLocationId === NEW_BIN ? null : (form.binLocationId || null);
      if (form.binLocationId === NEW_BIN) {
        if (!newBinCode.trim() || !newBinName.trim()) throw new Error("Enter a code and name for the new bin location, or pick an existing one / leave it blank.");
        const r = await fetch("/api/v1/master-data/storage-locations", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code: newBinCode.trim(), name: newBinName.trim(), type: "BIN", active: true }) });
        const body = await r.json();
        if (!r.ok) throw new Error(body.error?.message || "Unable to create the new bin location.");
        binLocationId = body.id as string;
      }
      const payload = {
        partNumber: form.partNumber, description: form.description,
        manufacturerId: form.manufacturerId || null, manufacturerPartNumber: form.manufacturerPartNumber || null,
        category: form.category || null, unitOfMeasure: form.unitOfMeasure || "EA", taxCodeId: form.taxCodeId || null,
        defaultPurchaseCost: form.defaultPurchaseCost || null, defaultSellingPrice: form.defaultSellingPrice || null,
        reorderMinimum: form.reorderMinimum || null, reorderMaximum: form.reorderMaximum || null, reorderQuantity: form.reorderQuantity || null,
        notes: form.notes || null, active: form.active, binLocationId,
      };
      const r = await fetch(`/api/v1/master-data/parts${editing ? `/${editing.id}` : ""}`, {
        method: editing ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error?.message || "Unable to save the part.");
      setOpen(false);
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to save the part."); }
    finally { setSaving(false); }
  }

  async function deleteRow(row: PositionRow) {
    if (!confirm(`Delete ${row.partNumber}? Parts with stock or job history can't actually be removed — those are kept as a historical reference instead, and you'll be told which happened.`)) return;
    setRowBusy(row.id); setError("");
    try {
      const r = await fetch(`/api/v1/master-data/parts/${row.id}`, { method: "DELETE" });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error?.message || "Unable to delete the part.");
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to delete the part."); }
    finally { setRowBusy(null); }
  }

  async function deleteAll() {
    if (!confirm(`Delete all ${data.total} part${data.total === 1 ? "" : "s"}? Parts with stock or job history can't actually be removed — those are kept as a historical reference instead.`)) return;
    setDeletingAll(true); setError("");
    try {
      const r = await fetch("/api/v1/master-data/parts", { method: "DELETE" });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error?.message || "Unable to delete all parts.");
      setPage(1);
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to delete all parts."); }
    finally { setDeletingAll(false); }
  }

  const pages = Math.max(1, Math.ceil(data.total / data.pageSize));

  return (
    <div>
      <div className="page-header compact">
        <div>
          <p className="eyebrow">Inventory</p>
          <h1>Stock Levels</h1>
          <p>Part catalog, bin locations, stock on hand, and recent movements — all in one place.</p>
        </div>
      </div>

      <section className="master-panel inventory-panel">
        <div className="master-toolbar inventory-toolbar">
          <label className="search-control inventory-search-control">
            <Search size={15} />
            <input type="text" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Search part number, description or manufacturer" />
          </label>
          <div className="stock-filters compact">
            {(["ALL", "OUT_OF_STOCK", "LOW_STOCK", "IN_STOCK"] as const).map((s) => (
              <label key={s}>
                <input type="radio" name="stockState" checked={stockState === s} onChange={() => { setStockState(s); setPage(1); }} />
                {s === "ALL" ? "All" : STOCK_STATE_LABEL[s as Exclude<StockState, "RESERVED" | "PARTIALLY_RESERVED" | "INACTIVE_PART">]}
              </label>
            ))}
          </div>
          <span>{data.total} item{data.total === 1 ? "" : "s"}</span>
          <button type="button" className="gold-button" onClick={openCreate}><Plus size={15} /> New Part</button>
          <button type="button" className="table-action danger" disabled={deletingAll || data.total === 0} onClick={() => void deleteAll()}>{deletingAll ? <Loader2 className="spin" size={14} /> : <Trash2 size={14} />} Delete all</button>
          {hasManage && (
            <button className="gold-button inventory-primary-action" type="button">
              <Plus size={16} /> Receive Stock
            </button>
          )}
        </div>

        {error ? <div className="inline-error">{error}</div> : null}

        <div className="data-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Part</th>
                <th>Description</th>
                <th>Manufacturer</th>
                <th>Category</th>
                <th>Bin location</th>
                <th className="numeric">On Hand</th>
                <th className="numeric">Reserved</th>
                <th className="numeric">Available</th>
                <th>State</th>
                <th className="actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={10} className="table-state compact-empty-state"><Loader2 className="spin" size={18} /> Loading…</td></tr>
              ) : data.items.length === 0 ? (
                <tr><td colSpan={10} className="table-state compact-empty-state"><span>No inventory items match the current filters.</span></td></tr>
              ) : data.items.map((row) => (
                <tr key={row.id} className={row.active ? "" : "inactive"}>
                  <td className="mono">{row.partNumber}</td>
                  <td>{row.description}</td>
                  <td>{row.manufacturerName || "—"}</td>
                  <td>{row.category || "—"}</td>
                  <td>{row.binLocationLabel || "—"}</td>
                  <td className="numeric">{row.quantityOnHand}</td>
                  <td className="numeric">{row.quantityReserved}</td>
                  <td className="numeric">{row.quantityAvailable}</td>
                  <td><span className={`state-badge ${STOCK_STATE_CLASS[row.stockState as StockState]}`}>{STOCK_STATE_LABEL[row.stockState as StockState]}</span></td>
                  <td className="actions">
                    <Link href={`/inventory/parts/${row.id}`} className="action-link" title="View part detail"><Eye size={15} /></Link>
                    <button type="button" className="table-action" onClick={() => openEdit(row)}>Edit</button>
                    <button type="button" className="table-action danger" disabled={rowBusy === row.id} onClick={() => void deleteRow(row)}>{rowBusy === row.id ? <Loader2 className="spin" size={14} /> : <Trash2 size={14} />}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <footer className="table-footer inventory-footer">
          <span>Showing {data.total === 0 ? 0 : (data.page - 1) * data.pageSize + 1}-{Math.min(data.page * data.pageSize, data.total)} of {data.total}</span>
          <div><button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Prev</button><button disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>Next</button></div>
        </footer>
      </section>

      {open && (
        <div className="drawer-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
          <aside className="form-drawer wide-drawer" aria-modal="true">
            <header><div><p className="eyebrow">Stock Levels</p><h2>{editing ? "Edit" : "New"} Part</h2></div><button aria-label="Close" onClick={() => setOpen(false)}><X size={18} /></button></header>
            <form onSubmit={submit}>
              <div className="drawer-fields">
                <label><span>Part number *</span><input required value={form.partNumber} onChange={(e) => setForm((f) => ({ ...f, partNumber: e.target.value }))} /></label>
                <label><span>Description *</span><input required value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} /></label>
                <label><span>Manufacturer</span>
                  <select value={form.manufacturerId} onChange={(e) => setForm((f) => ({ ...f, manufacturerId: e.target.value }))}>
                    <option value="">—</option>
                    {manufacturers.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
                  </select>
                </label>
                <label><span>Manufacturer part number</span><input value={form.manufacturerPartNumber} onChange={(e) => setForm((f) => ({ ...f, manufacturerPartNumber: e.target.value }))} /></label>
                <label><span>Category</span><input value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} /></label>
                <label><span>Unit of measure *</span><input required value={form.unitOfMeasure} onChange={(e) => setForm((f) => ({ ...f, unitOfMeasure: e.target.value }))} /></label>
                <label><span>Tax code</span>
                  <select value={form.taxCodeId} onChange={(e) => setForm((f) => ({ ...f, taxCodeId: e.target.value }))}>
                    <option value="">—</option>
                    {taxCodes.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                  </select>
                </label>
                <label><span>Default purchase cost</span><input type="number" step="0.0001" value={form.defaultPurchaseCost} onChange={(e) => setForm((f) => ({ ...f, defaultPurchaseCost: e.target.value }))} /></label>
                <label><span>Default selling price</span><input type="number" step="0.0001" value={form.defaultSellingPrice} onChange={(e) => setForm((f) => ({ ...f, defaultSellingPrice: e.target.value }))} /></label>
                <label><span>Reorder minimum</span><input type="number" step="0.0001" value={form.reorderMinimum} onChange={(e) => setForm((f) => ({ ...f, reorderMinimum: e.target.value }))} /></label>
                <label><span>Reorder maximum</span><input type="number" step="0.0001" value={form.reorderMaximum} onChange={(e) => setForm((f) => ({ ...f, reorderMaximum: e.target.value }))} /></label>
                <label><span>Reorder quantity</span><input type="number" step="0.0001" value={form.reorderQuantity} onChange={(e) => setForm((f) => ({ ...f, reorderQuantity: e.target.value }))} /></label>
                <label><span>Bin location</span>
                  <select value={form.binLocationId} onChange={(e) => setForm((f) => ({ ...f, binLocationId: e.target.value }))}>
                    <option value="">No location assigned</option>
                    {locations.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
                    <option value={NEW_BIN}>+ Create new bin location…</option>
                  </select>
                </label>
                {form.binLocationId === NEW_BIN && (
                  <>
                    <label><span>New location code *</span><input value={newBinCode} onChange={(e) => setNewBinCode(e.target.value)} placeholder="e.g. A1-03" /></label>
                    <label><span>New location name *</span><input value={newBinName} onChange={(e) => setNewBinName(e.target.value)} placeholder="e.g. Aisle 1 Bin 3" /></label>
                  </>
                )}
                <label className="wide"><span>Notes</span><textarea rows={3} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} /></label>
                <label><input type="checkbox" checked={form.active} onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))} /><span>Active</span></label>
              </div>
              <footer><button type="button" className="quiet-button" onClick={() => setOpen(false)}>Cancel</button><button className="gold-button" disabled={saving}>{saving ? <Loader2 className="spin" size={15} /> : null}{saving ? "Saving…" : "Save"}</button></footer>
            </form>
          </aside>
        </div>
      )}
    </div>
  );
}

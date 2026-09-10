"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Search } from "lucide-react";

type PartOption = { id: string; partNumber?: string | null; description?: string | null; unitOfMeasure?: string | null; active?: boolean };
type JobKitLine = { id: string; partId: string; quantityDefault: string; notes?: string | null; sortOrder: number; part: PartOption };
type JobKit = {
  id: string;
  name: string;
  description?: string | null;
  machineMake?: string | null;
  machineModel?: string | null;
  componentType?: string | null;
  active: boolean;
  lineCount?: number;
  totalQuantity?: string;
  lines?: JobKitLine[];
};

function text(value: unknown) { return value == null || value === "" ? "—" : String(value); }

export function JobKitsWorkspace() {
  const [kits, setKits] = useState<JobKit[]>([]);
  const [selectedKit, setSelectedKit] = useState<JobKit | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("active");
  const [partQuery, setPartQuery] = useState("");
  const [partOptions, setPartOptions] = useState<PartOption[]>([]);
  const [form, setForm] = useState({ name: "", description: "", machineMake: "", machineModel: "", componentType: "", active: true, partId: "", quantityDefault: "1", notes: "", sortOrder: "0" });
  const [editorOpen, setEditorOpen] = useState(false);

  const loadList = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const params = new URLSearchParams({ q: query, status, page: "1", pageSize: "50" });
      const response = await fetch(`/api/v1/job-kits?${params}`, { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message || "Unable to load job kits.");
      setKits(body.items || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load job kits.");
    } finally {
      setLoading(false);
    }
  }, [query, status]);

  async function openKit(id: string) {
    setEditorOpen(true);
    setSaving(true); setError("");
    try {
      const response = await fetch(`/api/v1/job-kits/${id}`, { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message || "Unable to load job kit.");
      setSelectedKit(body);
      setForm({ name: body.name || "", description: body.description || "", machineMake: body.machineMake || "", machineModel: body.machineModel || "", componentType: body.componentType || "", active: body.active !== false, partId: "", quantityDefault: "1", notes: "", sortOrder: String((body.lines?.length || 0)) });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load job kit.");
    } finally {
      setSaving(false);
    }
  }

  /* eslint-disable react-hooks/set-state-in-effect -- async loading/search synchronization intentionally mirrors existing workspace patterns */
  useEffect(() => { void loadList(); }, [loadList]);
  useEffect(() => {
    const q = partQuery.trim();
    if (q.length < 2) { setPartOptions([]); return; }
    const timer = setTimeout(async () => {
      const r = await fetch(`/api/v1/master-data/parts?q=${encodeURIComponent(q)}&status=active&pageSize=20`, { cache: "no-store" });
      const b = await r.json();
      setPartOptions((b.items || []).filter((item: PartOption) => item.active !== false));
    }, 200);
    return () => clearTimeout(timer);
  }, [partQuery]);

  const canSaveKit = form.name.trim().length >= 2;
  const lines = useMemo(() => selectedKit?.lines || [], [selectedKit]);

  async function saveKit() {
    setSaving(true); setError("");
    try {
      const payload = { name: form.name, description: form.description || null, machineMake: form.machineMake || null, machineModel: form.machineModel || null, componentType: form.componentType || null, active: form.active };
      const url = selectedKit ? `/api/v1/job-kits/${selectedKit.id}` : "/api/v1/job-kits";
      const method = selectedKit ? "PATCH" : "POST";
      const response = await fetch(url, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message || "Unable to save job kit.");
      await loadList();
      await openKit(body.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save job kit.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(active: boolean) {
    if (!selectedKit) return;
    setSaving(true); setError("");
    try {
      const response = await fetch(`/api/v1/job-kits/${selectedKit.id}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ active }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message || "Unable to update kit status.");
      await loadList();
      setSelectedKit(body);
      setForm((current) => ({ ...current, active: body.active !== false }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to update kit status.");
    } finally {
      setSaving(false);
    }
  }

  async function addLine() {
    if (!selectedKit || !form.partId) return;
    setSaving(true); setError("");
    try {
      const response = await fetch(`/api/v1/job-kits/${selectedKit.id}/lines`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ partId: form.partId, quantityDefault: form.quantityDefault, notes: form.notes || null, sortOrder: Number(form.sortOrder || 0) }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message || "Unable to add kit line.");
      setSelectedKit(body);
      setForm((current) => ({ ...current, partId: "", quantityDefault: "1", notes: "", sortOrder: String((body.lines?.length || 0)) }));
      setPartQuery("");
      await loadList();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to add kit line.");
    } finally {
      setSaving(false);
    }
  }

  async function updateLine(line: JobKitLine, patch: Partial<{ quantityDefault: string; notes: string | null; sortOrder: number }>) {
    if (!selectedKit) return;
    setSaving(true); setError("");
    try {
      const response = await fetch(`/api/v1/job-kits/${selectedKit.id}/lines/${line.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ partId: line.partId, quantityDefault: patch.quantityDefault ?? line.quantityDefault, notes: patch.notes ?? line.notes ?? null, sortOrder: patch.sortOrder ?? line.sortOrder }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message || "Unable to update kit line.");
      setSelectedKit(body);
      await loadList();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to update kit line.");
    } finally {
      setSaving(false);
    }
  }

  async function removeLine(lineId: string) {
    if (!selectedKit) return;
    setSaving(true); setError("");
    try {
      const response = await fetch(`/api/v1/job-kits/${selectedKit.id}/lines/${lineId}`, { method: "DELETE" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message || "Unable to remove kit line.");
      setSelectedKit(body);
      await loadList();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to remove kit line.");
    } finally {
      setSaving(false);
    }
  }

  return <div>
    <header className="page-header compact"><div><p className="eyebrow">Jobs</p><h1>Job Kits</h1><p>Reusable standard parts kits that add requirement lines to jobs without touching stock.</p></div></header>
    {error && <div className="inline-error">{error}</div>}
    <section className="master-panel">
      <div className="master-toolbar">
        <label className="search-control"><Search size={15} /><input aria-label="Search job kits" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search kit name, make, model or component" /></label>
        <select value={status} onChange={(e) => setStatus(e.target.value)}><option value="active">Active</option><option value="inactive">Inactive</option><option value="all">All statuses</option></select>
        <button type="button" className="gold-button" onClick={() => { setSelectedKit(null); setForm({ name: "", description: "", machineMake: "", machineModel: "", componentType: "", active: true, partId: "", quantityDefault: "1", notes: "", sortOrder: "0" }); setEditorOpen(true); }}><Plus size={15} /> New job kit</button>
      </div>
      {loading ? <div className="table-state"><Loader2 className="spin" size={20} /> Loading…</div> : <div className="data-table-wrap"><table className="data-table"><thead><tr><th>Kit</th><th>Applicability</th><th>Lines</th><th>Total Qty</th><th>Status</th><th></th></tr></thead><tbody>{kits.map((kit) => <tr key={kit.id}><td><strong>{kit.name}</strong><div className="muted small-line">{text(kit.description)}</div></td><td>{[kit.machineMake, kit.machineModel, kit.componentType].filter(Boolean).join(" · ") || "—"}</td><td>{kit.lineCount ?? kit.lines?.length ?? 0}</td><td>{text(kit.totalQuantity)}</td><td><span className={`status-pill ${kit.active ? "" : "neutral"}`}>{kit.active ? "Active" : "Inactive"}</span></td><td className="actions"><button type="button" className="table-action" onClick={() => void openKit(kit.id)}>Open</button></td></tr>)}{kits.length === 0 && <tr><td colSpan={6} className="table-state compact-empty-state">No job kits found.</td></tr>}</tbody></table></div>}
    </section>
    {editorOpen && <section className="detail-panel"><header><div><h2>{selectedKit ? "Edit job kit" : "Create job kit"}</h2><p>Business users select kits by name; lines stay tenant-scoped to active parts.</p></div><button type="button" className="quiet-button" onClick={() => setEditorOpen(false)}>Close editor</button></header><div className="drawer-fields"><label><span>Kit name *</span><input value={form.name} onChange={(e) => setForm((c) => ({ ...c, name: e.target.value }))} /></label><label><span>Machine make</span><input value={form.machineMake} onChange={(e) => setForm((c) => ({ ...c, machineMake: e.target.value }))} /></label><label><span>Machine model</span><input value={form.machineModel} onChange={(e) => setForm((c) => ({ ...c, machineModel: e.target.value }))} /></label><label><span>Component type</span><input value={form.componentType} onChange={(e) => setForm((c) => ({ ...c, componentType: e.target.value }))} /></label><label className="wide"><span>Description</span><textarea rows={4} value={form.description} onChange={(e) => setForm((c) => ({ ...c, description: e.target.value }))} /></label></div><footer className="detail-actions"><button type="button" className="quiet-button" disabled={saving || !selectedKit} onClick={() => void toggleActive(!(selectedKit?.active ?? true))}>{selectedKit?.active ? "Deactivate" : "Reactivate"}</button><button type="button" className="gold-button" disabled={saving || !canSaveKit} onClick={() => void saveKit()}>{saving ? "Saving…" : "Save job kit"}</button></footer></section>}
    {editorOpen && <section className="detail-panel"><header><div><h2>Kit lines</h2><p>Add commonly required parts without reserving or issuing stock.</p></div></header>{selectedKit ? <><div className="drawer-fields"><label className="wide party-selector"><span>Part</span><div><Search size={15} /><input value={partQuery} onChange={(e) => { setPartQuery(e.target.value); setForm((c) => ({ ...c, partId: "" })); }} placeholder="Search part number or description" /></div>{partOptions.length > 0 && <div className="selector-results">{partOptions.map((part) => <button key={part.id} type="button" onClick={() => { setForm((c) => ({ ...c, partId: part.id })); setPartQuery(`${part.partNumber || ""} · ${part.description || ""}`); setPartOptions([]); }}>{part.partNumber} · {part.description}</button>)}</div>}</label><label><span>Quantity</span><input type="number" min="0.0001" step="0.0001" value={form.quantityDefault} onChange={(e) => setForm((c) => ({ ...c, quantityDefault: e.target.value }))} /></label><label><span>Sort order</span><input type="number" min="0" step="1" value={form.sortOrder} onChange={(e) => setForm((c) => ({ ...c, sortOrder: e.target.value }))} /></label><label className="wide"><span>Notes</span><textarea rows={3} value={form.notes} onChange={(e) => setForm((c) => ({ ...c, notes: e.target.value }))} /></label></div><footer className="detail-actions"><button type="button" className="quiet-button" disabled={saving || !form.partId} onClick={() => void addLine()}>Add kit line</button></footer><div className="data-table-wrap"><table className="data-table"><thead><tr><th>Part</th><th>Description</th><th>Qty</th><th>Notes</th><th>Order</th><th></th></tr></thead><tbody>{lines.map((line) => <tr key={line.id}><td className="mono">{line.part.partNumber}</td><td>{line.part.description}</td><td><input type="number" min="0.0001" step="0.0001" defaultValue={line.quantityDefault} onBlur={(e) => { const next = e.target.value; if (next !== line.quantityDefault) void updateLine(line, { quantityDefault: next }); }} /></td><td><input defaultValue={line.notes || ""} onBlur={(e) => { const next = e.target.value; if (next !== (line.notes || "")) void updateLine(line, { notes: next || null }); }} /></td><td><input type="number" min="0" step="1" defaultValue={String(line.sortOrder)} onBlur={(e) => { const next = Number(e.target.value); if (next !== line.sortOrder) void updateLine(line, { sortOrder: next }); }} /></td><td className="actions"><button type="button" className="table-action" onClick={() => void removeLine(line.id)}>Remove</button></td></tr>)}{lines.length === 0 && <tr><td colSpan={6} className="table-state compact-empty-state">This job kit does not have any lines yet.</td></tr>}</tbody></table></div></> : <div className="table-state compact-empty-state">Save or open a job kit to manage its lines.</div>}</section>}
  </div>;
}
/* eslint-enable react-hooks/set-state-in-effect */
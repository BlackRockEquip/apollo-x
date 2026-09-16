"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { FileText, Loader2, Plus, Search } from "lucide-react";
import { readListState, writeListState } from "./list-state";
import { ScrollRestore } from "./ScrollRestore";

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
type KitLinesImportResult = { addedCount: number; incrementedCount: number; skipped: Array<{ partNumber: string; reason: string }> };

function text(value: unknown) { return value == null || value === "" ? "—" : String(value); }

export function JobKitsWorkspace() {
  const [kits, setKits] = useState<JobKit[]>([]);
  const [selectedKit, setSelectedKit] = useState<JobKit | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  // 2026-09-15, user request: "Back button to take you back to where you
  // last were." Restored from sessionStorage (see list-state.ts) so opening
  // a kit and then clicking the browser's own Back button doesn't dump you
  // back on an unfiltered list.
  const [query, setQuery] = useState(() => readListState("job-kits", { query: "", status: "active" }).query);
  const [status, setStatus] = useState(() => readListState("job-kits", { query: "", status: "active" }).status);
  const [partQuery, setPartQuery] = useState("");
  const [partOptions, setPartOptions] = useState<PartOption[]>([]);
  const [form, setForm] = useState({ name: "", description: "", machineMake: "", machineModel: "", componentType: "", active: true, partId: "", quantityDefault: "1", notes: "", sortOrder: "0" });
  const [editorOpen, setEditorOpen] = useState(false);
  // 2026-09-15, user request: "when adding a kit, make it that you can add a
  // part list/import a list that gets saved in table form for that specific
  // kit." Mirrors JobWorkspace's own "Add parts to Job" paste box + file
  // import, just posting to the job-kit's own lines endpoint instead — see
  // that endpoint's own comment for why bulk add shares the single-line
  // add's route rather than a new nested one.
  const [bulkKitLines, setBulkKitLines] = useState("");
  const [kitLinesImportFile, setKitLinesImportFile] = useState<File | null>(null);
  const [importSummary, setImportSummary] = useState<KitLinesImportResult | null>(null);

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
  useEffect(() => { writeListState("job-kits", { query, status }); }, [query, status]);

  async function openKit(id: string) {
    setEditorOpen(true);
    setSaving(true); setError(""); setImportSummary(null); setBulkKitLines(""); setKitLinesImportFile(null);
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

  function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = String(reader.result || "");
        const comma = result.indexOf(",");
        resolve(comma >= 0 ? result.slice(comma + 1) : result);
      };
      reader.onerror = () => reject(reader.error || new Error("Unable to read file."));
      reader.readAsDataURL(file);
    });
  }

  async function addKitLinesFromPaste() {
    if (!selectedKit || !bulkKitLines.trim()) return;
    setSaving(true); setError(""); setImportSummary(null);
    try {
      const response = await fetch(`/api/v1/job-kits/${selectedKit.id}/lines`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ bulkLines: bulkKitLines }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message || "Unable to add kit lines.");
      setSelectedKit(body);
      setImportSummary(body.importResult || null);
      setBulkKitLines("");
      await loadList();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to add kit lines.");
    } finally {
      setSaving(false);
    }
  }

  async function importKitLinesFile(file: File) {
    if (!selectedKit) return;
    setSaving(true); setError(""); setImportSummary(null);
    try {
      const contentBase64 = await fileToBase64(file);
      const response = await fetch(`/api/v1/job-kits/${selectedKit.id}/lines`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ fileName: file.name, mimeType: file.type || "application/octet-stream", contentBase64 }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message || "Unable to import kit lines file.");
      setSelectedKit(body);
      setImportSummary(body.importResult || null);
      setKitLinesImportFile(null);
      await loadList();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to import kit lines file.");
    } finally {
      setSaving(false);
    }
  }

  // Matches JobWorkspace's downloadPartsTemplate — a static client-side CSV,
  // no network round trip needed. No description column here (kit lines
  // don't have one — the part's own catalog description is shown instead).
  function downloadKitLinesTemplate() {
    const csv = "Part number,Qty\nPN-1001,2\nPN-2044,4\n";
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "job-kit-parts-template.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
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
      {/* 2026-09-15, user request: "Back button to take you back to where
          you last were." Only mounted once the list has actually rendered
          — see ScrollRestore's own comment for why. */}
      {!loading && <ScrollRestore selector=".master-panel .data-table-wrap" storageKey="job-kits" />}
    </section>
    {editorOpen && <section className="detail-panel"><header><div><h2>{selectedKit ? "Edit job kit" : "Create job kit"}</h2><p>Business users select kits by name; lines stay tenant-scoped to active parts.</p></div><button type="button" className="quiet-button" onClick={() => setEditorOpen(false)}>Close editor</button></header><div className="drawer-fields"><label><span>Kit name *</span><input value={form.name} onChange={(e) => setForm((c) => ({ ...c, name: e.target.value }))} /></label><label><span>Machine make</span><input value={form.machineMake} onChange={(e) => setForm((c) => ({ ...c, machineMake: e.target.value }))} /></label><label><span>Machine model</span><input value={form.machineModel} onChange={(e) => setForm((c) => ({ ...c, machineModel: e.target.value }))} /></label><label><span>Component type</span><input value={form.componentType} onChange={(e) => setForm((c) => ({ ...c, componentType: e.target.value }))} /></label><label className="wide"><span>Description</span><textarea rows={4} value={form.description} onChange={(e) => setForm((c) => ({ ...c, description: e.target.value }))} /></label></div><footer className="detail-actions"><button type="button" className="quiet-button" disabled={saving || !selectedKit} onClick={() => void toggleActive(!(selectedKit?.active ?? true))}>{selectedKit?.active ? "Deactivate" : "Reactivate"}</button><button type="button" className="gold-button" disabled={saving || !canSaveKit} onClick={() => void saveKit()}>{saving ? "Saving…" : "Save job kit"}</button></footer></section>}
    {editorOpen && <section className="detail-panel"><header><div><h2>Kit lines</h2><p>Add commonly required parts without reserving or issuing stock.</p></div></header>{selectedKit ? <>
      {/* 2026-09-15, user request: "when adding a kit, make it that you can
          add a part list/import a list that gets saved in table form for
          that specific kit." Mirrors the Job Parts list's own paste box +
          file import, above the existing one-at-a-time "Part" form below. */}
      <div className="drawer-fields">
        <label className="wide"><span>Paste parts list (one per line — part number required, quantity optional and defaults to 1: &quot;PN-1001, 2&quot;)</span><textarea rows={4} value={bulkKitLines} onChange={(e) => setBulkKitLines(e.target.value)} placeholder={"PN-1001, 2\nPN-2044, 4"} /></label>
        <label className="wide">
          <span>Or import a parts list file (.xlsx, .xls or .csv — needs Part number / Qty columns)</span>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input type="file" accept=".csv,.xls,.xlsx,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(e) => setKitLinesImportFile(e.target.files?.[0] || null)} />
            <button type="button" className="quiet-button" disabled={saving || !kitLinesImportFile} onClick={() => kitLinesImportFile && void importKitLinesFile(kitLinesImportFile)}>Import</button>
            <button type="button" className="quiet-button" title="Download a blank parts-list template" aria-label="Download parts-list template" onClick={downloadKitLinesTemplate}><FileText size={15} /></button>
          </div>
        </label>
      </div>
      <footer className="detail-actions"><button type="button" className="quiet-button" disabled={saving || !bulkKitLines.trim()} onClick={() => void addKitLinesFromPaste()}><Plus size={15} /> Add pasted lines to kit</button></footer>
      {importSummary && (importSummary.addedCount > 0 || importSummary.incrementedCount > 0 || importSummary.skipped.length > 0) && (
        <div className={importSummary.skipped.length > 0 ? "inline-error" : "inline-success"}>
          Added {importSummary.addedCount} new line{importSummary.addedCount === 1 ? "" : "s"}, increased quantity on {importSummary.incrementedCount} already in this kit.
          {importSummary.skipped.length > 0 && <> {importSummary.skipped.length} part number{importSummary.skipped.length === 1 ? "" : "s"} not found in the parts catalog and skipped: {importSummary.skipped.map((s) => s.partNumber).join(", ")}.</>}
        </div>
      )}
      <div className="drawer-fields"><label className="wide party-selector"><span>Part</span><div><Search size={15} /><input value={partQuery} onChange={(e) => { setPartQuery(e.target.value); setForm((c) => ({ ...c, partId: "" })); }} placeholder="Search part number or description" /></div>{partOptions.length > 0 && <div className="selector-results">{partOptions.map((part) => <button key={part.id} type="button" onClick={() => { setForm((c) => ({ ...c, partId: part.id })); setPartQuery(`${part.partNumber || ""} · ${part.description || ""}`); setPartOptions([]); }}>{part.partNumber} · {part.description}</button>)}</div>}</label><label><span>Quantity</span><input type="number" min="0.0001" step="0.0001" value={form.quantityDefault} onChange={(e) => setForm((c) => ({ ...c, quantityDefault: e.target.value }))} /></label><label><span>Sort order</span><input type="number" min="0" step="1" value={form.sortOrder} onChange={(e) => setForm((c) => ({ ...c, sortOrder: e.target.value }))} /></label><label className="wide"><span>Notes</span><textarea rows={3} value={form.notes} onChange={(e) => setForm((c) => ({ ...c, notes: e.target.value }))} /></label></div><footer className="detail-actions"><button type="button" className="quiet-button" disabled={saving || !form.partId} onClick={() => void addLine()}>Add kit line</button></footer><div className="data-table-wrap"><table className="data-table"><thead><tr><th>Part</th><th>Description</th><th>Qty</th><th>Notes</th><th>Order</th><th></th></tr></thead><tbody>{lines.map((line) => <tr key={line.id}><td className="mono">{line.part.partNumber}</td><td>{line.part.description}</td><td><input type="number" min="0.0001" step="0.0001" defaultValue={line.quantityDefault} onBlur={(e) => { const next = e.target.value; if (next !== line.quantityDefault) void updateLine(line, { quantityDefault: next }); }} /></td><td><input defaultValue={line.notes || ""} onBlur={(e) => { const next = e.target.value; if (next !== (line.notes || "")) void updateLine(line, { notes: next || null }); }} /></td><td><input type="number" min="0" step="1" defaultValue={String(line.sortOrder)} onBlur={(e) => { const next = Number(e.target.value); if (next !== line.sortOrder) void updateLine(line, { sortOrder: next }); }} /></td><td className="actions"><button type="button" className="table-action" onClick={() => void removeLine(line.id)}>Remove</button></td></tr>)}{lines.length === 0 && <tr><td colSpan={6} className="table-state compact-empty-state">This job kit does not have any lines yet.</td></tr>}</tbody></table></div></> : <div className="table-state compact-empty-state">Save or open a job kit to manage its lines.</div>}</section>}
  </div>;
}
/* eslint-enable react-hooks/set-state-in-effect */
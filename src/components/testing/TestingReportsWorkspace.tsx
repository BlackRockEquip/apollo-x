"use client";

import "./testing.css";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Search, Settings2, X } from "lucide-react";
import { templateMatchesModel } from "@/lib/testing/spec";
import { rankTemplatesForModel } from "./rank";
import { ResultPill } from "./ResultPill";
import { formatDate, testingApi, type JobHit, type ReportDetail, type ReportListItem, type TemplateItem } from "./types";

type Filter = "ALL" | "OPEN" | "DONE" | "FAIL";

const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: "ALL", label: "All" },
  { id: "OPEN", label: "In progress" },
  { id: "DONE", label: "Completed" },
  { id: "FAIL", label: "Failed" },
];

export function TestingReportsWorkspace({ canEdit, canManage, showCustomer }: { canEdit: boolean; canManage: boolean; showCustomer: boolean }) {
  const [items, setItems] = useState<ReportListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("ALL");
  const [creating, setCreating] = useState(false);
  const router = useRouter();

  const load = useCallback(async (q: string) => {
    try {
      const body = await testingApi<{ items: ReportListItem[] }>(`/api/v1/testing-reports?q=${encodeURIComponent(q)}`);
      setItems(body.items); setError("");
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to load test reports."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => { void load(query); }, query ? 250 : 0);
    return () => clearTimeout(timer);
  }, [query, load]);

  const counts = useMemo(() => ({
    ALL: items.length,
    OPEN: items.filter((i) => i.status === "DRAFT").length,
    DONE: items.filter((i) => i.status === "COMPLETED").length,
    FAIL: items.filter((i) => i.result === "FAIL").length,
  }), [items]);
  const shown = items.filter((i) => filter === "ALL" ? true : filter === "OPEN" ? i.status === "DRAFT" : filter === "DONE" ? i.status === "COMPLETED" : i.result === "FAIL");

  return (
    <div>
      <header className="page-header compact">
        <div><p className="eyebrow">Testing</p><h1>Testing Reports</h1><p>Transmission dyno test sheets, checked against the spec for each machine as the readings are typed in.</p></div>
        <div className="tr-bar">
          {canManage && <Link href="/testing-reports/templates" className="quiet-button"><Settings2 size={14} /> Spec templates</Link>}
          {canEdit && <button type="button" className="gold-button" onClick={() => setCreating(true)}><Plus size={15} /> New test</button>}
        </div>
      </header>
      {error && <div className="inline-error">{error}</div>}
      <section className="master-panel">
        <div className="master-toolbar">
          <label className="search-control"><Search size={15} /><input aria-label="Search test reports" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={showCustomer ? "Search job, machine, serial or customer" : "Search job, machine or serial"} /></label>
          <div className="tr-seg" role="group" aria-label="Show">
            {FILTERS.map((f) => <button key={f.id} type="button" aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>{f.label} ({counts[f.id]})</button>)}
          </div>
        </div>
        {loading ? <div className="table-state"><Loader2 className="spin" size={20} /> Loading…</div> : (
          <div className="data-table-wrap">
            <table className="data-table">
              <thead><tr><th>Report</th><th>Job</th><th>Machine</th>{showCustomer && <th>Customer</th>}<th>Date</th><th>Tested by</th><th>Readings</th><th>Result</th></tr></thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.id} className={`row-click ${r.result === "FAIL" ? "tr-row-fail" : ""}`} tabIndex={0} onClick={() => router.push(`/testing-reports/${r.id}`)} onKeyDown={(e) => { if (e.key === "Enter") router.push(`/testing-reports/${r.id}`); }}>
                    <td><strong>{r.label}</strong>{r.retestOfId && <div className="tr-sub">Retest</div>}</td>
                    <td>{r.jobNumber || <span className="muted">—</span>}</td>
                    <td>{r.machineModel}<div className="tr-sub">{r.serialNumber || "No serial"}</div></td>
                    {showCustomer && <td>{r.customerName || <span className="muted">—</span>}</td>}
                    <td>{formatDate(r.testDate)}</td>
                    <td>{r.testers.join(", ") || "—"}</td>
                    <td><span className="tr-progress"><i><b style={{ width: `${r.total ? Math.round((r.entered / r.total) * 100) : 0}%` }} /></i>{r.entered} of {r.total}</span></td>
                    <td><ResultPill result={r.result} status={r.status} onComments={r.passedOnComments} />{r.status === "COMPLETED" && <span className="tr-sub" style={{ display: "block", marginTop: 3 }}>Completed</span>}</td>
                  </tr>
                ))}
                {shown.length === 0 && <tr><td colSpan={showCustomer ? 8 : 7} className="table-state compact-empty-state">{items.length === 0 ? "No tests yet. Start one with New test." : "No tests match."}</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {creating && <NewTestDialog onClose={() => setCreating(false)} onCreated={(id) => router.push(`/testing-reports/${id}`)} canManage={canManage} />}
    </div>
  );
}

// Start a test: optionally pick the job, pick the spec template (best match first), confirm the machine details.
export function NewTestDialog({ onClose, onCreated, jobId, canManage }: { onClose: () => void; onCreated: (id: string) => void; jobId?: string; canManage?: boolean }) {
  const [templates, setTemplates] = useState<TemplateItem[]>([]);
  const [templatesLoaded, setTemplatesLoaded] = useState(false);
  const [jobQuery, setJobQuery] = useState("");
  const [hits, setHits] = useState<JobHit[]>([]);
  const [job, setJob] = useState<JobHit | null>(null);
  const [templateId, setTemplateId] = useState("");
  const [model, setModel] = useState("");
  const [serial, setSerial] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [testType, setTestType] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const body = await testingApi<{ items: TemplateItem[] }>("/api/v1/testing-templates");
        setTemplates(body.items);
      } catch (e) { setError(e instanceof Error ? e.message : "Unable to load spec templates."); }
      finally { setTemplatesLoaded(true); }
    })();
  }, []);

  // Pre-select the job when the dialog was opened from a job card.
  useEffect(() => {
    if (!jobId) return;
    (async () => {
      try {
        const body = await testingApi<{ items: JobHit[] }>(`/api/v1/testing-reports/jobs?q=`);
        const found = body.items.find((j) => j.id === jobId);
        if (found) pickJob(found);
      } catch { /* the job can still be picked by hand */ }
    })();
  }, [jobId]);

  useEffect(() => {
    if (jobId || job || jobQuery.trim().length < 2) return;
    const timer = setTimeout(async () => {
      try { setHits((await testingApi<{ items: JobHit[] }>(`/api/v1/testing-reports/jobs?q=${encodeURIComponent(jobQuery.trim())}`)).items); } catch { setHits([]); }
    }, 250);
    return () => clearTimeout(timer);
  }, [jobQuery, job, jobId]);

  const ranked = useMemo(() => rankTemplatesForModel(templates, model), [templates, model]);
  // The best matching template is chosen for the model until one is picked by hand.
  const best = ranked[0];
  const autoTemplateId = model && best && templateMatchesModel(best, model) ? best.id : "";
  const chosenId = templateId || autoTemplateId;
  const shownHits = jobId || job || jobQuery.trim().length < 2 ? [] : hits;

  function pickJob(hit: JobHit) {
    setJob(hit); setHits([]);
    if (hit.machineModel) setModel(hit.machineModel);
    if (hit.serialNumber) setSerial(hit.serialNumber);
    setTemplateId("");
  }

  const selected = templates.find((t) => t.id === chosenId);
  async function start() {
    setSaving(true); setError("");
    try {
      const created = await testingApi<ReportDetail>("/api/v1/testing-reports", { method: "POST", body: { templateId: chosenId, jobId: job?.id ?? jobId ?? null, machineModel: model || undefined, serialNumber: serial || undefined, testDate: date, testType: testType || undefined } });
      onCreated(created.id);
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to start the test."); setSaving(false); }
  }

  return (
    <div className="drawer-backdrop" role="dialog" aria-modal="true" aria-label="New test">
      <div className="form-drawer compact-dialog" style={{ maxWidth: 560 }}>
        <div className="tr-dialog">
          <div className="tr-bar"><h2 className="tr-grow">New test</h2><button type="button" className="tr-icon-btn" aria-label="Close" onClick={onClose}><X size={15} /></button></div>
          {error && <div className="inline-error" style={{ borderRadius: 7 }}>{error}</div>}
          {!jobId && (
            <div className="tr-field">
              <span>Job (optional)</span>
              {job ? (
                <div className="tr-hit" aria-pressed="true"><span><strong>{job.jobNumber}</strong> <small>{[job.machineModel, job.serialNumber, job.customerName].filter(Boolean).join(" · ")}</small></span><button type="button" className="tr-mini" onClick={() => { setJob(null); setJobQuery(""); }}>Change</button></div>
              ) : (
                <>
                  <input value={jobQuery} onChange={(e) => setJobQuery(e.target.value)} placeholder="Job number, model or serial" />
                  {shownHits.length > 0 && <div className="tr-hits">{shownHits.map((h) => <button type="button" key={h.id} className="tr-hit" onClick={() => pickJob(h)}><span><strong>{h.jobNumber}</strong> <small>{[h.machineModel, h.serialNumber, h.customerName].filter(Boolean).join(" · ")}</small></span></button>)}</div>}
                </>
              )}
            </div>
          )}
          {jobId && job && <div className="tr-sub">Job <strong>{job.jobNumber}</strong>{job.machineModel ? ` · ${job.machineModel}` : ""}</div>}
          <div className="tr-two">
            <label className="tr-field"><span>Machine model *</span><input value={model} onChange={(e) => { setModel(e.target.value); setTemplateId(""); }} placeholder="e.g. 777D" /></label>
            <label className="tr-field"><span>Serial number</span><input value={serial} onChange={(e) => setSerial(e.target.value)} /></label>
          </div>
          <label className="tr-field">
            <span>Spec template *</span>
            <select value={chosenId} onChange={(e) => setTemplateId(e.target.value)} disabled={!templatesLoaded}>
              <option value="">{templatesLoaded ? (templates.length ? "Choose a spec template" : "No spec templates yet") : "Loading…"}</option>
              {ranked.map((t) => <option key={t.id} value={t.id}>{t.name}{t.machineModels.length ? ` (${t.machineModels.join(", ")})` : ""}</option>)}
            </select>
          </label>
          {templatesLoaded && templates.length === 0 && <div className="tr-sub">{canManage ? <>Add the starter templates first on the <Link className="tr-link" href="/testing-reports/templates">Spec templates</Link> page.</> : "Ask a manager to add the spec templates first."}</div>}
          {selected && <div className="tr-sub">{selected.parameters.length} parameters and {selected.clutchRows.length} clutch rows. The limits are copied onto this test, so later template changes do not alter it.</div>}
          <div className="tr-two">
            <label className="tr-field"><span>Test date</span><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
            <label className="tr-field"><span>Test type</span><input value={testType} onChange={(e) => setTestType(e.target.value)} placeholder="e.g. After repair" /></label>
          </div>
          <div className="tr-actions">
            <button type="button" className="quiet-button" onClick={onClose} disabled={saving}>Cancel</button>
            <button type="button" className="gold-button" disabled={saving || !chosenId || !model.trim()} onClick={() => void start()}>{saving ? "Starting…" : "Start test"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

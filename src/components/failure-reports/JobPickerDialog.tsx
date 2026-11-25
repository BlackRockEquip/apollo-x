"use client";

import "./failure-reports.css";
import { useEffect, useState } from "react";
import { Loader2, Search, X } from "lucide-react";
import { frApi, type JobHit } from "./types";

// Pick a job to link a report to. Lists the latest jobs straight away; typing searches job number, component, model, serial,
// plant number and client.
export function JobPickerDialog({ title, intro, onPick, onClose, allowBlank, busy }: {
  title: string; intro?: string; onPick: (job: JobHit | null) => void; onClose: () => void; allowBlank?: boolean; busy?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<JobHit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const timer = setTimeout(async () => {
      setLoading(true);
      try { setHits((await frApi<{ items: JobHit[] }>(`/api/v1/failure-reports/jobs?q=${encodeURIComponent(query.trim())}`)).items); setError(""); }
      catch (e) { setError(e instanceof Error ? e.message : "Unable to look up jobs."); setHits([]); }
      finally { setLoading(false); }
    }, query ? 250 : 0);
    return () => clearTimeout(timer);
  }, [query]);

  return (
    <div className="drawer-backdrop" role="dialog" aria-modal="true" aria-label={title}>
      <div className="form-drawer compact-dialog" style={{ maxWidth: 600 }}>
        <div style={{ display: "grid", gap: 12, padding: "18px 20px" }}>
          <div className="fr-bar"><h2 className="fr-grow" style={{ margin: 0, fontSize: 17 }}>{title}</h2><button type="button" className="fr-icon-btn" aria-label="Close" onClick={onClose}><X size={15} /></button></div>
          {intro && <p className="fr-sub" style={{ margin: 0, fontSize: 12.5 }}>{intro}</p>}
          {error && <div className="inline-error" style={{ borderRadius: 7 }}>{error}</div>}
          <label className="search-control" style={{ width: "100%" }}><Search size={15} /><input autoFocus aria-label="Search jobs" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Job number, component, model, serial, plant or client" /></label>
          <div style={{ display: "grid", gap: 6, maxHeight: 340, overflow: "auto" }}>
            {loading ? <div className="table-state"><Loader2 className="spin" size={18} /> Looking up jobs…</div> : hits.map((h) => (
              <button key={h.id} type="button" className="fr-pitem" style={{ gridTemplateColumns: "minmax(0,1fr) auto" }} disabled={busy} onClick={() => onPick(h)}>
                <span><span className="nm">{h.jobNumber}</span> <span className="fr-sub">{[h.client, [h.make, h.model].filter(Boolean).join(" "), h.component, h.serial].filter(Boolean).join(" · ")}</span></span>
                <span className="fr-link">Use this job</span>
              </button>
            ))}
            {!loading && hits.length === 0 && <div className="fr-sub">No jobs match.</div>}
          </div>
          {allowBlank && <div className="fr-bar"><span className="fr-grow fr-sub">No job yet? Start blank and link it later.</span><button type="button" className="quiet-button" disabled={busy} onClick={() => onPick(null)}>Blank report</button></div>}
        </div>
      </div>
    </div>
  );
}

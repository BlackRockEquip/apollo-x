"use client";

/* eslint-disable react-hooks/set-state-in-effect -- async dashboard resource loading intentionally mirrors existing workspace patterns */
import { useEffect, useState } from "react";
import { RotateCcw, Save } from "lucide-react";

type Widget = { key: string; enabled: boolean; order: number };
type AvailableWidget = { key: string; label: string };
// 2026-09-15, user request: "add a linegraph that is customizable for
// different analytics eg: total jobs per month, total completed jobs,
// warrantys per month etc, user can select 3 line graph views."
const MAX_ANALYTICS_CHARTS = 3;

// 2026-09-10 — split out of what used to be settings/dashboard/page.tsx
// itself (a "use client" page.tsx can't be an async server component, so
// it couldn't fetch the RequestContext the new shared SettingsTabNav needs
// — see the settings-nav.ts header comment). This is the exact same
// widget-picker logic, unchanged, just no longer also the route's page.tsx;
// the new page.tsx is a thin async server wrapper that renders the header
// + tab bar + this component.
export function DashboardSettingsWorkspace() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [available, setAvailable] = useState<AvailableWidget[]>([]);
  const [widgets, setWidgets] = useState<Widget[]>([]);
  // 2026-09-15, user request: see MAX_ANALYTICS_CHARTS above.
  const [availableAnalyticsMetrics, setAvailableAnalyticsMetrics] = useState<AvailableWidget[]>([]);
  const [analyticsCharts, setAnalyticsCharts] = useState<string[]>([]);

  async function load() {
    setLoading(true);
    try {
      const response = await fetch("/api/v1/dashboard?mode=config", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message || "Unable to load dashboard config.");
      setAvailable(body.available);
      setWidgets(body.widgets);
      setAvailableAnalyticsMetrics(body.availableAnalyticsMetrics || []);
      setAnalyticsCharts(body.analyticsCharts || []);
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to load dashboard config."); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);

  function toggleAnalyticsMetric(key: string) {
    setAnalyticsCharts((current) => {
      if (current.includes(key)) return current.filter((k) => k !== key);
      if (current.length >= MAX_ANALYTICS_CHARTS) return current;
      return [...current, key];
    });
  }

  async function save() {
    setSaving(true); setError("");
    try {
      const response = await fetch("/api/v1/dashboard", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ widgets, analyticsCharts }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message || "Unable to save dashboard layout.");
      setWidgets(body.widgets);
      setAnalyticsCharts(body.analyticsCharts || []);
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to save dashboard layout."); }
    finally { setSaving(false); }
  }

  async function reset() {
    setSaving(true); setError("");
    try {
      const response = await fetch("/api/v1/dashboard", { method: "DELETE" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message || "Unable to reset dashboard.");
      setWidgets(body.widgets);
      setAnalyticsCharts(body.analyticsCharts || []);
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to reset dashboard."); }
    finally { setSaving(false); }
  }

  function move(key: string, dir: -1 | 1) {
    setWidgets((current) => {
      const next = [...current].sort((a, b) => a.order - b.order);
      const index = next.findIndex((row) => row.key === key);
      const swap = index + dir;
      if (index < 0 || swap < 0 || swap >= next.length) return current;
      [next[index], next[swap]] = [next[swap], next[index]];
      return next.map((row, order) => ({ ...row, order }));
    });
  }

  const ordered = [...widgets].sort((a, b) => a.order - b.order);

  return <div><div className="header-actions" style={{ marginBottom: 12 }}><button type="button" className="quiet-button" disabled={saving} onClick={() => void reset()}><RotateCcw size={14} /> Restore defaults</button><button type="button" className="gold-button" disabled={saving} onClick={() => void save()}><Save size={14} /> Save layout</button></div>{error ? <div className="inline-error">{error}</div> : null}{loading ? <div className="table-state">Loading…</div> : <>
    <section className="detail-panel"><header><div><h2>Available widgets</h2></div></header><div className="dashboard-widget-list">{ordered.map((widget, index) => <article key={widget.key}><strong>{available.find((row) => row.key === widget.key)?.label || widget.key}</strong><div className="stack-row"><label className="small-toggle"><input type="checkbox" checked={widget.enabled} onChange={(e) => setWidgets((current) => current.map((row) => row.key === widget.key ? { ...row, enabled: e.target.checked } : row))} /> Visible</label><button type="button" className="table-action" onClick={() => move(widget.key, -1)} disabled={index === 0}>↑</button><button type="button" className="table-action" onClick={() => move(widget.key, 1)} disabled={index === ordered.length - 1}>↓</button></div></article>)}</div></section>
    {/* 2026-09-15, user request: "add a linegraph that is customizable for
        different analytics eg: total jobs per month, total completed jobs,
        warrantys per month etc, user can select 3 line graph views." Up to
        MAX_ANALYTICS_CHARTS checkboxes, same "Save layout" button above
        saves both. */}
    <section className="detail-panel" style={{ marginTop: 12 }}>
      <header><div><h2>Analytics line graphs</h2><p>Pick up to {MAX_ANALYTICS_CHARTS} — each shows as its own chart on the dashboard, last 12 months.</p></div></header>
      <div className="dashboard-widget-list">
        {availableAnalyticsMetrics.map((metric) => {
          const checked = analyticsCharts.includes(metric.key);
          const disabled = !checked && analyticsCharts.length >= MAX_ANALYTICS_CHARTS;
          return <article key={metric.key}><strong>{metric.label}</strong><div className="stack-row"><label className="small-toggle"><input type="checkbox" checked={checked} disabled={disabled} onChange={() => toggleAnalyticsMetric(metric.key)} /> {checked ? "Shown" : disabled ? `Limit ${MAX_ANALYTICS_CHARTS} reached` : "Show"}</label></div></article>;
        })}
        {availableAnalyticsMetrics.length === 0 && <div className="table-state compact-empty-state">No analytics metrics available for your permissions.</div>}
      </div>
    </section>
  </>}</div>;
}

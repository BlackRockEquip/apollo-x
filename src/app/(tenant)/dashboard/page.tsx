"use client";

/* eslint-disable react-hooks/set-state-in-effect -- async dashboard resource loading intentionally mirrors existing workspace patterns */
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type Widget = { key: string; enabled: boolean; order: number };
type OutstandingPartLine = { id: string; job: { id: string; jobNumber: string | null; customer: { name: string } | null } | null };
type DashboardData = { jobsSummary: Record<string, number>; recentJobs: Array<{ id: string }>; lowStock: Array<{ id: string }>; outstandingParts: OutstandingPartLine[]; pexStatus: Record<string, number>; supportTickets: Record<string, number> };

// 2026-09-14 — "Update the dashboard and make it clickable to take a user
// to the relevant place" (explicit request). Every widget card is now a
// <Link> to wherever that number actually comes from, instead of a static
// <article>. Also fills in the two widgets (wip-status-counts,
// inventory-alerts) whose figures the backend (dashboard/service.ts) was
// already computing — they share a query with jobs-summary/low-stock
// respectively — but the old inline ternary chain never rendered: they fell
// through its `default` to an empty string, so enabling either from
// Settings > Dashboard produced a blank card. "procurement-summary" and
// "notifications" are left as-is (no destination page/data source exists
// for either yet — Procurement/RFQs and Notifications are both still
// permission-only module stubs, see codebase-overview.md's module list) —
// not something "make it clickable" can fix on its own.
const WIDGET_HREF: Record<string, string> = {
  "jobs-summary": "/jobs",
  "wip-status-counts": "/jobs?view=wip",
  "recent-jobs": "/jobs",
  "low-stock": "/inventory",
  "inventory-alerts": "/inventory",
  "outstanding-parts": "/jobs?view=wip",
  "pex-status": "/pex-tracking",
  "support-tickets": "/support",
};

// Non-terminal job statuses = "open"/WIP — same set the Jobs & WIP list's
// own "view=wip" filter resolves to server-side (jobsListQuery), just
// counted client-side here from the same per-status breakdown jobs-summary
// already carries, rather than a second API round trip.
const TERMINAL_JOB_STATUS_LABELS = new Set(["Complete", "Closed", "Cancelled", "Returned unrepaired"]);

function widgetValue(key: string, data: DashboardData | null): string {
  switch (key) {
    case "jobs-summary":
      return String(Object.values(data?.jobsSummary || {}).reduce((sum, value) => sum + Number(value || 0), 0));
    case "wip-status-counts":
      return String(Object.entries(data?.jobsSummary || {}).reduce((sum, [label, value]) => sum + (TERMINAL_JOB_STATUS_LABELS.has(label) ? 0 : Number(value || 0)), 0));
    case "low-stock":
    case "inventory-alerts":
      return String((data?.lowStock || []).length);
    case "support-tickets":
      return String(Object.values(data?.supportTickets || {}).reduce((sum, value) => sum + Number(value || 0), 0));
    case "pex-status":
      return String(Object.values(data?.pexStatus || {}).reduce((sum, value) => sum + Number(value || 0), 0));
    case "recent-jobs":
      return String((data?.recentJobs || []).length);
    case "outstanding-parts":
      return String((data?.outstandingParts || []).length);
    default:
      return "—";
  }
}

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [widgets, setWidgets] = useState<Widget[]>([]);
  const [data, setData] = useState<DashboardData | null>(null);
  // 2026-09-15, user request: "Dashboard, when clicking to outstandings
  // parts, list the jobs its referring to." The outstanding-parts widget
  // used to just link to the generic WIP jobs list like every other
  // widget; the backend (dashboard/service.ts) already fetches each
  // outstanding line's job (id/jobNumber/customer name), it just wasn't
  // shown anywhere — so this toggles an inline panel of the distinct jobs
  // instead of navigating away.
  const [showOutstandingJobs, setShowOutstandingJobs] = useState(false);
  const outstandingJobs = useMemo(() => {
    const byJob = new Map<string, { id: string; jobNumber: string | null; customerName: string | null; count: number }>();
    for (const line of data?.outstandingParts || []) {
      if (!line.job) continue;
      const existing = byJob.get(line.job.id);
      if (existing) existing.count += 1;
      else byJob.set(line.job.id, { id: line.job.id, jobNumber: line.job.jobNumber, customerName: line.job.customer?.name ?? null, count: 1 });
    }
    return Array.from(byJob.values());
  }, [data]);

  async function load() {
    setLoading(true);
    try {
      const dataResponse = await fetch("/api/v1/dashboard", { cache: "no-store" });
      const body = await dataResponse.json();
      if (!dataResponse.ok) throw new Error(body.error?.message || "Unable to load dashboard.");
      setWidgets(body.widgets);
      setData(body.data);
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to load dashboard."); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);

  const ordered = [...widgets].sort((a, b) => a.order - b.order);

  return <div>
    <header className="page-header compact"><div><p className="eyebrow">Overview</p><h1>Dashboard</h1></div><div className="header-actions"><Link href="/settings/dashboard" className="quiet-button">Customize dashboard</Link></div></header>
    {error ? <div className="inline-error">{error}</div> : null}
    {loading ? <div className="table-state">Loading dashboard…</div> : <>
      <section className="metric-grid compact">
        {ordered.filter((widget) => widget.enabled).map((widget) => {
          const card = <><span>{widget.key.replaceAll("-", " ")}</span><strong>{widgetValue(widget.key, data)}</strong></>;
          // "Outstanding parts" is a toggle (see outstandingJobs above),
          // not a navigation link like every other widget.
          if (widget.key === "outstanding-parts") {
            return <button key={widget.key} type="button" className="metric-card compact clickable-metric-card" onClick={() => setShowOutstandingJobs((v) => !v)}>{card}</button>;
          }
          const href = WIDGET_HREF[widget.key];
          return href
            ? <Link key={widget.key} href={href} className="metric-card compact clickable-metric-card">{card}</Link>
            : <article key={widget.key} className="metric-card compact">{card}</article>;
        })}
      </section>
      {showOutstandingJobs && (
        <section className="detail-panel" style={{ marginTop: 12 }}>
          <header><div><h2>Jobs with outstanding parts</h2><p>From the {(data?.outstandingParts || []).length} most recently updated outstanding part lines.</p></div></header>
          <div className="record-list">
            {outstandingJobs.length === 0 && <div className="table-state compact-empty-state">No outstanding parts.</div>}
            {outstandingJobs.map((j) => (
              <article key={j.id}>
                <div className="record-icon">PT</div>
                <div><strong><Link href={`/jobs/${j.id}`}>{j.jobNumber || "—"}</Link></strong><span>{j.customerName || "—"}</span></div>
                <span>{j.count} part line{j.count === 1 ? "" : "s"}</span>
              </article>
            ))}
          </div>
        </section>
      )}
    </>}
  </div>;
}

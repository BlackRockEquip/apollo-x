"use client";

/* eslint-disable react-hooks/set-state-in-effect -- async dashboard resource loading intentionally mirrors existing workspace patterns */
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CombinedAnalyticsChart, type AnalyticsSeriesPoint } from "@/components/AnalyticsLineChart";

type Widget = { key: string; enabled: boolean; order: number };
type OutstandingPartLine = { id: string; job: { id: string; jobNumber: string | null; customer: { name: string } | null } | null };
// 2026-09-15, user request: "add a linegraph that is customizable for
// different analytics eg: total jobs per month, total completed jobs,
// warrantys per month etc, user can select 3 line graph views." Which
// metrics/how many is chosen on Settings > Dashboard (see
// DashboardSettingsWorkspace.tsx) — this page only renders whatever the
// backend already picked (up to 3, dashboard/service.ts's
// DASHBOARD_ANALYTICS_METRIC_DEFS).
type AnalyticsSeries = { key: string; label: string; points: AnalyticsSeriesPoint[] };
type DashboardData = { jobsSummary: Record<string, number>; recentJobs: Array<{ id: string }>; lowStock: Array<{ id: string }>; outstandingParts: OutstandingPartLine[]; procurementOpen: number; pexStatus: Record<string, number>; supportTickets: Record<string, number>; analyticsSeries: AnalyticsSeries[] };

// 2026-09-14 — "Update the dashboard and make it clickable to take a user
// to the relevant place" (explicit request). Every widget card is now a
// <Link> to wherever that number actually comes from, instead of a static
// <article>. Also fills in the two widgets (wip-status-counts,
// inventory-alerts) whose figures the backend (dashboard/service.ts) was
// already computing — they share a query with jobs-summary/low-stock
// respectively — but the old inline ternary chain never rendered: they fell
// through its `default` to an empty string, so enabling either from
// Settings > Dashboard produced a blank card. "notifications" is left as-is
// (Notifications is still a permission-only module stub with no data source
// or destination page — see codebase-overview.md's module list).
//
// 2026-09-18 — "procurement-summary" ("What is procurement summary on
// dashboard?") turned out to be the same kind of dead widget: it was gated
// behind a module ("PROCUREMENT") nothing else in the app ever grants, had
// no case in widgetValue below (always showed "—"), and had no entry here.
// dashboard/service.ts now computes a real count (open outwork items +
// RFQs still awaiting a quote) and regates it to match where that data
// actually lives — see that file's DASHBOARD_WIDGET_DEFS comment.
const WIDGET_HREF: Record<string, string> = {
  "jobs-summary": "/jobs",
  "wip-status-counts": "/jobs?view=wip",
  "recent-jobs": "/jobs",
  "low-stock": "/inventory",
  "inventory-alerts": "/inventory",
  "outstanding-parts": "/jobs?view=wip",
  "procurement-summary": "/suppliers/outwork",
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
    case "procurement-summary":
      return String(data?.procurementOpen ?? 0);
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

  // `silent` (2026-09-15, user request: "Refresh faster with changes" —
  // clarified to mean other people's changes should show up here without a
  // manual reload) skips the loading-state flip so a background poll
  // doesn't blank the widgets/outstanding-jobs panel every tick — same
  // silent-reload convention JobWorkspace's own load(silent) already uses.
  async function load(silent?: boolean) {
    if (!silent) setLoading(true);
    try {
      const dataResponse = await fetch("/api/v1/dashboard", { cache: "no-store" });
      const body = await dataResponse.json();
      if (!dataResponse.ok) throw new Error(body.error?.message || "Unable to load dashboard.");
      setWidgets(body.widgets);
      setData(body.data);
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to load dashboard."); }
    finally { if (!silent) setLoading(false); }
  }
  useEffect(() => { void load(); }, []);
  useEffect(() => {
    const timer = setInterval(() => { if (document.visibilityState === "visible") void load(true); }, 20000);
    return () => clearInterval(timer);
  }, []);

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
      {/* 2026-09-18, user request: "combine line graphs into 1 interactive
          graph" — was one AnalyticsLineChart card per selected metric in
          this grid; now one CombinedAnalyticsChart plotting all of them
          together (see that component's own header comment for why a
          single shared Y-axis is correct here). */}
      {(data?.analyticsSeries?.length ?? 0) > 0 && (
        <section className="analytics-chart-grid">
          <CombinedAnalyticsChart series={data!.analyticsSeries} />
        </section>
      )}
    </>}
  </div>;
}

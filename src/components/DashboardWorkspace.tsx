"use client";

/* eslint-disable react-hooks/set-state-in-effect -- async dashboard resource loading intentionally mirrors existing workspace patterns */
import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { Activity, ArrowUpRight, ChevronRight, CircleCheck, Clock, FlaskConical, MessageSquare, Package, RefreshCw, ShoppingCart, Truck, TriangleAlert } from "lucide-react";
import { CombinedAnalyticsChart, type AnalyticsSeriesPoint } from "@/components/AnalyticsLineChart";
import { StatusPill, pexStatusLabel } from "@/components/StatusPill";

type Widget = { key: string; enabled: boolean; order: number };
type RecentJob = { id: string; jobNumber: string | null; status: string; customer: { name: string } | null };
// 2026-09-15, user request: "add a linegraph that is customizable for
// different analytics eg: total jobs per month, total completed jobs,
// warrantys per month etc, user can select 3 line graph views." Which
// metrics/how many is chosen on Settings > Dashboard (see
// DashboardSettingsWorkspace.tsx) — this page only renders whatever the
// backend already picked (up to 3, dashboard/service.ts's
// DASHBOARD_ANALYTICS_METRIC_DEFS).
type AnalyticsSeries = { key: string; label: string; points: AnalyticsSeriesPoint[] };
type Attention = {
  partsOverdue: { jobs: number; oldestDays: number };
  awaitingGoAhead: { count: number; oldestDays: number };
  stuck: { count: number };
  readyToDeliver: { count: number };
  stuckThresholdDays: number;
  overdueThresholdDays: number;
};
type StuckJob = { id: string; jobNumber: string; customerName: string | null; status: string; label: string; days: number };
type StatusRow = { status: string; label: string; count: number; stuck: number };
type PartsJob = { jobId: string; jobNumber: string; customerName: string | null; lines: number; days: number };
type DashboardData = {
  attention: Attention | null;
  stuckJobs: StuckJob[];
  statusBreakdown: StatusRow[];
  partsOutstandingJobs: PartsJob[];
  partsOutstandingLineCount: number;
  completedThisMonth: { count: number; previous: number; previousLabel: string } | null;
  jobsSummary: Record<string, number>;
  recentJobs: RecentJob[];
  procurementOpen: number;
  pexStatus: Record<string, number>;
  supportTickets: Record<string, number>;
  analyticsSeries: AnalyticsSeries[];
};

// 2026-10-06, user request: "Build all currently mocked up now" — the
// dashboard was rebuilt to the "Refined dashboard v2" mockup:
//   1. a "Needs attention" strip (parts overdue, awaiting go-ahead, stuck
//      14+ days, ready to deliver) — each card links to the matching jobs,
//   2. "Jobs by status" bars that open Jobs & WIP filtered to that status,
//   3. a 3 / 6 / 12 month range switch on the activity chart, and the
//      "Total jobs" card replaced by "Completed this month" (with a % change
//      vs last month),
//   4. "stuck in a status" flags on the bars plus a "Stuck in a status" list.
// Also: KPI cards with icon tiles, a Parts outstanding list (replaces the
// old toggle panel), Recently updated jobs with status pills, and PEX /
// Support status cards. Every panel is still tied to its dashboard widget
// being switched on in Settings > Dashboard.
//
// History kept from the earlier version:
// 2026-09-14 — "Update the dashboard and make it clickable to take a user
// to the relevant place": every card links to wherever its number comes from.
// 2026-09-15 — "Refresh faster with changes": the 20-second silent poll
// below (silent = no loading-state flip, so it doesn't blank the page).
// 2026-09-18 — procurement-summary got a real count (open outwork + RFQs).
// 2026-09-29 — Inventory alerts / Low stock cards removed.
// 2026-10-01 — split out of dashboard/page.tsx, which is now a thin server
// wrapper doing requireTenantPageAccess(ctx, "DASHBOARD_VIEW").
const WIDGET_HREF: Record<string, string> = {
  "jobs-summary": "/jobs?view=completed",
  "wip-status-counts": "/jobs?view=wip",
  "outstanding-parts": "/parts",
  "procurement-summary": "/outwork",
  "pex-status": "/pex-tracking",
  "support-tickets": "/support",
};

const KPI_LABEL: Record<string, string> = {
  "jobs-summary": "Completed this month",
  "wip-status-counts": "Jobs in progress",
  "outstanding-parts": "Parts outstanding",
  "procurement-summary": "Open procurement",
  "pex-status": "PEX units",
  "support-tickets": "Support tickets",
};

const KPI_ICON: Record<string, { icon: ReactNode; tone: string }> = {
  "jobs-summary": { icon: <CircleCheck size={18} />, tone: "green" },
  "wip-status-counts": { icon: <Activity size={18} />, tone: "blue" },
  "outstanding-parts": { icon: <Package size={18} />, tone: "gold" },
  "procurement-summary": { icon: <ShoppingCart size={18} />, tone: "grey" },
  "pex-status": { icon: <RefreshCw size={18} />, tone: "green" },
  "support-tickets": { icon: <MessageSquare size={18} />, tone: "grey" },
};

const TICKET_LABELS: Record<string, string> = { OPEN: "Open", IN_PROGRESS: "In progress", WAITING_ON_CUSTOMER: "Waiting on customer", RESOLVED: "Resolved", CLOSED: "Closed" };

function sum(record: Record<string, number> | undefined) {
  return Object.values(record || {}).reduce((total, value) => total + Number(value || 0), 0);
}

function widgetValue(key: string, data: DashboardData | null): string {
  switch (key) {
    case "jobs-summary":
      return String(data?.completedThisMonth?.count ?? 0);
    case "wip-status-counts":
      // Open (non-terminal) jobs — the same set the Jobs & WIP list's own
      // view=wip filter resolves to, summed from the status breakdown.
      return String((data?.statusBreakdown || []).reduce((total, row) => total + row.count, 0));
    case "support-tickets":
      return String(sum(data?.supportTickets));
    case "pex-status":
      return String(sum(data?.pexStatus));
    case "outstanding-parts":
      return String(data?.partsOutstandingLineCount ?? 0);
    case "procurement-summary":
      return String(data?.procurementOpen ?? 0);
    default:
      return "—";
  }
}

function plural(n: number, one: string, many: string) { return `${n} ${n === 1 ? one : many}`; }

function CompletedDelta({ completed }: { completed: NonNullable<DashboardData["completedThisMonth"]> }) {
  const { count, previous, previousLabel } = completed;
  if (previous === 0) return <span className="dash-delta flat">{count > 0 ? `vs 0 in ${previousLabel}` : `none in ${previousLabel} either`}</span>;
  const pct = Math.round(((count - previous) / previous) * 100);
  if (pct === 0) return <span className="dash-delta flat">same as {previousLabel}</span>;
  return <span className={`dash-delta ${pct > 0 ? "up" : "down"}`}>{pct > 0 ? "▲" : "▼"} {Math.abs(pct)}% vs {previousLabel}</span>;
}

function AttentionCard({ href, tone, icon, count, title, detail, cta }: { href: string; tone: "red" | "amber" | "green"; icon: ReactNode; count: number; title: string; detail: string; cta: string }) {
  // Only colour the card when there is actually something to act on.
  const active = count > 0 || tone === "green";
  return (
    <Link href={href} className={`dash-card dash-attn${active ? ` ${tone}` : ""}`}>
      <span className={`dash-tile ${active ? tone : "grey"}`}>{icon}</span>
      <div>
        <div className="dash-attn-head"><span className="dash-attn-count">{count}</span><span className="dash-attn-title">{title}</span></div>
        <div className="dash-attn-detail">{detail}</div>
        <div className="dash-attn-cta">{cta} →</div>
      </div>
    </Link>
  );
}

function StatusBars({ rows, href }: { rows: Array<{ key: string; label: string; count: number }>; href: string }) {
  const max = Math.max(1, ...rows.map((row) => row.count));
  return (
    <Link href={href} className="dash-mini-bars" aria-label="Open the full list">
      {rows.map((row) => (
        <div key={row.key} className="dash-mini-row">
          <span className="dash-mini-label">{row.label}</span>
          <div className="dash-bar"><b style={{ width: `${Math.max(4, (row.count / max) * 100)}%` }} /></div>
          <span className="dash-num dash-mini-count">{row.count}</span>
        </div>
      ))}
    </Link>
  );
}

export function DashboardWorkspace() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [widgets, setWidgets] = useState<Widget[]>([]);
  const [data, setData] = useState<DashboardData | null>(null);

  // `silent` (2026-09-15, user request: "Refresh faster with changes" —
  // clarified to mean other people's changes should show up here without a
  // manual reload) skips the loading-state flip so a background poll
  // doesn't blank the widgets every tick — same silent-reload convention
  // JobWorkspace's own load(silent) already uses.
  async function load(silent?: boolean) {
    if (!silent) setLoading(true);
    try {
      const dataResponse = await fetch("/api/v1/dashboard", { cache: "no-store" });
      const body = await dataResponse.json();
      if (!dataResponse.ok) throw new Error(body.error?.message || "Unable to load dashboard.");
      setWidgets(body.widgets);
      setData(body.data);
      setError("");
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to load dashboard."); }
    finally { if (!silent) setLoading(false); }
  }
  useEffect(() => { void load(); }, []);
  useEffect(() => {
    const timer = setInterval(() => { if (document.visibilityState === "visible") void load(true); }, 20000);
    return () => clearInterval(timer);
  }, []);

  const ordered = [...widgets].sort((a, b) => a.order - b.order).filter((widget) => widget.enabled);
  const on = (key: string) => ordered.some((widget) => widget.key === key);
  const kpis = ordered.filter((widget) => KPI_LABEL[widget.key]);
  const attention = data?.attention ?? null;
  const showStatus = on("jobs-summary") || on("wip-status-counts");
  const statusRows = data?.statusBreakdown ?? [];
  const statusMax = Math.max(1, ...statusRows.map((row) => row.count));
  const stuckJobs = data?.stuckJobs ?? [];
  const partsJobs = data?.partsOutstandingJobs ?? [];
  const recentJobs = data?.recentJobs ?? [];

  // PEX has two statuses that read as one ("Awaiting core"), so merge by label.
  const pexRows = Object.entries(data?.pexStatus ?? {}).reduce<Array<{ key: string; label: string; count: number }>>((rows, [status, count]) => {
    const label = pexStatusLabel(status);
    const existing = rows.find((row) => row.label === label);
    if (existing) existing.count += Number(count);
    else rows.push({ key: status, label, count: Number(count) });
    return rows;
  }, []);
  const ticketRows = Object.entries(data?.supportTickets ?? {}).map(([status, count]) => ({ key: status, label: TICKET_LABELS[status] ?? status, count: Number(count) }));

  return <div className="dash">
    <header className="page-header compact dash-header">
      <div>
        <p className="eyebrow">Overview</p>
        <h1>Dashboard</h1>
        <p className="dash-live"><span className="dash-live-dot" />Live · updates every 20 seconds</p>
      </div>
      <div className="header-actions"><Link href="/settings/dashboard" className="quiet-button">Customize dashboard</Link></div>
    </header>
    {error ? <div className="inline-error">{error}</div> : null}
    {loading ? <div className="table-state">Loading dashboard…</div> : <>
      {attention && (
        <section className="dash-section">
          <div className="dash-section-head"><h2>Needs attention</h2><span>Click a card to open the matching jobs</span></div>
          <div className="dash-attn-row">
            <AttentionCard
              href="/parts" tone="red" icon={<TriangleAlert size={18} />}
              count={attention.partsOverdue.jobs} title={attention.partsOverdue.jobs === 1 ? "job overdue for parts" : "jobs overdue for parts"}
              detail={attention.partsOverdue.jobs > 0 ? `Waiting ${attention.overdueThresholdDays}+ days · oldest ${plural(attention.partsOverdue.oldestDays, "day", "days")}` : `None waiting ${attention.overdueThresholdDays}+ days`}
              cta="Chase suppliers"
            />
            <AttentionCard
              href="/jobs?view=wip&status=AWAITING_GO_AHEAD" tone="amber" icon={<Clock size={18} />}
              count={attention.awaitingGoAhead.count} title="awaiting go-ahead"
              detail={attention.awaitingGoAhead.count > 0 ? `Quotes sent · oldest ${plural(attention.awaitingGoAhead.oldestDays, "day", "days")}` : "No quotes waiting on a decision"}
              cta="Review quotes"
            />
            <AttentionCard
              href="#dash-stuck" tone="red" icon={<FlaskConical size={18} />}
              count={attention.stuck.count} title={`jobs stuck ${attention.stuckThresholdDays}+ days`}
              detail={attention.stuck.count > 0 ? `Same status for ${attention.stuckThresholdDays / 7}+ weeks` : "Nothing has stalled"}
              cta="See which"
            />
            <AttentionCard
              href="/jobs?view=wip&status=TO_BE_DELIVERED" tone="green" icon={<Truck size={18} />}
              count={attention.readyToDeliver.count} title="ready to deliver"
              detail="Finished and waiting to go out"
              cta="Plan deliveries"
            />
          </div>
        </section>
      )}

      {kpis.length > 0 && (
        <section className="dash-kpi-row">
          {kpis.map((widget) => {
            const meta = KPI_ICON[widget.key];
            const gold = widget.key === "outstanding-parts" && (attention?.partsOverdue.jobs ?? 0) > 0;
            return (
              <Link key={widget.key} href={WIDGET_HREF[widget.key] ?? "/jobs"} className={`dash-card dash-kpi${gold ? " alert" : ""}`}>
                <div className="dash-kpi-top"><span className={`dash-tile ${meta.tone}`}>{meta.icon}</span><ArrowUpRight size={14} className="dash-kpi-arrow" /></div>
                <div>
                  <div className="dash-kpi-value"><span className="dash-num">{widgetValue(widget.key, data)}</span>{widget.key === "jobs-summary" && data?.completedThisMonth ? <CompletedDelta completed={data.completedThisMonth} /> : null}</div>
                  <div className="dash-kpi-label">{KPI_LABEL[widget.key]}</div>
                </div>
              </Link>
            );
          })}
        </section>
      )}

      <div className="dash-grid">
        <div className="dash-col main">
          {showStatus && (
            <section className="dash-card dash-panel">
              <header className="dash-panel-head">
                <div><h2>Jobs by status</h2><p>Click a bar to open those jobs in Jobs &amp; WIP</p></div>
                <span className="dash-legend"><b className="dash-flag">▲</b> = stuck {attention?.stuckThresholdDays ?? 14}+ days</span>
              </header>
              <div className="dash-status-list">
                {statusRows.length === 0 && <div className="table-state compact-empty-state">No open jobs.</div>}
                {statusRows.map((row) => (
                  <Link key={row.status} href={`/jobs?view=wip&status=${row.status}`} className="dash-srow" title={`Open ${row.count} job${row.count === 1 ? "" : "s"} in ${row.label}`}>
                    <span className="dash-srow-label">{row.label}</span>
                    <div className="dash-bar"><b className={row.stuck > 0 ? "warn" : undefined} style={{ width: `${Math.max(4, (row.count / statusMax) * 100)}%` }} /></div>
                    <span className="dash-num dash-srow-count">{row.count}</span>
                    <span className="dash-srow-flag">{row.stuck > 0 ? `▲ ${row.stuck} stuck` : ""}</span>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {(data?.analyticsSeries?.length ?? 0) > 0 && (
            <section className="dash-chart">
              {/* 2026-09-18, user request: "combine line graphs into 1
                  interactive graph" — one CombinedAnalyticsChart plotting
                  every selected metric together (see that component's own
                  header comment for why a single shared Y-axis is correct).
                  2026-10-06: now with a 3 / 6 / 12 month range switch. */}
              <CombinedAnalyticsChart series={data!.analyticsSeries} title="Activity" subtitle="Jobs per month" rangeSwitch />
            </section>
          )}
        </div>

        <div className="dash-col side">
          {showStatus && attention && (
            <section id="dash-stuck" className="dash-card dash-panel stuck">
              <header className="dash-panel-head">
                <div><h2>Stuck in a status</h2><p>Same status for {attention.stuckThresholdDays}+ days, longest first</p></div>
                <Link href="/jobs?view=wip" className="dash-link">View all <ChevronRight size={12} /></Link>
              </header>
              {stuckJobs.length === 0 && <div className="dash-empty">Nothing stuck. Every open job has moved in the last {attention.stuckThresholdDays} days.</div>}
              {stuckJobs.map((job) => (
                <Link key={job.id} href={`/jobs/${job.id}`} className="dash-row">
                  <div className="dash-row-main"><div className="dash-job">{job.jobNumber}</div><div className="dash-sub">{job.customerName || "—"}</div></div>
                  <div className="dash-row-end"><StatusPill status={job.status} label={job.label} /><div className="dash-flag-line">▲ {plural(job.days, "day", "days")}</div></div>
                </Link>
              ))}
            </section>
          )}

          {on("outstanding-parts") && (
            <section className="dash-card dash-panel">
              <header className="dash-panel-head">
                <div><h2>Parts outstanding</h2><p>Jobs waiting on parts, oldest first</p></div>
                <Link href="/parts" className="dash-link">View all <ChevronRight size={12} /></Link>
              </header>
              {partsJobs.length === 0 && <div className="dash-empty">No outstanding parts.</div>}
              {partsJobs.map((job) => (
                <Link key={job.jobId} href={`/jobs/${job.jobId}`} className="dash-row">
                  <div className="dash-row-main"><div className="dash-job">{job.jobNumber}</div><div className="dash-sub">{job.customerName || "—"}</div></div>
                  <div className="dash-row-end">
                    <div className="dash-row-strong">{plural(job.lines, "line", "lines")}</div>
                    <div className={job.days >= (attention?.overdueThresholdDays ?? 7) ? "dash-flag-line" : "dash-muted-line"}>{job.days >= (attention?.overdueThresholdDays ?? 7) ? "▲ " : ""}{plural(job.days, "day", "days")}</div>
                  </div>
                </Link>
              ))}
            </section>
          )}

          {on("recent-jobs") && (
            <section className="dash-card dash-panel">
              <header className="dash-panel-head">
                <div><h2>Recently updated jobs</h2><p>Latest activity across the workshop</p></div>
                <Link href="/jobs" className="dash-link">View all <ChevronRight size={12} /></Link>
              </header>
              {recentJobs.length === 0 && <div className="dash-empty">No jobs yet.</div>}
              {recentJobs.slice(0, 6).map((job) => (
                <Link key={job.id} href={`/jobs/${job.id}`} className="dash-row">
                  <div className="dash-row-main"><div className="dash-job">{job.jobNumber || "Draft"}</div><div className="dash-sub">{job.customer?.name || "—"}</div></div>
                  <StatusPill status={job.status} />
                </Link>
              ))}
            </section>
          )}
        </div>
      </div>

      {(on("pex-status") || on("support-tickets")) && (
        <div className="dash-bottom">
          {on("pex-status") && (
            <section className="dash-card dash-panel">
              <header className="dash-panel-head"><div><h2>PEX units</h2><p>By status</p></div><Link href="/pex-tracking" className="dash-link">View all <ChevronRight size={12} /></Link></header>
              {pexRows.length === 0 ? <div className="dash-empty">No PEX units on the go.</div> : <StatusBars rows={pexRows} href="/pex-tracking" />}
            </section>
          )}
          {on("support-tickets") && (
            <section className="dash-card dash-panel">
              <header className="dash-panel-head"><div><h2>Support tickets</h2><p>By status</p></div><Link href="/support" className="dash-link">View all <ChevronRight size={12} /></Link></header>
              {ticketRows.length === 0 ? <div className="dash-empty">No support tickets.</div> : <StatusBars rows={ticketRows} href="/support" />}
            </section>
          )}
        </div>
      )}
    </>}
  </div>;
}

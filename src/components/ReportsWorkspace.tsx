"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { CombinedAnalyticsChart, type AnalyticsSeries } from "@/components/AnalyticsLineChart";
import { useTenantPermissions } from "@/components/AppShell";
import { readListState, writeListState } from "@/components/list-state";

// ---------------------------------------------------------------------------
// 2026-10-02 — new "Reports" sidebar section (user request: "Create a
// 'Reports' sidebar button above settings which allows a user to view and
// generate different types of reports... every type of report that can be
// made (Graphs, statistics, etc)"). First batch, confirmed via
// AskUserQuestion: Jobs per customer, Warranty jobs breakdown, Monthly
// reports, Ratios.
//
// Per the dataviz skill's "pick the form" step: jobs-per-customer is a
// magnitude/ranking job (-> a sequential single-hue bar list, sorted desc,
// backed by the full table underneath since the bars alone top out at 10);
// monthly is change-over-time (-> the SAME CombinedAnalyticsChart component
// already built and palette-validated for the Dashboard's own monthly
// analytics — reused as-is rather than inventing a second chart style);
// ratios is a set of single headlines (-> stat tiles, no plot, per the
// skill's own "sometimes the answer is not a chart" guidance); warranty
// breakdown's "per component / per customer" dimensions are categories with
// no single ranking that matters more than the Granted/Declined/Pending
// composition of each one, so each row gets a small composition bar using
// the app's existing reserved status colors (var(--success)/var(--gold-600)/
// var(--danger)) rather than a new categorical palette.
//
// Ratios intentionally does NOT include "quote-to-job conversion" or
// "parts-to-labour cost" as real numbers — see reports/service.ts's header
// comment for why (no Quotes module, no tracked labour cost yet) and the
// user's own "skip for now, flag as future" answer. Those two render as a
// disabled card naming what's missing instead of a fabricated figure.
//
// 2026-10-02 — three follow-up requests, all addressed in this file:
//
// 1. "let me click on a customer then it takes me into that customer for
//    reports" — every customer name in the Jobs-per-customer and Warranty
//    by-customer views is now a .report-customer-link button that calls
//    onSelectCustomer, which focuses that customer and switches to a new
//    "customer" tab (CustomerTab below). Not one of the fixed TABS — it
//    only appears in the tab strip once a customer has been selected, and
//    disappears again (back to Jobs per customer) when cleared.
// 2. "too big and cluttered... professional... its own dashboard view of
//    everything" — two changes: (a) the Monthly chart, which previously
//    had no containing card and stretched edge-to-edge, now sits in a
//    width-capped .detail-panel like every other section (see globals.css's
//    .report-chart-card comment); (b) a new "Overview" tab, first in TABS
//    and the default landing tab, gives the "dashboard of everything" the
//    user asked for — key stat tiles, a top-customers list, a warranty-mix
//    summary and the monthly chart all on one screen, each card linking
//    into its full tab rather than duplicating it.
// 3. "let a user download/export the data" — a quiet "Export CSV" button
//    (see ExportButton) appears on every data tab, gated behind the
//    REPORTS_EXPORT tenant permission that already existed for this exact
//    purpose (see permissions.ts) but had nothing wired to it yet. Export
//    is a client-side CSV built from the same data already on screen — no
//    new backend endpoint needed, since every report here is already a
//    small, fully-loaded JSON payload rather than something paginated.
// ---------------------------------------------------------------------------

type TabKey = "overview" | "jobs-per-customer" | "warranty-breakdown" | "monthly" | "ratios" | "customer";
const TABS: Array<{ key: TabKey; label: string }> = [
  { key: "overview", label: "Overview" },
  { key: "jobs-per-customer", label: "Jobs per customer" },
  { key: "warranty-breakdown", label: "Warranty jobs" },
  { key: "monthly", label: "Monthly" },
  { key: "ratios", label: "Ratios" },
];

// ---------------------------------------------------------------------------
// CSV export — a generic helper plus a small gated button, shared by every
// tab below. Kept deliberately dumb (headers + rows already shaped by the
// caller) rather than trying to serialize an arbitrary object, since each
// report's shape is different enough that a generic serializer would just
// move the formatting decisions here instead of removing them.
// ---------------------------------------------------------------------------
function csvCell(value: string | number): string {
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function downloadCsv(filename: string, headers: string[], rows: Array<Array<string | number>>) {
  const lines = [headers, ...rows].map((row) => row.map(csvCell).join(","));
  // Leading BOM so Excel (the overwhelmingly likely consumer here, per
  // every other export in this app — see ImportExportWorkspace.tsx) opens
  // this as UTF-8 instead of guessing a local codepage for R-prefixed
  // currency amounts.
  const blob = new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function todayStamp(): string {
  return new Date().toISOString().slice(0, 10);
}

function ExportButton({ onExport, label = "Export CSV" }: { onExport: () => void; label?: string }) {
  const { tenantPermissions } = useTenantPermissions();
  if (!tenantPermissions.has("REPORTS_EXPORT")) return null;
  return (
    <button type="button" className="quiet-button" onClick={onExport}>
      <Download size={14} /> {label}
    </button>
  );
}

const MONTH_OPTIONS = [
  { value: 3, label: "Last 3 months" },
  { value: 6, label: "Last 6 months" },
  { value: 12, label: "Last 12 months" },
  { value: 24, label: "Last 24 months" },
  { value: 0, label: "All time" },
];

function MonthsSelect({ months, onChange }: { months: number; onChange: (value: number) => void }) {
  return (
    <select className="filter-select" value={months} onChange={(e) => onChange(Number(e.target.value))} aria-label="Date range">
      {MONTH_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
    </select>
  );
}

function fmtInt(n: number): string { return n.toLocaleString("en-ZA"); }

// ---------------------------------------------------------------------------
// Jobs per customer
// ---------------------------------------------------------------------------
type JobsPerCustomerRow = { customerId: string; customerName: string; total: number; open: number; closed: number; warranty: number };

function CustomerLink({ id, name, onSelect }: { id: string; name: string; onSelect: (id: string, name: string) => void }) {
  return <button type="button" className="report-customer-link" onClick={() => onSelect(id, name)}>{name}</button>;
}

function JobsPerCustomerTab({ months, onMonthsChange, onSelectCustomer }: { months: number; onMonthsChange: (v: number) => void; onSelectCustomer: (id: string, name: string) => void }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [rows, setRows] = useState<JobsPerCustomerRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/v1/reports/jobs-per-customer?months=${months}`, { cache: "no-store" })
      .then(async (r) => { const body = await r.json(); if (!r.ok) throw new Error(body.error?.message || "Unable to load report."); return body; })
      .then((body) => { if (!cancelled) { setRows(body.rows); setError(""); } })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : "Unable to load report."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [months]);

  const top = useMemo(() => rows.slice(0, 10), [rows]);
  const max = useMemo(() => Math.max(...top.map((r) => r.total), 1), [top]);

  function exportRows() {
    downloadCsv(`jobs-per-customer-${todayStamp()}.csv`, ["Customer", "Total jobs", "Open", "Closed", "Warranty"],
      rows.map((r) => [r.customerName, r.total, r.open, r.closed, r.warranty]));
  }

  return (
    <div>
      <div className="header-actions" style={{ marginBottom: 12 }}>
        <MonthsSelect months={months} onChange={onMonthsChange} />
        <ExportButton onExport={exportRows} />
      </div>
      {error ? <div className="inline-error">{error}</div> : null}
      {loading ? <div className="table-state"><Loader2 className="spin" size={16} /> Loading…</div> : <>
        <section className="detail-panel">
          <header><div><h2>Top customers by job count</h2><p>The {top.length} customer{top.length === 1 ? "" : "s"} with the most jobs in this period. Click a customer to see their own reports.</p></div></header>
          {top.length === 0 ? <div className="table-state compact-empty-state">No jobs in this period.</div> : (
            <div className="report-bar-list">
              {top.map((row) => (
                <div key={row.customerId} className="report-bar-row">
                  <span className="report-bar-label"><CustomerLink id={row.customerId} name={row.customerName} onSelect={onSelectCustomer} /></span>
                  <span className="report-bar-track"><span className="report-bar-fill" style={{ width: `${(row.total / max) * 100}%` }} /></span>
                  <span className="report-bar-value">{fmtInt(row.total)}</span>
                </div>
              ))}
            </div>
          )}
        </section>
        <section className="detail-panel" style={{ marginTop: 14 }}>
          <header><div><h2>All customers</h2></div></header>
          <div className="data-table-wrap">
            <table className="data-table">
              <thead><tr><th>Customer</th><th className="numeric">Total jobs</th><th className="numeric">Open</th><th className="numeric">Closed</th><th className="numeric">Warranty</th></tr></thead>
              <tbody>
                {rows.length === 0 && <tr><td colSpan={5} className="table-state compact-empty-state">No jobs in this period.</td></tr>}
                {rows.map((row) => (
                  <tr key={row.customerId}>
                    <td><CustomerLink id={row.customerId} name={row.customerName} onSelect={onSelectCustomer} /></td>
                    <td className="numeric">{fmtInt(row.total)}</td>
                    <td className="numeric">{fmtInt(row.open)}</td>
                    <td className="numeric">{fmtInt(row.closed)}</td>
                    <td className="numeric">{fmtInt(row.warranty)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Warranty jobs breakdown
// ---------------------------------------------------------------------------
type WarrantyRow = { key: string; label: string; total: number; granted: number; declined: number; pending: number; noRecord: number };
type WarrantyBreakdown = { total: WarrantyRow; byComponent: WarrantyRow[]; byCustomer: WarrantyRow[] };

function CompositionBar({ row }: { row: WarrantyRow }) {
  if (row.total === 0) return null;
  const pct = (n: number) => `${(n / row.total) * 100}%`;
  return (
    <span className="report-composition-bar" role="img" aria-label={`${row.granted} granted, ${row.declined} declined, ${row.pending} pending, ${row.noRecord} with no warranty record`}>
      {row.granted > 0 && <span style={{ width: pct(row.granted), background: "var(--success)" }} />}
      {row.declined > 0 && <span style={{ width: pct(row.declined), background: "var(--danger)" }} />}
      {row.pending > 0 && <span style={{ width: pct(row.pending), background: "var(--gold-600)" }} />}
      {row.noRecord > 0 && <span style={{ width: pct(row.noRecord), background: "var(--ink-300)" }} />}
    </span>
  );
}

function WarrantyTable({ title, rows, labelHeading, onSelectCustomer }: { title: string; rows: WarrantyRow[]; labelHeading: string; onSelectCustomer?: (id: string, name: string) => void }) {
  return (
    <section className="detail-panel" style={{ marginTop: 14 }}>
      <header><div><h2>{title}</h2></div></header>
      <div className="data-table-wrap">
        <table className="data-table">
          <thead><tr><th>{labelHeading}</th><th className="numeric">Total</th><th>Status mix</th><th className="numeric">Granted</th><th className="numeric">Declined</th><th className="numeric">Pending</th><th className="numeric">No record</th></tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={7} className="table-state compact-empty-state">No warranty jobs in this period.</td></tr>}
            {rows.map((row) => (
              <tr key={row.key}>
                <td>{onSelectCustomer ? <CustomerLink id={row.key} name={row.label} onSelect={onSelectCustomer} /> : row.label}</td>
                <td className="numeric">{fmtInt(row.total)}</td>
                <td><CompositionBar row={row} /></td>
                <td className="numeric">{fmtInt(row.granted)}</td>
                <td className="numeric">{fmtInt(row.declined)}</td>
                <td className="numeric">{fmtInt(row.pending)}</td>
                <td className="numeric">{fmtInt(row.noRecord)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function WarrantyBreakdownTab({ months, onMonthsChange, onSelectCustomer }: { months: number; onMonthsChange: (v: number) => void; onSelectCustomer: (id: string, name: string) => void }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState<WarrantyBreakdown | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/v1/reports/warranty-breakdown?months=${months}`, { cache: "no-store" })
      .then(async (r) => { const body = await r.json(); if (!r.ok) throw new Error(body.error?.message || "Unable to load report."); return body; })
      .then((body) => { if (!cancelled) { setData(body); setError(""); } })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : "Unable to load report."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [months]);

  function exportRows() {
    if (!data) return;
    downloadCsv(`warranty-breakdown-${todayStamp()}.csv`, ["Scope", "Label", "Total", "Granted", "Declined", "Pending", "No record"], [
      ["Total", data.total.label, data.total.total, data.total.granted, data.total.declined, data.total.pending, data.total.noRecord],
      ...data.byComponent.map((r) => ["Component", r.label, r.total, r.granted, r.declined, r.pending, r.noRecord]),
      ...data.byCustomer.map((r) => ["Customer", r.label, r.total, r.granted, r.declined, r.pending, r.noRecord]),
    ]);
  }

  return (
    <div>
      <div className="header-actions" style={{ marginBottom: 12 }}>
        <MonthsSelect months={months} onChange={onMonthsChange} />
        <ExportButton onExport={exportRows} />
      </div>
      {error ? <div className="inline-error">{error}</div> : null}
      {loading ? <div className="table-state"><Loader2 className="spin" size={16} /> Loading…</div> : data && <>
        <section className="metric-grid compact">
          <article className="metric-card compact"><span>Total warranty jobs</span><strong>{fmtInt(data.total.total)}</strong></article>
          <article className="metric-card compact"><span>Granted</span><strong>{fmtInt(data.total.granted)}</strong></article>
          <article className="metric-card compact"><span>Declined</span><strong>{fmtInt(data.total.declined)}</strong></article>
          <article className="metric-card compact"><span>Pending / no record</span><strong>{fmtInt(data.total.pending + data.total.noRecord)}</strong></article>
        </section>
        <WarrantyTable title="By component" rows={data.byComponent} labelHeading="Component" />
        <WarrantyTable title="By customer" rows={data.byCustomer} labelHeading="Customer" onSelectCustomer={onSelectCustomer} />
      </>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Monthly
// ---------------------------------------------------------------------------
type Customer = { id: string; name: string };

function MonthlyTab() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [months, setMonths] = useState(12);
  const [customerId, setCustomerId] = useState("");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [series, setSeries] = useState<AnalyticsSeries[]>([]);

  useEffect(() => {
    fetch("/api/v1/master-data/customers?pageSize=500", { cache: "no-store" })
      .then((r) => r.json())
      .then((body) => setCustomers((body.items || []).map((c: { id: string; name: string }) => ({ id: c.id, name: c.name }))))
      .catch(() => { /* customer filter is a nice-to-have — a failed fetch just leaves it as "All customers" */ });
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const qs = new URLSearchParams({ months: String(months) });
    if (customerId) qs.set("customerId", customerId);
    fetch(`/api/v1/reports/monthly?${qs.toString()}`, { cache: "no-store" })
      .then(async (r) => { const body = await r.json(); if (!r.ok) throw new Error(body.error?.message || "Unable to load report."); return body; })
      .then((body) => { if (!cancelled) { setSeries(body.series); setError(""); } })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : "Unable to load report."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [months, customerId]);

  function exportSeries() {
    if (series.length === 0) return;
    const months12 = series[0].points.map((p) => p.month);
    downloadCsv(`monthly-report-${todayStamp()}.csv`, ["Month", ...series.map((s) => s.label)],
      months12.map((month, i) => [month, ...series.map((s) => s.points[i]?.value ?? 0)]));
  }

  return (
    <div>
      <div className="header-actions" style={{ marginBottom: 12 }}>
        <select className="filter-select" value={customerId} onChange={(e) => setCustomerId(e.target.value)} aria-label="Customer">
          <option value="">All customers</option>
          {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select className="filter-select" value={months} onChange={(e) => setMonths(Number(e.target.value))} aria-label="Date range">
          <option value={12}>Last 12 months</option>
          <option value={24}>Last 24 months</option>
        </select>
        <ExportButton onExport={exportSeries} />
      </div>
      {error ? <div className="inline-error">{error}</div> : null}
      {loading ? <div className="table-state"><Loader2 className="spin" size={16} /> Loading…</div> : (
        <section className="detail-panel report-chart-card">
          <header><div><h2>Jobs over time</h2><p>Created, completed and warranty jobs per month.</p></div></header>
          <div style={{ padding: "4px 14px 14px" }}><CombinedAnalyticsChart series={series} /></div>
        </section>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ratios
// ---------------------------------------------------------------------------
type RatioStat = { key: string; label: string; format: "percent" | "days" | "currency" | "count"; value: number | null; detail: string; comingSoon?: string };

function formatRatioValue(stat: RatioStat): string {
  if (stat.value == null) return "—";
  switch (stat.format) {
    case "percent": return `${stat.value.toFixed(1)}%`;
    case "days": return `${stat.value.toFixed(1)} days`;
    case "currency": return new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR" }).format(stat.value);
    default: return fmtInt(Math.round(stat.value));
  }
}

function RatiosTab({ months, onMonthsChange }: { months: number; onMonthsChange: (v: number) => void }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [ratios, setRatios] = useState<RatioStat[]>([]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/v1/reports/ratios?months=${months}`, { cache: "no-store" })
      .then(async (r) => { const body = await r.json(); if (!r.ok) throw new Error(body.error?.message || "Unable to load report."); return body; })
      .then((body) => { if (!cancelled) { setRatios(body.ratios); setError(""); } })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : "Unable to load report."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [months]);

  const live = ratios.filter((r) => !r.comingSoon);
  const comingSoon = ratios.filter((r) => r.comingSoon);

  function exportRows() {
    downloadCsv(`ratios-${todayStamp()}.csv`, ["Metric", "Value", "Detail"], live.map((r) => [r.label, formatRatioValue(r), r.detail]));
  }

  return (
    <div>
      <div className="header-actions" style={{ marginBottom: 12 }}>
        <MonthsSelect months={months} onChange={onMonthsChange} />
        <ExportButton onExport={exportRows} />
      </div>
      {error ? <div className="inline-error">{error}</div> : null}
      {loading ? <div className="table-state"><Loader2 className="spin" size={16} /> Loading…</div> : <>
        <section className="metric-grid compact">
          {live.map((stat) => (
            <article key={stat.key} className="metric-card compact">
              <span>{stat.label}</span>
              <strong>{formatRatioValue(stat)}</strong>
              {stat.detail && <span className="report-ratio-detail">{stat.detail}</span>}
            </article>
          ))}
        </section>
        {comingSoon.length > 0 && (
          <section className="detail-panel" style={{ marginTop: 14 }}>
            <header><div><h2>Coming soon</h2><p>Real numbers for these need data this system doesn't track yet — shown here rather than faked.</p></div></header>
            <div className="metric-grid compact">
              {comingSoon.map((stat) => (
                <article key={stat.key} className="metric-card compact report-coming-soon">
                  <span>{stat.label}</span>
                  <strong>—</strong>
                  <span className="report-ratio-detail">{stat.comingSoon}</span>
                </article>
              ))}
            </div>
          </section>
        )}
      </>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Overview — the new "dashboard view of everything" landing tab. Pulls the
// same four report endpoints every other tab already calls individually,
// condenses each into one card, and links each card into its full tab
// rather than re-rendering that tab's whole content here.
// ---------------------------------------------------------------------------
type OverviewData = { jobsRows: JobsPerCustomerRow[]; warranty: WarrantyBreakdown | null; series: AnalyticsSeries[]; ratios: RatioStat[] };

function OverviewTab({ months, onMonthsChange, onNavigate, onSelectCustomer }: { months: number; onMonthsChange: (v: number) => void; onNavigate: (tab: TabKey) => void; onSelectCustomer: (id: string, name: string) => void }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState<OverviewData | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      fetch(`/api/v1/reports/jobs-per-customer?months=${months}`, { cache: "no-store" }).then((r) => r.json()),
      fetch(`/api/v1/reports/warranty-breakdown?months=${months}`, { cache: "no-store" }).then((r) => r.json()),
      fetch(`/api/v1/reports/monthly?months=${months}`, { cache: "no-store" }).then((r) => r.json()),
      fetch(`/api/v1/reports/ratios?months=${months}`, { cache: "no-store" }).then((r) => r.json()),
    ])
      .then(([jobsBody, warrantyBody, monthlyBody, ratiosBody]) => {
        if (cancelled) return;
        setData({ jobsRows: jobsBody.rows || [], warranty: warrantyBody, series: monthlyBody.series || [], ratios: ratiosBody.ratios || [] });
        setError("");
      })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : "Unable to load overview."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [months]);

  const totals = useMemo(() => (data?.jobsRows ?? []).reduce((acc, r) => ({ total: acc.total + r.total, open: acc.open + r.open, closed: acc.closed + r.closed, warranty: acc.warranty + r.warranty }), { total: 0, open: 0, closed: 0, warranty: 0 }), [data]);
  const topCustomers = useMemo(() => (data?.jobsRows ?? []).slice(0, 5), [data]);
  const topMax = useMemo(() => Math.max(...topCustomers.map((r) => r.total), 1), [topCustomers]);

  function ratioValue(key: string): string {
    const stat = data?.ratios.find((r) => r.key === key);
    return stat ? formatRatioValue(stat) : "—";
  }

  return (
    <div>
      <div className="header-actions" style={{ marginBottom: 12 }}><MonthsSelect months={months} onChange={onMonthsChange} /></div>
      {error ? <div className="inline-error">{error}</div> : null}
      {loading ? <div className="table-state"><Loader2 className="spin" size={16} /> Loading…</div> : data && <>
        <section className="metric-grid compact">
          <article className="metric-card compact"><span>Total jobs</span><strong>{fmtInt(totals.total)}</strong></article>
          <article className="metric-card compact"><span>Open jobs</span><strong>{fmtInt(totals.open)}</strong></article>
          <article className="metric-card compact"><span>Warranty jobs</span><strong>{fmtInt(totals.warranty)}</strong></article>
          <article className="metric-card compact"><span>Completion rate</span><strong>{ratioValue("completion-rate")}</strong></article>
          <article className="metric-card compact"><span>On-time delivery</span><strong>{ratioValue("on-time-delivery")}</strong></article>
          <article className="metric-card compact"><span>Avg turnaround</span><strong>{ratioValue("avg-turnaround-days")}</strong></article>
        </section>

        <div className="report-overview-grid" style={{ marginTop: 14 }}>
          <section className="detail-panel">
            <header><div><h2>Top customers</h2><p>By job count in this period. Click one to see their own reports.</p></div><button type="button" className="report-card-link" onClick={() => onNavigate("jobs-per-customer")}>View details →</button></header>
            {topCustomers.length === 0 ? <div className="table-state compact-empty-state">No jobs in this period.</div> : (
              <div className="report-bar-list" style={{ padding: "12px 15px" }}>
                {topCustomers.map((row) => (
                  <div key={row.customerId} className="report-bar-row">
                    <span className="report-bar-label"><CustomerLink id={row.customerId} name={row.customerName} onSelect={onSelectCustomer} /></span>
                    <span className="report-bar-track"><span className="report-bar-fill" style={{ width: `${(row.total / topMax) * 100}%` }} /></span>
                    <span className="report-bar-value">{fmtInt(row.total)}</span>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="detail-panel">
            <header><div><h2>Warranty mix</h2><p>Granted / declined / pending across all warranty jobs.</p></div><button type="button" className="report-card-link" onClick={() => onNavigate("warranty-breakdown")}>View details →</button></header>
            {data.warranty && data.warranty.total.total > 0 ? (
              <div style={{ padding: "12px 15px" }}>
                <CompositionBar row={data.warranty.total} />
                <div style={{ display: "flex", gap: 14, marginTop: 10, fontSize: 11, color: "var(--ink-500)" }}>
                  <span>Granted {fmtInt(data.warranty.total.granted)}</span>
                  <span>Declined {fmtInt(data.warranty.total.declined)}</span>
                  <span>Pending {fmtInt(data.warranty.total.pending)}</span>
                  <span>No record {fmtInt(data.warranty.total.noRecord)}</span>
                </div>
              </div>
            ) : <div className="table-state compact-empty-state">No warranty jobs in this period.</div>}
          </section>
        </div>

        <section className="detail-panel report-chart-card" style={{ marginTop: 14 }}>
          <header><div><h2>Monthly trend</h2><p>Jobs created, completed and warranty jobs, all customers.</p></div><button type="button" className="report-card-link" onClick={() => onNavigate("monthly")}>View details →</button></header>
          <div style={{ padding: "4px 14px 14px" }}><CombinedAnalyticsChart series={data.series} /></div>
        </section>
      </>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Customer drill-down — appears only once a customer has been selected from
// Jobs-per-customer, Warranty-breakdown or Overview (see Shell's
// onSelectCustomer). Assembled from the same three endpoints scoped by
// customerId rather than a dedicated per-customer report — see
// reports/service.ts's header comment for why ratios isn't a fourth one.
// ---------------------------------------------------------------------------
function CustomerTab({ customerId, customerName, months, onMonthsChange, onBack }: { customerId: string; customerName: string; months: number; onMonthsChange: (v: number) => void; onBack: () => void }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [jobsRow, setJobsRow] = useState<JobsPerCustomerRow | null>(null);
  const [warranty, setWarranty] = useState<WarrantyBreakdown | null>(null);
  const [series, setSeries] = useState<AnalyticsSeries[]>([]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const qs = new URLSearchParams({ months: String(months), customerId });
    Promise.all([
      fetch(`/api/v1/reports/jobs-per-customer?${qs.toString()}`, { cache: "no-store" }).then((r) => r.json()),
      fetch(`/api/v1/reports/warranty-breakdown?${qs.toString()}`, { cache: "no-store" }).then((r) => r.json()),
      fetch(`/api/v1/reports/monthly?${qs.toString()}`, { cache: "no-store" }).then((r) => r.json()),
    ])
      .then(([jobsBody, warrantyBody, monthlyBody]) => {
        if (cancelled) return;
        setJobsRow((jobsBody.rows || [])[0] ?? null);
        setWarranty(warrantyBody);
        setSeries(monthlyBody.series || []);
        setError("");
      })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : "Unable to load this customer's reports."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [customerId, months]);

  function exportAll() {
    downloadCsv(`customer-${customerName.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-${todayStamp()}.csv`, ["Metric", "Value"], [
      ["Customer", customerName],
      ["Total jobs", jobsRow?.total ?? 0],
      ["Open", jobsRow?.open ?? 0],
      ["Closed", jobsRow?.closed ?? 0],
      ["Warranty jobs", jobsRow?.warranty ?? 0],
    ]);
  }

  return (
    <div>
      <div className="report-focus-header">
        <div><h2>{customerName}</h2><p>Reports scoped to this customer only.</p></div>
        <button type="button" className="quiet-button" onClick={onBack}>← All customers</button>
      </div>
      <div className="header-actions" style={{ marginBottom: 12 }}>
        <MonthsSelect months={months} onChange={onMonthsChange} />
        <ExportButton onExport={exportAll} />
      </div>
      {error ? <div className="inline-error">{error}</div> : null}
      {loading ? <div className="table-state"><Loader2 className="spin" size={16} /> Loading…</div> : <>
        <section className="metric-grid compact">
          <article className="metric-card compact"><span>Total jobs</span><strong>{fmtInt(jobsRow?.total ?? 0)}</strong></article>
          <article className="metric-card compact"><span>Open</span><strong>{fmtInt(jobsRow?.open ?? 0)}</strong></article>
          <article className="metric-card compact"><span>Closed</span><strong>{fmtInt(jobsRow?.closed ?? 0)}</strong></article>
          <article className="metric-card compact"><span>Warranty jobs</span><strong>{fmtInt(jobsRow?.warranty ?? 0)}</strong></article>
        </section>
        {warranty && warranty.total.total > 0 && <WarrantyTable title="Warranty jobs by component" rows={warranty.byComponent} labelHeading="Component" />}
        <section className="detail-panel report-chart-card" style={{ marginTop: 14 }}>
          <header><div><h2>Monthly trend</h2></div></header>
          <div style={{ padding: "4px 14px 14px" }}><CombinedAnalyticsChart series={series} /></div>
        </section>
      </>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shell
// ---------------------------------------------------------------------------
export function ReportsWorkspace() {
  const [tab, setTab] = useState<TabKey>("overview");
  // 2026-10-09, user request: "When clicking back, let it remember where you were." Remember the last report tab (restored after mount, so the server-rendered markup still matches). The per-customer tab isn't remembered — it only exists once a customer has been picked.
  useEffect(() => {
    const saved = readListState<{ tab: string }>("reports", { tab: "" }).tab;
    if (TABS.some((t) => t.key === saved)) setTab(saved as TabKey);
  }, []);
  useEffect(() => { if (tab !== "customer") writeListState("reports", { tab }); }, [tab]);
  const [months, setMonths] = useState(12);
  const [focusCustomer, setFocusCustomer] = useState<{ id: string; name: string } | null>(null);

  const handleSelectCustomer = useCallback((id: string, name: string) => {
    setFocusCustomer({ id, name });
    setTab("customer");
  }, []);
  const handleBackFromCustomer = useCallback(() => {
    setFocusCustomer(null);
    setTab("jobs-per-customer");
  }, []);

  return (
    <div>
      <header className="page-header compact"><div><p className="eyebrow">Reports</p><h1>Reports</h1><p>Jobs, warranty, monthly trends and ratios across the business.</p></div></header>
      <div className="tab-strip">
        {TABS.map((t) => <button key={t.key} type="button" className={tab === t.key ? "active" : ""} onClick={() => setTab(t.key)}>{t.label}</button>)}
        {focusCustomer && <button type="button" className={tab === "customer" ? "active" : ""} onClick={() => setTab("customer")}>{focusCustomer.name}</button>}
      </div>
      {tab === "overview" && <OverviewTab months={months} onMonthsChange={setMonths} onNavigate={setTab} onSelectCustomer={handleSelectCustomer} />}
      {tab === "jobs-per-customer" && <JobsPerCustomerTab months={months} onMonthsChange={setMonths} onSelectCustomer={handleSelectCustomer} />}
      {tab === "warranty-breakdown" && <WarrantyBreakdownTab months={months} onMonthsChange={setMonths} onSelectCustomer={handleSelectCustomer} />}
      {tab === "monthly" && <MonthlyTab />}
      {tab === "ratios" && <RatiosTab months={months} onMonthsChange={setMonths} />}
      {tab === "customer" && focusCustomer && <CustomerTab customerId={focusCustomer.id} customerName={focusCustomer.name} months={months} onMonthsChange={setMonths} onBack={handleBackFromCustomer} />}
    </div>
  );
}

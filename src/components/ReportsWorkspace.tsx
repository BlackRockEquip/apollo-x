"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { CombinedAnalyticsChart, type AnalyticsSeries } from "@/components/AnalyticsLineChart";

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
// ---------------------------------------------------------------------------

type TabKey = "jobs-per-customer" | "warranty-breakdown" | "monthly" | "ratios";
const TABS: Array<{ key: TabKey; label: string }> = [
  { key: "jobs-per-customer", label: "Jobs per customer" },
  { key: "warranty-breakdown", label: "Warranty jobs" },
  { key: "monthly", label: "Monthly" },
  { key: "ratios", label: "Ratios" },
];

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

function JobsPerCustomerTab({ months, onMonthsChange }: { months: number; onMonthsChange: (v: number) => void }) {
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

  return (
    <div>
      <div className="header-actions" style={{ marginBottom: 12 }}><MonthsSelect months={months} onChange={onMonthsChange} /></div>
      {error ? <div className="inline-error">{error}</div> : null}
      {loading ? <div className="table-state"><Loader2 className="spin" size={16} /> Loading…</div> : <>
        <section className="detail-panel">
          <header><div><h2>Top customers by job count</h2><p>The {top.length} customer{top.length === 1 ? "" : "s"} with the most jobs in this period.</p></div></header>
          {top.length === 0 ? <div className="table-state compact-empty-state">No jobs in this period.</div> : (
            <div className="report-bar-list">
              {top.map((row) => (
                <div key={row.customerId} className="report-bar-row">
                  <span className="report-bar-label">{row.customerName}</span>
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
                    <td>{row.customerName}</td>
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

function WarrantyTable({ title, rows, labelHeading }: { title: string; rows: WarrantyRow[]; labelHeading: string }) {
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
                <td>{row.label}</td>
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

function WarrantyBreakdownTab({ months, onMonthsChange }: { months: number; onMonthsChange: (v: number) => void }) {
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

  return (
    <div>
      <div className="header-actions" style={{ marginBottom: 12 }}><MonthsSelect months={months} onChange={onMonthsChange} /></div>
      {error ? <div className="inline-error">{error}</div> : null}
      {loading ? <div className="table-state"><Loader2 className="spin" size={16} /> Loading…</div> : data && <>
        <section className="metric-grid compact">
          <article className="metric-card compact"><span>Total warranty jobs</span><strong>{fmtInt(data.total.total)}</strong></article>
          <article className="metric-card compact"><span>Granted</span><strong>{fmtInt(data.total.granted)}</strong></article>
          <article className="metric-card compact"><span>Declined</span><strong>{fmtInt(data.total.declined)}</strong></article>
          <article className="metric-card compact"><span>Pending / no record</span><strong>{fmtInt(data.total.pending + data.total.noRecord)}</strong></article>
        </section>
        <WarrantyTable title="By component" rows={data.byComponent} labelHeading="Component" />
        <WarrantyTable title="By customer" rows={data.byCustomer} labelHeading="Customer" />
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
      </div>
      {error ? <div className="inline-error">{error}</div> : null}
      {loading ? <div className="table-state"><Loader2 className="spin" size={16} /> Loading…</div> : <CombinedAnalyticsChart series={series} />}
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

  return (
    <div>
      <div className="header-actions" style={{ marginBottom: 12 }}><MonthsSelect months={months} onChange={onMonthsChange} /></div>
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
// Shell
// ---------------------------------------------------------------------------
export function ReportsWorkspace() {
  const [tab, setTab] = useState<TabKey>("jobs-per-customer");
  const [months, setMonths] = useState(12);

  return (
    <div>
      <header className="page-header compact"><div><p className="eyebrow">Reports</p><h1>Reports</h1><p>Jobs, warranty, monthly trends and ratios across the business.</p></div></header>
      <div className="tab-strip">
        {TABS.map((t) => <button key={t.key} type="button" className={tab === t.key ? "active" : ""} onClick={() => setTab(t.key)}>{t.label}</button>)}
      </div>
      {tab === "jobs-per-customer" && <JobsPerCustomerTab months={months} onMonthsChange={setMonths} />}
      {tab === "warranty-breakdown" && <WarrantyBreakdownTab months={months} onMonthsChange={setMonths} />}
      {tab === "monthly" && <MonthlyTab />}
      {tab === "ratios" && <RatiosTab months={months} onMonthsChange={setMonths} />}
    </div>
  );
}

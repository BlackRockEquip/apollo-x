"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import Link from "next/link";
import { Calendar, ChevronDown, ChevronLeft, ChevronRight, Download, Loader2, Printer, Search } from "lucide-react";
import { CombinedAnalyticsChart, type AnalyticsSeries } from "@/components/AnalyticsLineChart";
import { useTenantPermissions } from "@/components/AppShell";
import { readListState, writeListState } from "@/components/list-state";
import { jobStatusLabelsFor, jobTypeLabelsFor } from "@/lib/jobs/ui";
import { withPoweredBy } from "@/lib/documents/powered-by";
import { ratioBarPercent, ratioGroups, splitRatioValue } from "@/lib/reports/ratio-format";
import { avatarTone, initialsOf, sharePercent } from "@/lib/ui/avatar";
import { TONE_COLORS, statusTone } from "@/lib/ui/job-tone";

// ---------------------------------------------------------------------------
// 2026-10-02 — "Reports" sidebar section: Jobs per customer, Warranty jobs breakdown, Monthly reports, Ratios, plus the Overview landing
// tab and the per-customer drill-down tab (a customer name click-through). Every tab has Print (2026-10-20) and, behind the
// REPORTS_EXPORT permission, Export CSV (client-side CSV built from what is already on screen).
//
// 2026-10-29, user request: "mockup a better spacing and more ui professional design" for every Reports tab, then "Build it". The data
// loading, CSV exports and printing are unchanged; the screen is re-laid out on the shared `rp-` styles in globals.css:
//   - one page header (title, Print, period, Export CSV in one row) and a roomier tab strip, instead of controls scattered above each tab;
//   - summary tiles at the top of every tab;
//   - every section is a card with a header, a divider and generous padding;
//   - tables get avatars, right-aligned tabular numbers, hover rows and a footer;
//   - Monthly gains a month-by-month table under the chart, Ratios are grouped into two sections with a progress bar on percentages.
// The line chart itself is still CombinedAnalyticsChart (hover, keyboard and table view already built there), just no longer width-capped.
// ---------------------------------------------------------------------------

type TabKey = "overview" | "jobs-per-customer" | "warranty-breakdown" | "monthly" | "ratios" | "customer";
const TABS: Array<{ key: TabKey; label: string }> = [
  { key: "overview", label: "Overview" },
  { key: "jobs-per-customer", label: "Jobs per customer" },
  { key: "warranty-breakdown", label: "Warranty jobs" },
  { key: "monthly", label: "Monthly" },
  { key: "ratios", label: "Ratios" },
];

const SUBTITLE = "Jobs, warranty, monthly trends and ratios across the business.";

// ---------------------------------------------------------------------------
// CSV export helper. The page header's Export button calls whatever the open tab registered (see useRegisterExport).
// ---------------------------------------------------------------------------
function csvCell(value: string | number): string {
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function downloadCsv(filename: string, headers: string[], rows: Array<Array<string | number>>) {
  const lines = [headers, ...rows].map((row) => row.map(csvCell).join(","));
  // Leading BOM so Excel opens this as UTF-8 instead of guessing a local codepage for R-prefixed currency amounts.
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

type ExportRef = RefObject<(() => void) | null>;

/** A tab calls this with its own export function; the page header's Export CSV button runs the latest one. */
function useRegisterExport(ref: ExportRef, fn: () => void) {
  useEffect(() => {
    ref.current = fn;
    return () => { if (ref.current === fn) ref.current = null; };
  });
}

function ExportJobsButton({ onExport, label }: { onExport: () => void; label: string }) {
  const { tenantPermissions } = useTenantPermissions();
  if (!tenantPermissions.has("REPORTS_EXPORT")) return null;
  return <button type="button" className="rp-btn" onClick={onExport}><Download size={15} /> {label}</button>;
}

const MONTH_OPTIONS = [
  { value: 3, label: "Last 3 months" },
  { value: 6, label: "Last 6 months" },
  { value: 12, label: "Last 12 months" },
  { value: 24, label: "Last 24 months" },
  { value: 0, label: "All time" },
];

function periodLabel(months: number): string {
  return MONTH_OPTIONS.find((o) => o.value === months)?.label ?? "";
}

function fmtInt(n: number): string { return n.toLocaleString("en-ZA"); }
function fmtDay(value: string | null): string { return value ? new Date(value).toLocaleDateString("en-ZA") : "—"; }

// ---------------------------------------------------------------------------
// Small building blocks shared by every tab
// ---------------------------------------------------------------------------
function PeriodSelect({ months, onChange }: { months: number; onChange: (value: number) => void }) {
  return (
    <label className="rp-select">
      <Calendar size={15} aria-hidden />
      <select value={months} onChange={(e) => onChange(Number(e.target.value))} aria-label="Date range">
        {MONTH_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
      </select>
      <ChevronDown size={15} aria-hidden />
    </label>
  );
}

function Tile({ label, value, unit, hint, dot, tone }: { label: string; value: ReactNode; unit?: string; hint?: string; dot?: string; tone?: "danger" }) {
  return (
    <div className="rp-tile">
      <div className="rp-tile-label">{dot && <span className="rp-dot" style={{ background: dot }} />}{label}</div>
      <div className={`rp-tile-value${tone === "danger" ? " is-danger" : ""}`}>{value}{unit && <span className="rp-tile-unit">{unit}</span>}</div>
      {hint && <div className="rp-tile-hint">{hint}</div>}
    </div>
  );
}

function Card({ title, subtitle, action, children, flush, count }: { title: string; subtitle?: string; action?: ReactNode; children: ReactNode; flush?: boolean; count?: number }) {
  return (
    <section className="rp-card">
      <header className="rp-card-head">
        <div>
          <h2>{title}{count != null && <span className="rp-chip">{count}</span>}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        {action}
      </header>
      <div className={flush ? "rp-card-flush" : "rp-card-body"}>{children}</div>
    </section>
  );
}

function CardLink({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return <button type="button" className="rp-link" onClick={onClick}>{children} <ChevronRight size={14} aria-hidden /></button>;
}

function Loading() {
  return <div className="rp-state"><Loader2 className="spin" size={16} /> Loading…</div>;
}

function Avatar({ name }: { name: string }) {
  const tone = avatarTone(name);
  return <span className="rp-avatar" style={{ background: tone.bg, color: tone.fg }} aria-hidden>{initialsOf(name)}</span>;
}

function CustomerLink({ id, name, onSelect }: { id: string; name: string; onSelect: (id: string, name: string) => void }) {
  return <button type="button" className="rp-name" onClick={() => onSelect(id, name)}>{name}</button>;
}

async function getJson(url: string) {
  const r = await fetch(url, { cache: "no-store" });
  const body = await r.json();
  if (!r.ok) throw new Error(body.error?.message || "Unable to load report.");
  return body;
}

// ---------------------------------------------------------------------------
// Jobs per customer
// ---------------------------------------------------------------------------
type JobsPerCustomerRow = { customerId: string; customerName: string; total: number; open: number; closed: number; warranty: number };

function JobsPerCustomerTab({ months, exportRef, onSelectCustomer }: { months: number; exportRef: ExportRef; onSelectCustomer: (id: string, name: string) => void }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [rows, setRows] = useState<JobsPerCustomerRow[]>([]);
  const [q, setQ] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getJson(`/api/v1/reports/jobs-per-customer?months=${months}`)
      .then((body) => { if (!cancelled) { setRows(body.rows); setError(""); } })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : "Unable to load report."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [months]);

  const top = useMemo(() => rows.slice(0, 10), [rows]);
  const max = useMemo(() => Math.max(...top.map((r) => r.total), 1), [top]);
  const totals = useMemo(() => rows.reduce((acc, r) => ({ total: acc.total + r.total, warranty: acc.warranty + r.warranty }), { total: 0, warranty: 0 }), [rows]);
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return needle ? rows.filter((r) => r.customerName.toLowerCase().includes(needle)) : rows;
  }, [rows, q]);

  useRegisterExport(exportRef, () => {
    downloadCsv(`jobs-per-customer-${todayStamp()}.csv`, ["Customer", "Total jobs", "Open", "Closed", "Warranty"],
      rows.map((r) => [r.customerName, r.total, r.open, r.closed, r.warranty]));
  });

  if (loading) return <Loading />;
  return (
    <>
      {error ? <div className="inline-error">{error}</div> : null}
      <div className="rp-tiles">
        <Tile label="Customers ranked" value={fmtInt(rows.length)} hint={`With jobs in the ${periodLabel(months).toLowerCase()}`} />
        <Tile label="Total jobs" value={fmtInt(totals.total)} hint={periodLabel(months)} />
        <Tile label="Biggest customer" value={rows[0]?.customerName ?? "—"} hint={rows[0] ? `${fmtInt(rows[0].total)} jobs, ${sharePercent(rows[0].total, totals.total, 0)} of all jobs` : "No jobs in this period"} />
        <Tile label="Warranty jobs" value={fmtInt(totals.warranty)} hint={`${sharePercent(totals.warranty, totals.total)} of all jobs`} />
      </div>

      <Card title="Top customers by job count" subtitle={`The ${top.length} customer${top.length === 1 ? "" : "s"} with the most jobs in this period. Click a customer to see their own reports.`}
        action={<span className="rp-legend"><span className="rp-swatch" /> Jobs in period</span>}>
        {top.length === 0 ? <div className="rp-state">No jobs in this period.</div> : (
          <div className="rp-bars">
            {top.map((row, i) => (
              <button type="button" key={row.customerId} className="rp-bar-row" onClick={() => onSelectCustomer(row.customerId, row.customerName)}>
                <span className="rp-bar-rank">{i + 1}</span>
                <span className="rp-bar-name">{row.customerName}</span>
                <span className="rp-bar-track"><span className="rp-bar-fill" style={{ width: `${(row.total / max) * 100}%` }} /></span>
                <span className="rp-bar-value">{fmtInt(row.total)}</span>
                <span className="rp-bar-share">{sharePercent(row.total, totals.total)}</span>
              </button>
            ))}
          </div>
        )}
      </Card>

      <Card title="All customers" count={rows.length} flush
        action={<label className="rp-search"><Search size={15} aria-hidden /><input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search customers" aria-label="Search customers" /></label>}>
        <div className="rp-table-wrap">
          <table className="rp-table">
            <thead><tr><th>Customer</th><th className="num">Total jobs</th><th className="num">Open</th><th className="num">Closed</th><th className="num">Warranty</th><th aria-hidden /></tr></thead>
            <tbody>
              {filtered.length === 0 && <tr><td colSpan={6} className="rp-empty">{rows.length === 0 ? "No jobs in this period." : "No customers match your search."}</td></tr>}
              {filtered.map((row) => (
                <tr key={row.customerId} onClick={() => onSelectCustomer(row.customerId, row.customerName)}>
                  <td><span className="rp-cell-name"><Avatar name={row.customerName} /><CustomerLink id={row.customerId} name={row.customerName} onSelect={onSelectCustomer} /></span></td>
                  <td className="num strong">{fmtInt(row.total)}</td>
                  <td className="num">{fmtInt(row.open)}</td>
                  <td className={`num${row.closed === 0 ? " is-zero" : ""}`}>{fmtInt(row.closed)}</td>
                  <td className="num"><span className={row.warranty > 0 ? "rp-pill-amber" : "is-zero"}>{fmtInt(row.warranty)}</span></td>
                  <td className="rp-chev"><ChevronRight size={16} aria-hidden /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="rp-foot"><span>Showing {fmtInt(filtered.length)} of {fmtInt(rows.length)} customers</span><span>Sorted by total jobs, highest first</span></div>
      </Card>
    </>
  );
}

// ---------------------------------------------------------------------------
// Warranty jobs breakdown
// ---------------------------------------------------------------------------
type WarrantyRow = { key: string; label: string; total: number; granted: number; declined: number; pending: number; noRecord: number };
type WarrantyBreakdown = { total: WarrantyRow; byComponent: WarrantyRow[]; byCustomer: WarrantyRow[] };

// The app's reserved status colours (granted = good, declined = serious, pending = warning) plus a neutral grey for "no record".
const MIX_COLORS = { granted: "var(--success)", declined: "var(--danger)", pending: "#d99a1e", noRecord: "#98a2b3" };

function CompositionBar({ row }: { row: WarrantyRow }) {
  if (row.total === 0) return null;
  const pct = (n: number) => `${(n / row.total) * 100}%`;
  return (
    <span className="rp-mix" role="img" aria-label={`${row.granted} granted, ${row.declined} declined, ${row.pending} pending, ${row.noRecord} with no warranty record`}>
      {row.granted > 0 && <span style={{ width: pct(row.granted), background: MIX_COLORS.granted }} />}
      {row.declined > 0 && <span style={{ width: pct(row.declined), background: MIX_COLORS.declined }} />}
      {row.pending > 0 && <span style={{ width: pct(row.pending), background: MIX_COLORS.pending }} />}
      {row.noRecord > 0 && <span style={{ width: pct(row.noRecord), background: MIX_COLORS.noRecord }} />}
    </span>
  );
}

function MixHead({ label, color }: { label: string; color: string }) {
  return <th className="num"><span className="rp-th-dot"><span className="rp-dot" style={{ background: color }} />{label}</span></th>;
}

function WarrantyTable({ title, rows, labelHeading, onSelectCustomer }: { title: string; rows: WarrantyRow[]; labelHeading: string; onSelectCustomer?: (id: string, name: string) => void }) {
  const cell = (n: number) => <td className={`num${n === 0 ? " is-zero" : ""}`}>{fmtInt(n)}</td>;
  return (
    <Card title={title} count={rows.length} flush>
      <div className="rp-table-wrap">
        <table className="rp-table">
          <thead><tr><th>{labelHeading}</th><th className="num">Total</th><th>Status mix</th><MixHead label="Granted" color={MIX_COLORS.granted} /><MixHead label="Declined" color={MIX_COLORS.declined} /><MixHead label="Pending" color={MIX_COLORS.pending} /><MixHead label="No record" color={MIX_COLORS.noRecord} /><th aria-hidden /></tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={8} className="rp-empty">No warranty jobs in this period.</td></tr>}
            {rows.map((row) => (
              <tr key={row.key} onClick={onSelectCustomer ? () => onSelectCustomer(row.key, row.label) : undefined} className={onSelectCustomer ? "" : "is-static"}>
                <td>{onSelectCustomer ? <span className="rp-cell-name"><Avatar name={row.label} /><CustomerLink id={row.key} name={row.label} onSelect={onSelectCustomer} /></span> : <span className="rp-plain-name">{row.label}</span>}</td>
                <td className="num strong">{fmtInt(row.total)}</td>
                <td><CompositionBar row={row} /></td>
                {cell(row.granted)}{cell(row.declined)}{cell(row.pending)}{cell(row.noRecord)}
                <td className="rp-chev">{onSelectCustomer ? <ChevronRight size={16} aria-hidden /> : null}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function WarrantyBreakdownTab({ months, exportRef, onSelectCustomer }: { months: number; exportRef: ExportRef; onSelectCustomer: (id: string, name: string) => void }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState<WarrantyBreakdown | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getJson(`/api/v1/reports/warranty-breakdown?months=${months}`)
      .then((body) => { if (!cancelled) { setData(body); setError(""); } })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : "Unable to load report."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [months]);

  useRegisterExport(exportRef, () => {
    if (!data) return;
    downloadCsv(`warranty-breakdown-${todayStamp()}.csv`, ["Scope", "Label", "Total", "Granted", "Declined", "Pending", "No record"], [
      ["Total", data.total.label, data.total.total, data.total.granted, data.total.declined, data.total.pending, data.total.noRecord],
      ...data.byComponent.map((r) => ["Component", r.label, r.total, r.granted, r.declined, r.pending, r.noRecord]),
      ...data.byCustomer.map((r) => ["Customer", r.label, r.total, r.granted, r.declined, r.pending, r.noRecord]),
    ]);
  });

  if (loading) return <Loading />;
  return (
    <>
      {error ? <div className="inline-error">{error}</div> : null}
      {data && <>
        <div className="rp-tiles">
          <Tile label="Total warranty jobs" value={fmtInt(data.total.total)} dot="var(--blue-600)" hint={periodLabel(months)} />
          <Tile label="Granted" value={fmtInt(data.total.granted)} dot={MIX_COLORS.granted} hint={`${sharePercent(data.total.granted, data.total.total, 0)} of warranty jobs`} />
          <Tile label="Declined" value={fmtInt(data.total.declined)} dot={MIX_COLORS.declined} hint={`${sharePercent(data.total.declined, data.total.total, 0)} of warranty jobs`} />
          <Tile label="Pending / no record" value={fmtInt(data.total.pending + data.total.noRecord)} dot={MIX_COLORS.pending} hint={`${fmtInt(data.total.pending)} pending, ${fmtInt(data.total.noRecord)} with no record`} />
        </div>
        <WarrantyTable title="By component" rows={data.byComponent} labelHeading="Component" />
        <WarrantyTable title="By customer" rows={data.byCustomer} labelHeading="Customer" onSelectCustomer={onSelectCustomer} />
      </>}
    </>
  );
}

// ---------------------------------------------------------------------------
// Monthly
// ---------------------------------------------------------------------------
type Customer = { id: string; name: string };

function seriesValue(series: AnalyticsSeries[], key: string, index: number): number {
  return series.find((s) => s.key === key)?.points[index]?.value ?? 0;
}

function MonthlyTab({ exportRef }: { exportRef: ExportRef }) {
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
    getJson(`/api/v1/reports/monthly?${qs.toString()}`)
      .then((body) => { if (!cancelled) { setSeries(body.series); setError(""); } })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : "Unable to load report."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [months, customerId]);

  const monthLabels = useMemo(() => (series[0]?.points ?? []).map((p) => p.month), [series]);
  const tableRows = useMemo(() => monthLabels.map((month, i) => ({
    month,
    created: seriesValue(series, "jobs-created", i),
    completed: seriesValue(series, "jobs-completed", i),
    warranty: seriesValue(series, "warranty-jobs", i),
  })).reverse(), [monthLabels, series]);
  const sums = useMemo(() => tableRows.reduce((acc, r) => ({ created: acc.created + r.created, completed: acc.completed + r.completed, warranty: acc.warranty + r.warranty }), { created: 0, completed: 0, warranty: 0 }), [tableRows]);

  useRegisterExport(exportRef, () => {
    if (series.length === 0) return;
    const months12 = series[0].points.map((p) => p.month);
    downloadCsv(`monthly-report-${todayStamp()}.csv`, ["Month", ...series.map((s) => s.label)],
      months12.map((month, i) => [month, ...series.map((s) => s.points[i]?.value ?? 0)]));
  });

  return (
    <>
      <div className="rp-filters header-actions">
        <label className="rp-filter"><span>Customer</span>
          <span className="rp-select">
            <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} aria-label="Customer">
              <option value="">All customers</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <ChevronDown size={15} aria-hidden />
          </span>
        </label>
        <div className="rp-filter"><span>Range</span>
          <div className="rp-seg" role="group" aria-label="Date range">
            <button type="button" aria-pressed={months === 12} className={months === 12 ? "on" : ""} onClick={() => setMonths(12)}>12 months</button>
            <button type="button" aria-pressed={months === 24} className={months === 24 ? "on" : ""} onClick={() => setMonths(24)}>24 months</button>
          </div>
        </div>
      </div>
      {error ? <div className="inline-error">{error}</div> : null}
      {loading ? <Loading /> : <>
        <Card title="Jobs over time" subtitle="Created, completed and warranty jobs per month.">
          <CombinedAnalyticsChart series={series} />
        </Card>
        <Card title="Month by month" count={tableRows.length} flush>
          <div className="rp-table-wrap">
            <table className="rp-table is-static-rows">
              <thead><tr><th>Month</th><th className="num">Created</th><th className="num">Completed</th><th className="num">Warranty</th></tr></thead>
              <tbody>
                {tableRows.length === 0 && <tr><td colSpan={4} className="rp-empty">No data for this period.</td></tr>}
                {tableRows.map((r) => (
                  <tr key={r.month} className="is-static">
                    <td><span className="rp-plain-name">{r.month}</span></td>
                    <td className="num strong">{fmtInt(r.created)}</td>
                    <td className={`num${r.completed === 0 ? " is-zero" : ""}`}>{fmtInt(r.completed)}</td>
                    <td className={`num${r.warranty === 0 ? " is-zero" : ""}`}>{fmtInt(r.warranty)}</td>
                  </tr>
                ))}
              </tbody>
              {tableRows.length > 0 && <tfoot><tr><td>Total</td><td className="num">{fmtInt(sums.created)}</td><td className="num">{fmtInt(sums.completed)}</td><td className="num">{fmtInt(sums.warranty)}</td></tr></tfoot>}
            </table>
          </div>
        </Card>
      </>}
    </>
  );
}

// ---------------------------------------------------------------------------
// Ratios
// ---------------------------------------------------------------------------
type RatioStat = { key: string; label: string; format: "percent" | "days" | "currency" | "count"; value: number | null; detail: string };

function formatRatioValue(stat: RatioStat): string {
  const { value, unit } = splitRatioValue(stat);
  if (!unit) return value;
  return unit === "%" ? `${value}%` : `${value} ${unit}`;
}

function RatiosTab({ months, exportRef }: { months: number; exportRef: ExportRef }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [ratios, setRatios] = useState<RatioStat[]>([]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getJson(`/api/v1/reports/ratios?months=${months}`)
      .then((body) => { if (!cancelled) { setRatios(body.ratios); setError(""); } })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : "Unable to load report."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [months]);

  useRegisterExport(exportRef, () => {
    downloadCsv(`ratios-${todayStamp()}.csv`, ["Metric", "Value", "Detail"], ratios.map((r) => [r.label, formatRatioValue(r), r.detail]));
  });

  const groups = useMemo(() => ratioGroups(ratios), [ratios]);

  if (loading) return <Loading />;
  return (
    <>
      {error ? <div className="inline-error">{error}</div> : null}
      {groups.map((group) => (
        <section key={group.title} className="rp-group">
          <div className="rp-group-head"><h2>{group.title}</h2>{group.note && <p>{group.note}</p>}</div>
          <div className="rp-ratio-grid">
            {group.items.map((stat) => {
              const { value, unit } = splitRatioValue(stat);
              const bar = ratioBarPercent(stat);
              return (
                <article key={stat.key} className="rp-ratio">
                  <div className="rp-ratio-label">{stat.label}</div>
                  <div className="rp-ratio-value">{value}{unit && <span>{unit}</span>}</div>
                  <div className="rp-ratio-bar" role={bar == null ? undefined : "img"} aria-label={bar == null ? undefined : `${stat.label}: ${value} percent`}>
                    {bar != null && <span style={{ width: `${bar}%` }} />}
                  </div>
                  {stat.detail && <div className="rp-ratio-detail">{stat.detail}</div>}
                </article>
              );
            })}
          </div>
        </section>
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------
// Overview — the "dashboard view of everything" landing tab. Pulls the same four report endpoints every other tab calls individually,
// condenses each into one card, and links each card into its full tab.
// ---------------------------------------------------------------------------
type OverviewData = { jobsRows: JobsPerCustomerRow[]; warranty: WarrantyBreakdown | null; series: AnalyticsSeries[]; ratios: RatioStat[] };

function OverviewTab({ months, onNavigate, onSelectCustomer }: { months: number; onNavigate: (tab: TabKey) => void; onSelectCustomer: (id: string, name: string) => void }) {
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

  function ratioTile(key: string, label: string, fallbackHint: string) {
    const stat = data?.ratios.find((r) => r.key === key);
    const { value, unit } = stat ? splitRatioValue(stat) : { value: "—", unit: "" };
    return <Tile label={label} value={value} unit={unit} hint={stat?.detail || fallbackHint} />;
  }

  if (loading) return <Loading />;
  if (!data) return error ? <div className="inline-error">{error}</div> : null;
  const mix = data.warranty?.total;
  const mixParts = mix ? [
    { label: "Granted", count: mix.granted, color: MIX_COLORS.granted },
    { label: "Declined", count: mix.declined, color: MIX_COLORS.declined },
    { label: "Pending", count: mix.pending, color: MIX_COLORS.pending },
    { label: "No warranty record", count: mix.noRecord, color: MIX_COLORS.noRecord },
  ] : [];
  return (
    <>
      {error ? <div className="inline-error">{error}</div> : null}
      <div className="rp-tiles is-six">
        <Tile label="Total jobs" value={fmtInt(totals.total)} hint={periodLabel(months)} />
        <Tile label="Open jobs" value={fmtInt(totals.open)} hint={`${sharePercent(totals.open, totals.total, 0)} of all jobs`} />
        <Tile label="Warranty jobs" value={fmtInt(totals.warranty)} hint={`${sharePercent(totals.warranty, totals.total)} of all jobs`} />
        {ratioTile("completion-rate", "Completion rate", "Closed jobs")}
        {ratioTile("on-time-delivery", "On-time delivery", "Delivered by the ETA")}
        {ratioTile("avg-turnaround-days", "Avg turnaround", "Received to closed")}
      </div>

      <div className="rp-two">
        <Card title="Top customers" subtitle="By job count in this period." action={<CardLink onClick={() => onNavigate("jobs-per-customer")}>View details</CardLink>}>
          {topCustomers.length === 0 ? <div className="rp-state">No jobs in this period.</div> : (
            <div className="rp-bars is-compact">
              {topCustomers.map((row, i) => (
                <button type="button" key={row.customerId} className="rp-bar-row" onClick={() => onSelectCustomer(row.customerId, row.customerName)}>
                  <span className="rp-bar-rank">{i + 1}</span>
                  <span className="rp-bar-name">{row.customerName}</span>
                  <span className="rp-bar-track"><span className="rp-bar-fill" style={{ width: `${(row.total / topMax) * 100}%` }} /></span>
                  <span className="rp-bar-value">{fmtInt(row.total)}</span>
                </button>
              ))}
            </div>
          )}
        </Card>

        <Card title="Warranty mix" subtitle="Granted, declined and pending across all warranty jobs." action={<CardLink onClick={() => onNavigate("warranty-breakdown")}>View details</CardLink>}>
          {mix && mix.total > 0 ? (
            <>
              <div className="rp-bigline"><strong>{fmtInt(mix.total)}</strong><span>warranty jobs in this period</span></div>
              <CompositionBar row={mix} />
              <div className="rp-legend-rows">
                {mixParts.map((p) => (
                  <div key={p.label} className="rp-legend-row">
                    <span className="rp-dot" style={{ background: p.color }} />
                    <span>{p.label}</span>
                    <strong>{fmtInt(p.count)}</strong>
                    <em>{sharePercent(p.count, mix.total)}</em>
                  </div>
                ))}
              </div>
            </>
          ) : <div className="rp-state">No warranty jobs in this period.</div>}
        </Card>
      </div>

      <Card title="Monthly trend" subtitle="Jobs created, completed and warranty jobs, all customers." action={<CardLink onClick={() => onNavigate("monthly")}>View details</CardLink>}>
        <CombinedAnalyticsChart series={data.series} />
      </Card>
    </>
  );
}

// ---------------------------------------------------------------------------
// Customer drill-down — appears only once a customer has been selected from Jobs-per-customer, Warranty-breakdown or Overview (see
// Shell's onSelectCustomer). Assembled from the same endpoints scoped by customerId, plus the customer's own job list.
// ---------------------------------------------------------------------------
type CustomerJobRow = { id: string; jobNumber: string; type: string; status: string; returnedUnrepaired: boolean; dateReceived: string | null; closedAt: string | null; machineModel: string | null; component: string | null };

function CustomerTab({ customerId, customerName, months, exportRef }: { customerId: string; customerName: string; months: number; exportRef: ExportRef }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [jobsRow, setJobsRow] = useState<JobsPerCustomerRow | null>(null);
  const [warranty, setWarranty] = useState<WarrantyBreakdown | null>(null);
  const [series, setSeries] = useState<AnalyticsSeries[]>([]);
  const [jobs, setJobs] = useState<CustomerJobRow[]>([]);
  // Engineering companies see their own status/type wording (same as the Jobs screen).
  const { industryBuild } = useTenantPermissions();
  const statusLabels = jobStatusLabelsFor(industryBuild);
  const typeLabels = jobTypeLabelsFor(industryBuild);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const qs = new URLSearchParams({ months: String(months), customerId });
    Promise.all([
      fetch(`/api/v1/reports/jobs-per-customer?${qs.toString()}`, { cache: "no-store" }).then((r) => r.json()),
      fetch(`/api/v1/reports/warranty-breakdown?${qs.toString()}`, { cache: "no-store" }).then((r) => r.json()),
      fetch(`/api/v1/reports/monthly?${qs.toString()}`, { cache: "no-store" }).then((r) => r.json()),
      fetch(`/api/v1/reports/customer-jobs?${qs.toString()}`, { cache: "no-store" }).then((r) => r.json()),
    ])
      .then(([jobsBody, warrantyBody, monthlyBody, customerJobsBody]) => {
        if (cancelled) return;
        setJobs(customerJobsBody.rows || []);
        setJobsRow((jobsBody.rows || [])[0] ?? null);
        setWarranty(warrantyBody);
        setSeries(monthlyBody.series || []);
        setError("");
      })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : "Unable to load this customer's reports."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [customerId, months]);

  const safeName = customerName.replace(/[^a-z0-9]+/gi, "-").toLowerCase();

  useRegisterExport(exportRef, () => {
    downloadCsv(`customer-${safeName}-${todayStamp()}.csv`, ["Metric", "Value"], [
      ["Customer", customerName],
      ["Total jobs", jobsRow?.total ?? 0],
      ["Open", jobsRow?.open ?? 0],
      ["Closed", jobsRow?.closed ?? 0],
      ["Warranty jobs", jobsRow?.warranty ?? 0],
    ]);
  });

  function exportJobs() {
    downloadCsv(`customer-jobs-${safeName}-${todayStamp()}.csv`, ["Job #", "Job type", "Status", "Date in", "Machine model", "Component", "Closed"],
      jobs.map((j) => [j.jobNumber, typeLabels[j.type as keyof typeof typeLabels] ?? j.type, statusLabels[j.status as keyof typeof statusLabels] ?? j.status, fmtDay(j.dateReceived), j.machineModel ?? "", j.component ?? "", fmtDay(j.closedAt)]));
  }

  if (loading) return <Loading />;
  const total = jobsRow?.total ?? 0;
  return (
    <>
      {error ? <div className="inline-error">{error}</div> : null}
      <div className="rp-tiles">
        <Tile label="Total jobs" value={fmtInt(total)} hint={periodLabel(months)} />
        <Tile label="Open" value={fmtInt(jobsRow?.open ?? 0)} hint={`${sharePercent(jobsRow?.open ?? 0, total, 0)} of their jobs`} />
        <Tile label="Closed" value={fmtInt(jobsRow?.closed ?? 0)} hint={(jobsRow?.closed ?? 0) === 0 ? "None closed yet" : `${sharePercent(jobsRow?.closed ?? 0, total, 0)} of their jobs`} />
        <Tile label="Warranty jobs" value={fmtInt(jobsRow?.warranty ?? 0)} hint={`${sharePercent(jobsRow?.warranty ?? 0, total)} of their jobs`} />
      </div>

      <Card title="Monthly trend" subtitle={`Jobs created, completed and warranty jobs for ${customerName}.`}>
        <CombinedAnalyticsChart series={series} />
      </Card>

      {warranty && warranty.total.total > 0 && <WarrantyTable title="Warranty jobs by component" rows={warranty.byComponent} labelHeading="Component" />}

      <Card title="All jobs" count={jobs.length} flush
        subtitle={`${fmtInt(jobs.length)} job${jobs.length === 1 ? "" : "s"} for this customer in the selected period, newest first.`}
        action={<ExportJobsButton onExport={exportJobs} label="Export jobs CSV" />}>
        <div className="rp-table-wrap">
          <table className="rp-table">
            <thead><tr><th>Job #</th><th>Job type</th><th>Status</th><th>Date in</th><th>Machine model</th><th>Component</th><th>Closed</th></tr></thead>
            <tbody>
              {jobs.length === 0 && <tr><td colSpan={7} className="rp-empty">No jobs for this customer in this period.</td></tr>}
              {jobs.map((j) => {
                const tone = TONE_COLORS[statusTone(j.status)];
                return (
                  <tr key={j.id} className="is-static">
                    <td><Link href={`/jobs/${j.id}`} className="rp-jobno">{j.jobNumber}</Link></td>
                    <td>{typeLabels[j.type as keyof typeof typeLabels] ?? j.type}</td>
                    <td><span className="rp-status" style={{ background: tone.bg, color: tone.fg }}><span className="rp-dot" style={{ background: tone.fg }} />{statusLabels[j.status as keyof typeof statusLabels] ?? j.status}{j.returnedUnrepaired ? " (returned unrepaired)" : ""}</span></td>
                    <td className="soft">{fmtDay(j.dateReceived)}</td>
                    <td>{j.machineModel || "—"}</td>
                    <td className="soft">{j.component || "—"}</td>
                    <td className="soft">{fmtDay(j.closedAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}

// ---------------------------------------------------------------------------
// Print (2026-10-20, user request: "add print buttons on all tabs"). The tab's content is copied into a new window together with the
// app's own stylesheets, with the filter controls left out and the chosen period written in the heading instead. The window is opened
// inside the click so pop-up blockers allow it; the print dialog opens from the new page's own onload.
// ---------------------------------------------------------------------------
function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}

function PrintButton({ title, subtitle }: { title: string; subtitle: string }) {
  const [error, setError] = useState("");

  async function print() {
    setError("");
    const area = document.getElementById("report-print-area");
    if (!area) return;
    const win = window.open("", "_blank");
    if (!win) { setError("Enable pop-ups to print the report."); return; }
    let org = "";
    try {
      const r = await fetch("/api/v1/company-settings/print-details", { cache: "no-store" });
      if (r.ok) org = String((await r.json()).name || "");
    } catch { /* print without the company name */ }
    const styles = Array.from(document.querySelectorAll('link[rel="stylesheet"], style')).map((n) => n.outerHTML).join("");
    const printed = new Date().toLocaleString("en-ZA");
    win.document.write(withPoweredBy(`<!doctype html><html><head><meta charset="utf-8" /><base href="${window.location.origin}/" /><title>${escapeHtml(title)}</title>${styles}<style>
      body{background:#fff;color:#111;margin:0;padding:14px;-webkit-print-color-adjust:exact;print-color-adjust:exact}
      .report-print-head{display:flex;justify-content:space-between;align-items:flex-end;gap:16px;margin-bottom:12px;padding-bottom:8px;border-bottom:2px solid #111}
      .report-print-head h1{margin:0;font-size:18px}
      .report-print-head p{margin:2px 0 0;color:#444;font-size:11px}
      .report-print-head .org{font-size:13px;font-weight:700}
      .header-actions,.report-print-bar,.tab-strip,.rp-search,.rp-link,.rp-chev,.rp-btn{display:none !important}
      .rp-table-wrap{overflow:visible !important}
      .rp-card,.rp-tile,.rp-ratio{break-inside:avoid;box-shadow:none !important}
      @page{margin:10mm}
    </style></head><body>
      <div class="report-print-head"><div><p class="org">${escapeHtml(org)}</p><h1>${escapeHtml(title)}</h1>${subtitle ? `<p>${escapeHtml(subtitle)}</p>` : ""}</div><div><p>Printed ${escapeHtml(printed)}</p></div></div>
      ${area.innerHTML}
      <script>window.onload = function () { setTimeout(function () { window.print(); }, 300); };</script>
    </body></html>`));
    win.document.close();
  }

  return (
    <>
      {error && <span className="jobs-bulk-error">{error}</span>}
      <button type="button" className="rp-btn" onClick={() => void print()} title="Print this tab"><Printer size={15} /> Print</button>
    </>
  );
}

function HeaderExportButton({ exportRef }: { exportRef: ExportRef }) {
  const { tenantPermissions } = useTenantPermissions();
  if (!tenantPermissions.has("REPORTS_EXPORT")) return null;
  return <button type="button" className="rp-btn is-gold" onClick={() => exportRef.current?.()}><Download size={15} /> Export CSV</button>;
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
  const exportRef = useRef<(() => void) | null>(null);

  const handleSelectCustomer = useCallback((id: string, name: string) => {
    setFocusCustomer({ id, name });
    setTab("customer");
  }, []);
  const handleBackFromCustomer = useCallback(() => {
    setFocusCustomer(null);
    setTab("jobs-per-customer");
  }, []);

  const onCustomer = tab === "customer" && focusCustomer;
  const tabLabel = TABS.find((t) => t.key === tab)?.label ?? "";
  const showPeriod = tab !== "monthly";
  const showExport = tab !== "overview";

  return (
    <div className="rp">
      {onCustomer && (
        <button type="button" className="rp-back" onClick={handleBackFromCustomer}><ChevronLeft size={16} aria-hidden /> All customers</button>
      )}
      <header className="rp-head">
        <div>
          <p className="eyebrow">Reports</p>
          <h1>{onCustomer ? focusCustomer.name : "Reports"}</h1>
          <p className="rp-sub">{onCustomer ? "Reports scoped to this customer only." : SUBTITLE}</p>
        </div>
        <div className="rp-actions">
          <PrintButton
            title={onCustomer ? `Reports - ${focusCustomer.name}` : `Reports - ${tabLabel}`}
            subtitle={tab === "monthly" ? "" : `Period: ${periodLabel(months)}`}
          />
          {showPeriod && <PeriodSelect months={months} onChange={setMonths} />}
          {showExport && <HeaderExportButton exportRef={exportRef} />}
        </div>
      </header>
      <nav className="rp-tabs tab-strip" role="tablist" aria-label="Report sections">
        {TABS.map((t) => <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} className={tab === t.key ? "active" : ""} onClick={() => setTab(t.key)}>{t.label}</button>)}
        {focusCustomer && <button type="button" role="tab" aria-selected={tab === "customer"} className={tab === "customer" ? "active" : ""} onClick={() => setTab("customer")}>{focusCustomer.name}</button>}
      </nav>
      <div id="report-print-area" className="rp-body">
        {tab === "overview" && <OverviewTab months={months} onNavigate={setTab} onSelectCustomer={handleSelectCustomer} />}
        {tab === "jobs-per-customer" && <JobsPerCustomerTab months={months} exportRef={exportRef} onSelectCustomer={handleSelectCustomer} />}
        {tab === "warranty-breakdown" && <WarrantyBreakdownTab months={months} exportRef={exportRef} onSelectCustomer={handleSelectCustomer} />}
        {tab === "monthly" && <MonthlyTab exportRef={exportRef} />}
        {tab === "ratios" && <RatiosTab months={months} exportRef={exportRef} />}
        {tab === "customer" && focusCustomer && <CustomerTab customerId={focusCustomer.id} customerName={focusCustomer.name} months={months} exportRef={exportRef} />}
      </div>
    </div>
  );
}

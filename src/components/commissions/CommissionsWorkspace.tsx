"use client";

import "./commissions.css";
import { useCallback, useEffect, useMemo, useState } from "react";
import { FileDown, Loader2, Pencil, Plus, Trash2, Wallet, X } from "lucide-react";
import { MONTH_STATUS_LABELS, type MonthResult } from "@/lib/commissions/calc";
import { LineDialog } from "./LineDialog";
import { printRepStatement } from "./printStatement";
import {
  commissionsApi, formatDate, formatMoney, formatMoneyShort, initials, monthLabel, parseMoney, repRule, shortMonth, yearMonths,
  type LineView, type Overview, type RepView,
} from "./types";

type Tab = "tracker" | "payouts" | "reps";

// ---------------------------------------------------------------------------
// Commissions (2026-11-25): sales rep commission per month, worked out the way the company's spreadsheet does it (see
// src/lib/commissions/calc.ts). Company Admins only, and only those with the module switched on in their user profile.
// ---------------------------------------------------------------------------
export function CommissionsWorkspace() {
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<Tab>("tracker");
  const [repId, setRepId] = useState("");
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [month, setMonth] = useState("");
  const [editing, setEditing] = useState<LineView | "new" | null>(null);
  const [paying, setPaying] = useState<{ rep: RepView; month: string; owed: number } | null>(null);
  const [exporting, setExporting] = useState<{ repId: string; month: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const body = await commissionsApi<Overview>("/api/v1/commissions");
      setData(body); setError("");
      setRepId((current) => current && body.reps.some((r) => r.id === current) ? current : (body.reps.find((r) => r.setting && r.active) ?? body.reps[0])?.id ?? "");
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to load commissions."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => { void load(); }, 0);
    return () => clearTimeout(timer);
  }, [load]);

  const rep = data?.reps.find((r) => r.id === repId) ?? null;

  // Until a month is clicked: this month if the rep has something in it, else the latest month they have something in that year.
  const activeMonth = (() => {
    if (month && month.startsWith(String(year))) return month;
    if (!data || !rep) return "";
    const months = Object.keys(rep.months).filter((m) => m.startsWith(String(year))).sort();
    const current = data.today.slice(0, 7);
    if (months.length > 0) return months.includes(current) ? current : months[months.length - 1];
    return current.startsWith(String(year)) ? current : `${year}-01`;
  })();

  const owedRows = useMemo(() => {
    if (!data) return [];
    const rows: Array<{ rep: RepView; result: MonthResult }> = [];
    for (const r of data.reps) for (const result of Object.values(r.months)) if (result.owed > 0.004) rows.push({ rep: r, result });
    const rank: Record<string, number> = { OVERDUE: 0, PART_PAID: 1, DUE: 2, WAITING_CLIENT: 3 };
    return rows.sort((a, b) => (rank[a.result.status] ?? 9) - (rank[b.result.status] ?? 9) || a.result.month.localeCompare(b.result.month));
  }, [data]);
  const overdueCount = owedRows.filter((row) => row.result.status === "OVERDUE" || row.result.status === "PART_PAID").length;

  if (loading) return <div className="table-state"><Loader2 className="spin" size={20} /> Loading…</div>;

  const years = Array.from(new Set([new Date().getFullYear(), ...(data?.lines ?? []).map((l) => Number(l.periodMonth.slice(0, 4)))])).sort((a, b) => b - a);

  return (
    <div>
      <header className="page-header compact">
        <div><p className="eyebrow">Sales</p><h1>Commissions</h1><p>Sales rep commission per month. Profit on each invoiced job first covers the rep&rsquo;s monthly target; commission is their rate on what the month makes above it.</p></div>
        <div className="cm-row">
          <label className="cm-field" style={{ minWidth: 110 }}><span>Year</span><select value={year} onChange={(e) => { setYear(Number(e.target.value)); setMonth(""); }}>{years.map((y) => <option key={y} value={y}>{y}</option>)}</select></label>
          {data?.canEdit && tab === "tracker" && <button type="button" className="gold-button" style={{ alignSelf: "end" }} onClick={() => setEditing("new")}><Plus size={15} /> Add invoiced job</button>}
        </div>
      </header>
      {error && <div className="inline-error">{error}</div>}
      {data && (
        <>
          <div className="cm-tabs" role="tablist">
            <button type="button" role="tab" aria-selected={tab === "tracker"} onClick={() => setTab("tracker")}>Tracker</button>
            <button type="button" role="tab" aria-selected={tab === "payouts"} onClick={() => setTab("payouts")}>Payouts{overdueCount > 0 && <span className="cm-badge">{overdueCount}</span>}</button>
            <button type="button" role="tab" aria-selected={tab === "reps"} onClick={() => setTab("reps")}>Rep settings</button>
          </div>
          {data.reps.length === 0 && <div className="cm-banner">No sales representatives yet. Add them under Settings &gt; Users &gt; User Setup, then set each one&rsquo;s rate and target on the Rep settings tab.</div>}
          {tab === "tracker" && rep && <TrackerTab data={data} rep={rep} year={year} month={activeMonth} onRep={(id) => { setRepId(id); setMonth(""); }} onMonth={setMonth} onEdit={(line) => setEditing(line)} onPay={(m, owed) => setPaying({ rep, month: m, owed })} onExport={() => setExporting({ repId: rep.id, month: activeMonth })} onChanged={load} />}
          {tab === "payouts" && <PayoutsTab data={data} year={year} onPay={(r, m, owed) => setPaying({ rep: r, month: m, owed })} onExport={(id) => setExporting({ repId: id || repId, month: "" })} onChanged={load} />}
          {tab === "reps" && <RepSettingsTab data={data} onChanged={load} />}
        </>
      )}
      {editing && data && <LineDialog reps={data.reps} line={editing === "new" ? null : editing} defaultRepId={repId} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void load(); }} />}
      {exporting && data && <ExportDialog data={data} year={year} initialRepId={exporting.repId} initialMonth={exporting.month} onClose={() => setExporting(null)} />}
      {paying && <PayoutDialog rep={paying.rep} month={paying.month} owed={paying.owed} today={data?.today ?? ""} onClose={() => setPaying(null)} onSaved={() => { setPaying(null); void load(); }} />}
    </div>
  );
}

function StatusPill({ result }: { result: Pick<MonthResult, "status" | "dueOn" | "paidInvoices" | "totalInvoices"> }) {
  let text = MONTH_STATUS_LABELS[result.status];
  if (result.status === "WAITING_CLIENT") text += ` · ${result.paidInvoices} of ${result.totalInvoices} paid`;
  if ((result.status === "DUE" || result.status === "OVERDUE") && result.dueOn) text += ` · ${formatDate(result.dueOn)}`;
  return <span className={`cm-pill cm-pill-${result.status}`}>{text}</span>;
}

function TrackerTab({ data, rep, year, month, onRep, onMonth, onEdit, onPay, onExport, onChanged }: {
  data: Overview; rep: RepView; year: number; month: string; onRep: (id: string) => void; onMonth: (m: string) => void;
  onEdit: (line: LineView) => void; onPay: (month: string, owed: number) => void; onExport: () => void; onChanged: () => Promise<void>;
}) {
  const months = yearMonths(year);
  const inYear = months.map((m) => rep.months[m]).filter((r): r is MonthResult => Boolean(r));
  const fuel = data.fuel.filter((f) => f.salesRepresentativeId === rep.id && f.month.startsWith(String(year)));
  const fuelTotal = fuel.reduce((sum, f) => sum + f.amount, 0);
  const result = rep.months[month] ?? null;
  const lines = data.lines.filter((l) => l.salesRepresentativeId === rep.id && l.periodMonth === month);
  const byId = new Map(lines.map((l) => [l.id, l]));
  const ordered = result ? result.lines.map((r) => ({ line: byId.get(r.id)!, calc: r })).filter((row) => row.line) : [];
  const target = rep.setting?.monthlyTarget ?? 0;
  const pct = target > 0 && result ? Math.max(0, Math.min(1, result.profit / target)) : 0;
  const [busy, setBusy] = useState("");

  async function removeLine(line: LineView) {
    if (!window.confirm(`Delete ${line.jobReference} from ${rep.name}'s commission? This changes the month's figures.`)) return;
    setBusy(line.id);
    try { await commissionsApi(`/api/v1/commissions/lines/${line.id}`, { method: "DELETE" }); await onChanged(); }
    catch (e) { window.alert(e instanceof Error ? e.message : "Could not delete."); }
    finally { setBusy(""); }
  }

  return (
    <>
      <div className="cm-row" style={{ justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
        <div className="cm-reps" role="group" aria-label="Sales reps" style={{ marginBottom: 0 }}>
          {data.reps.map((r) => (
            <button key={r.id} type="button" className="cm-rep" aria-pressed={r.id === rep.id} onClick={() => onRep(r.id)}>
              <i>{initials(r.name)}</i><span><b>{r.name}{!r.active && " (inactive)"}</b><small>{repRule(r.setting)}</small></span>
            </button>
          ))}
        </div>
        <button type="button" className="quiet-button" onClick={onExport}><FileDown size={14} /> Export statement</button>
      </div>

      {!rep.setting && <div className="cm-banner">{rep.name} has no commission rate yet. Set it on the Rep settings tab before adding jobs.</div>}

      <div className="cm-kpis">
        <div className="cm-kpi"><span>Commission earned · {year}</span><b>{formatMoney(inYear.reduce((s, r) => s + r.commission, 0))}</b><small>{inYear.reduce((s, r) => s + r.lineCount, 0)} invoiced jobs</small></div>
        <div className="cm-kpi"><span>Paid out</span><b className="cm-good">{formatMoney(inYear.reduce((s, r) => s + r.paid, 0))}</b><small>{inYear.some((r) => r.overpaid > 0.004) ? `Includes ${formatMoney(inYear.reduce((s, r) => s + r.overpaid, 0))} paid over` : `Recorded payouts for ${year}`}</small></div>
        <div className="cm-kpi"><span>Not paid yet</span><b className="cm-bad">{formatMoney(inYear.reduce((s, r) => s + r.owed, 0))}</b><small>Due, overdue or waiting on clients</small></div>
        <div className="cm-kpi"><span>Fuel used · not in commission</span><b>{fuelTotal ? formatMoney(fuelTotal) : "Not entered"}</b><small>{fuel.length ? `${fuel.length} month${fuel.length > 1 ? "s" : ""} entered · avg ${formatMoneyShort(fuelTotal / fuel.length)}` : "Add it per month below"}</small></div>
      </div>

      <section className="cm-card">
        <header><h2>Months in {year}</h2><span className="cm-sub">{target > 0 ? "Bar = profit counted against the monthly target" : "No target: commission on every job"}</span></header>
        <div className="cm-months">
          {months.map((m) => {
            const r = rep.months[m];
            const f = data.fuel.find((x) => x.salesRepresentativeId === rep.id && x.month === m);
            const p = r && target > 0 ? Math.max(0, Math.min(1, r.profit / target)) : r ? 1 : 0;
            return (
              <button key={m} type="button" className={`cm-month${r ? "" : " empty"}`} aria-pressed={m === month} onClick={() => onMonth(m)}>
                <em>{shortMonth(m)}</em>
                <div className="cm-bar"><i style={{ width: `${Math.round(p * 100)}%`, background: r && r.targetMet ? "#1d7a46" : "#c07a00" }} /></div>
                <b>{r ? formatMoneyShort(r.commission) : "—"}</b>
                <small>{r ? (target > 0 ? (r.targetMet ? "Target met" : `Short ${formatMoneyShort(target - r.profit)}`) : `${r.lineCount} jobs`) : "Nothing yet"}</small>
                <small>{f ? `Fuel ${formatMoneyShort(f.amount)}` : "Fuel —"}</small>
              </button>
            );
          })}
        </div>
      </section>

      {month && (
        <div className="cm-split">
          <section className="cm-card">
            <header>
              <h2>{monthLabel(month, true)}</h2>
              {result && <StatusPill result={result} />}
              {data.canEdit && result && result.owed > 0.004 && <button type="button" className="quiet-button" onClick={() => onPay(month, result.owed)}><Wallet size={14} /> Record payment</button>}
            </header>
            <div className="cm-body">
              {!result && <div className="cm-sub">No invoiced jobs in {monthLabel(month, true)} yet.</div>}
              {result && target > 0 && (
                <>
                  <div className="cm-target"><i style={{ width: `${Math.round(pct * 100)}%`, background: result.targetMet ? "#1d7a46" : "#c07a00" }} /></div>
                  <div className="cm-target-text"><span>{result.targetMet ? `Target met when ${result.metById ?? "a job"} was invoiced` : `${formatMoney(target - result.profit)} still to go before commission starts`}</span><span>Target {formatMoney(target)}</span></div>
                  <div className="cm-calc">
                    <span>Month profit <strong>{formatMoney(result.profit)}</strong></span><span className="op">−</span>
                    <span>target <strong>{formatMoney(target)}</strong></span><span className="op">=</span>
                    <span><strong>{formatMoney(result.aboveTarget)}</strong> above target</span><span className="op">×</span>
                    <span><strong>{Math.round(result.rate * 10000) / 100}%</strong></span><span className="op">=</span>
                    <span className="total">{formatMoney(result.commission)}</span>
                  </div>
                </>
              )}
              {result && target <= 0 && <div className="cm-calc"><span>No target: commission on every job&rsquo;s profit. Profit <strong>{formatMoney(result.profit)}</strong></span><span className="op">=</span><span className="total">{formatMoney(result.commission)}</span></div>}
              {result && result.paid > 0 && <div className={`cm-sub${result.overpaid > 0.004 ? " cm-bad" : ""}`} style={{ marginTop: 8 }}>Paid {formatMoney(result.paid)}{result.owed > 0.004 ? ` · ${formatMoney(result.owed)} still owed` : ""}{result.overpaid > 0.004 ? ` · ${formatMoney(result.overpaid)} more than due (not carried over)` : ""}</div>}
            </div>
          </section>
          <FuelBox key={`${rep.id}-${month}-${data.fuel.find((f) => f.salesRepresentativeId === rep.id && f.month === month)?.amount ?? 0}`} data={data} rep={rep} month={month} profit={result?.profit ?? 0} onChanged={onChanged} />
        </div>
      )}

      {month && result && (
        <section className="cm-card">
          <div className="data-table-wrap">
            <table className="data-table cm-table">
              <thead><tr>
                <th>Job / invoice</th><th>Invoiced</th><th>Description</th><th className="cm-num">Amount ex VAT</th><th className="cm-num">Costs</th><th className="cm-num">Fuel / other</th><th className="cm-num">Profit</th>
                <th className="cm-num">{target > 0 ? "Target balance" : "Commission"}</th><th>Client payment</th>{data.canEdit && <th aria-label="Actions" />}
              </tr></thead>
              <tbody>
                {ordered.map(({ line, calc }) => {
                  const first = line.invoices.map((i) => i.invoicedOn).sort()[0];
                  const paidAll = line.invoices.every((i) => i.clientPaidOn);
                  const lastPaid = line.invoices.map((i) => i.clientPaidOn).filter(Boolean).sort().pop() ?? null;
                  return (
                    <tr key={line.id}>
                      <td><strong>{line.jobReference}</strong><span className="cm-sub">Inv {line.invoices.map((i) => i.invoiceNumber).join(" / ")}</span></td>
                      <td>{formatDate(first ?? null)}</td>
                      <td className="wrap">{line.description || <span className="muted">—</span>}{line.notes && <span className="cm-sub">{line.notes}</span>}</td>
                      <td className="cm-num">{formatMoney(calc.invoiced)}</td>
                      <td className="cm-num">{formatMoney(line.costsTotal)}</td>
                      <td className="cm-num">{line.fuelCharge || line.otherExpenses ? formatMoney(line.fuelCharge + line.otherExpenses) : "—"}{line.otherExpensesNote && <span className="cm-sub">{line.otherExpensesNote}</span>}</td>
                      <td className="cm-num"><strong>{formatMoney(calc.profit)}</strong></td>
                      <td className="cm-num">
                        {target > 0 && calc.balanceAfter !== null
                          ? <><span className={calc.balanceAfter < 0 ? "cm-warn" : "cm-good"} style={{ fontWeight: 600 }}>{calc.balanceAfter < 0 ? `${formatMoney(-calc.balanceAfter)} to go` : `${formatMoney(calc.balanceAfter)} over`}</span>{calc.metTarget && <span className="cm-met">Target met here</span>}</>
                          : <><strong>{formatMoney(calc.commission ?? 0)}</strong><span className="cm-sub">{line.noCommission ? "No commission" : `${Math.round((line.rateOverride ?? rep.setting?.rate ?? 0) * 10000) / 100}%`}</span></>}
                      </td>
                      <td><span className={paidAll ? "cm-good" : "cm-warn"} style={{ fontSize: 12, fontWeight: 600 }}>{paidAll ? `Client paid ${formatDate(lastPaid)}` : line.invoices.some((i) => i.clientPaidOn) ? "Part paid by client" : "Client not paid yet"}</span></td>
                      {data.canEdit && <td><div className="cm-actions"><button type="button" className="cm-icon" aria-label={`Edit ${line.jobReference}`} onClick={() => onEdit(line)}><Pencil size={13} /></button><button type="button" className="cm-icon danger" aria-label={`Delete ${line.jobReference}`} disabled={busy === line.id} onClick={() => void removeLine(line)}><Trash2 size={13} /></button></div></td>}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="cm-note">Profit = amount − costs − fuel charge (other than self) − other expenses. {target > 0 ? `Each month starts ${formatMoney(target)} short; every job's profit (or loss) moves the balance, and commission is the rate on what the month ends above target.` : "Commission is the rate on each job's profit."} Due at the end of the month after the client&rsquo;s final payment.</div>
        </section>
      )}
    </>
  );
}

// The rep's own fuel spend for the month: for keeping an eye on cost only, never taken off commission.
function FuelBox({ data, rep, month, profit, onChanged }: { data: Overview; rep: RepView; month: string; profit: number; onChanged: () => Promise<void> }) {
  const saved = data.fuel.find((f) => f.salesRepresentativeId === rep.id && f.month === month)?.amount ?? 0;
  const [text, setText] = useState(saved ? String(saved) : "");
  const [state, setState] = useState<"" | "saving" | "saved" | "error">("");

  async function save() {
    const amount = parseMoney(text);
    if (Math.abs(amount - saved) < 0.005) return;
    setState("saving");
    try { await commissionsApi("/api/v1/commissions/fuel", { method: "PUT", body: { salesRepresentativeId: rep.id, month, amount: amount || null } }); setState("saved"); await onChanged(); }
    catch { setState("error"); }
  }

  return (
    <section className="cm-card">
      <header><h2>Fuel used · {monthLabel(month)}</h2></header>
      <div className="cm-body" style={{ display: "grid", gap: 10 }}>
        <p className="cm-sub" style={{ margin: 0 }}>{rep.name}&rsquo;s own fuel for the month. For keeping an eye on cost only; it is not taken off commission.</p>
        <label className="cm-field"><span>Amount</span>
          <div className="cm-money"><span>R</span><input inputMode="decimal" placeholder="0.00" value={text} disabled={!data.canEdit} onChange={(e) => { setText(e.target.value); setState(""); }} onBlur={() => void save()} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} /></div>
        </label>
        <span className="cm-sub">{state === "saving" ? "Saving…" : state === "saved" ? "Saved" : state === "error" ? "Could not save - try again" : saved ? (profit > 0 ? `Fuel is ${((saved / profit) * 100).toFixed(1)}% of this month's profit (${formatMoney(profit)})` : "No profit this month to compare against") : `Not entered for ${monthLabel(month)}`}</span>
      </div>
    </section>
  );
}

// 2026-11-25: every month in the year that has commission or a payment, with the amount due and the amount paid side by side.
// A month paid above what it works out to shows the difference; it is never carried into another month.
function PayoutsTab({ data, year, onPay, onExport, onChanged }: { data: Overview; year: number; onPay: (rep: RepView, month: string, owed: number) => void; onExport: (repId: string) => void; onChanged: () => Promise<void> }) {
  const [repFilter, setRepFilter] = useState("");
  const repName = (id: string) => data.reps.find((r) => r.id === id)?.name ?? "—";
  const rows = data.reps.filter((r) => !repFilter || r.id === repFilter).flatMap((r) => Object.values(r.months)
    .filter((m) => m.month.startsWith(String(year)) && (m.commission > 0.004 || m.paid > 0.004))
    .map((result) => ({ rep: r, result })))
    .sort((a, b) => a.rep.name.localeCompare(b.rep.name) || a.result.month.localeCompare(b.result.month));
  const allOwed = data.reps.flatMap((r) => Object.values(r.months)).filter((m) => m.owed > 0.004);
  const dueNow = allOwed.filter((m) => m.status !== "WAITING_CLIENT").reduce((s, m) => s + m.owed, 0);
  const waiting = allOwed.filter((m) => m.status === "WAITING_CLIENT").reduce((s, m) => s + m.owed, 0);
  const totals = rows.reduce((t, { result }) => ({ due: t.due + result.commission, paid: t.paid + result.paid, owed: t.owed + result.owed, over: t.over + result.overpaid }), { due: 0, paid: 0, owed: 0, over: 0 });
  const payments = data.payouts.filter((p) => p.month.startsWith(String(year)) && (!repFilter || p.salesRepresentativeId === repFilter));

  async function removePayout(id: string) {
    if (!window.confirm("Delete this payment record? The month will show as not paid again.")) return;
    try { await commissionsApi(`/api/v1/commissions/payouts/${id}`, { method: "DELETE" }); await onChanged(); }
    catch (e) { window.alert(e instanceof Error ? e.message : "Could not delete."); }
  }

  return (
    <>
      <div className="cm-kpis">
        <div className="cm-kpi"><span>Due now (client has paid)</span><b className="cm-bad">{formatMoney(dueNow)}</b><small>Due, overdue and part-paid months</small></div>
        <div className="cm-kpi"><span>Earned, waiting on client payment</span><b className="cm-warn">{formatMoney(waiting)}</b><small>Becomes due once the clients pay</small></div>
        <div className="cm-kpi"><span>Paid · {year}{repFilter ? ` · ${repName(repFilter)}` : ""}</span><b className="cm-good">{formatMoney(totals.paid)}</b><small>Against {formatMoney(totals.due)} due</small></div>
        <div className="cm-kpi"><span>Paid more than due · {year}</span><b className={totals.over > 0.004 ? "cm-bad" : ""}>{formatMoney(totals.over)}</b><small>Shown per month, not carried over</small></div>
      </div>
      <section className="cm-card">
        <header>
          <h2>Commission by month · {year}</h2>
          <label className="cm-field" style={{ minWidth: 170 }}><span className="sr-only">Sales rep</span><select aria-label="Sales rep" value={repFilter} onChange={(e) => setRepFilter(e.target.value)}><option value="">All reps</option>{data.reps.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
          <button type="button" className="quiet-button" onClick={() => onExport(repFilter)}><FileDown size={14} /> Export statement</button>
        </header>
        {rows.length === 0 ? <div className="cm-empty">No commission or payments in {year}.</div> : (
          <div className="data-table-wrap">
            <table className="data-table cm-table">
              <thead><tr><th>Rep</th><th>Month</th><th className="cm-num">Amount due</th><th className="cm-num">Amount paid</th><th className="cm-num">Difference</th><th>Status</th>{data.canEdit && <th aria-label="Actions" />}</tr></thead>
              <tbody>
                {rows.map(({ rep, result }) => (
                  <tr key={`${rep.id}-${result.month}`}>
                    <td><strong>{rep.name}</strong></td><td>{monthLabel(result.month)}</td>
                    <td className="cm-num"><strong>{formatMoney(result.commission)}</strong></td>
                    <td className="cm-num">{result.paid ? formatMoney(result.paid) : "—"}</td>
                    <td className="cm-num">{result.overpaid > 0.004 ? <span className="cm-bad">{formatMoney(result.overpaid)} paid over</span> : result.owed > 0.004 ? <span className="cm-warn">{formatMoney(result.owed)} still owed</span> : "—"}</td>
                    <td><StatusPill result={result} /></td>
                    {data.canEdit && <td>{result.owed > 0.004 && <button type="button" className="quiet-button" onClick={() => onPay(rep, result.month, result.owed)}><Wallet size={13} /> Record payment</button>}</td>}
                  </tr>
                ))}
              </tbody>
              <tfoot><tr>
                <td colSpan={2}><strong>Total</strong></td>
                <td className="cm-num"><strong>{formatMoney(totals.due)}</strong></td>
                <td className="cm-num"><strong>{formatMoney(totals.paid)}</strong></td>
                <td className="cm-num">{totals.owed > 0.004 && <span className="cm-warn">{formatMoney(totals.owed)} still owed</span>}{totals.owed > 0.004 && totals.over > 0.004 && <br />}{totals.over > 0.004 && <span className="cm-bad">{formatMoney(totals.over)} paid over</span>}</td>
                <td />{data.canEdit && <td />}
              </tr></tfoot>
            </table>
          </div>
        )}
      </section>
      <section className="cm-card">
        <header><h2>Payments recorded · {year}</h2></header>
        {payments.length === 0 ? <div className="cm-empty">No payments recorded for {year}.</div> : (
          <div className="data-table-wrap">
            <table className="data-table cm-table">
              <thead><tr><th>Paid on</th><th>Rep</th><th>For month</th><th className="cm-num">Amount</th><th>Note</th>{data.canEdit && <th aria-label="Actions" />}</tr></thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id}>
                    <td>{formatDate(p.paidOn)}</td><td>{repName(p.salesRepresentativeId)}</td><td>{monthLabel(p.month)}</td><td className="cm-num">{formatMoney(p.amount)}</td><td className="wrap">{p.note || <span className="muted">—</span>}</td>
                    {data.canEdit && <td><button type="button" className="cm-icon danger" aria-label="Delete payment" onClick={() => void removePayout(p.id)}><Trash2 size={13} /></button></td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

// Export a commission statement for ONE rep (so no rep ever sees another's figures), for the whole year or one month.
function ExportDialog({ data, year, initialRepId, initialMonth, onClose }: { data: Overview; year: number; initialRepId: string; initialMonth: string; onClose: () => void }) {
  const [repId, setRepId] = useState(data.reps.some((r) => r.id === initialRepId) ? initialRepId : data.reps[0]?.id ?? "");
  const [period, setPeriod] = useState<"year" | "month">(initialMonth ? "month" : "year");
  const [month, setMonth] = useState(initialMonth || `${year}-${String(new Date().getMonth() + 1).padStart(2, "0")}`);
  const [includeJobs, setIncludeJobs] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true); setError("");
    const months = period === "year" ? yearMonths(year) : [month];
    const message = await printRepStatement(data, { repId, months, includeJobs, title: period === "year" ? String(year) : monthLabel(month, true) });
    setBusy(false);
    if (message) setError(message); else onClose();
  }

  return (
    <div className="drawer-backdrop" role="dialog" aria-modal="true" aria-label="Export commission statement">
      <div className="form-drawer compact-dialog" style={{ maxWidth: 480 }}>
        <div className="cm-dialog">
          <div className="cm-row"><h2>Export commission statement</h2><button type="button" className="cm-icon" aria-label="Close" onClick={onClose}><X size={15} /></button></div>
          <p className="cm-sub" style={{ margin: 0 }}>A statement for one rep to send them: amount due and paid per month, each job and the payments. Use Save as PDF in the print window. Fuel used is not included.</p>
          {error && <div className="inline-error" style={{ borderRadius: 7 }}>{error}</div>}
          <label className="cm-field"><span>Sales rep</span><select value={repId} onChange={(e) => setRepId(e.target.value)}>{data.reps.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
          <div className="cm-grid2">
            <label className="cm-field"><span>Period</span><select value={period} onChange={(e) => setPeriod(e.target.value as "year" | "month")}><option value="year">Whole year {year}</option><option value="month">One month</option></select></label>
            {period === "month" && <label className="cm-field"><span>Month</span><select value={month} onChange={(e) => setMonth(e.target.value)}>{yearMonths(year).map((m) => <option key={m} value={m}>{monthLabel(m, true)}</option>)}</select></label>}
          </div>
          <label className="cm-check"><input type="checkbox" checked={includeJobs} onChange={(e) => setIncludeJobs(e.target.checked)} /> Include each job (invoice, costs, profit, target balance)</label>
          <div className="cm-foot">
            <button type="button" className="quiet-button" onClick={onClose} disabled={busy}>Cancel</button>
            <button type="button" className="gold-button" onClick={() => void run()} disabled={busy || !repId}><FileDown size={14} /> {busy ? "Preparing…" : "Export"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function RepSettingsTab({ data, onChanged }: { data: Overview; onChanged: () => Promise<void> }) {
  return (
    <section className="cm-card">
      <header><h2>Commission rate and monthly target per rep</h2></header>
      {data.reps.length === 0 ? <div className="cm-empty">No sales representatives yet.</div> : (
        <div className="data-table-wrap">
          <table className="data-table cm-table">
            <thead><tr><th>Sales rep</th><th>Commission rate</th><th>Monthly target (cost to company)</th><th /></tr></thead>
            <tbody>{data.reps.map((rep) => <RepSettingRow key={rep.id} rep={rep} canEdit={data.canEdit} onChanged={onChanged} />)}</tbody>
          </table>
        </div>
      )}
      <div className="cm-note">The target is the profit a rep&rsquo;s jobs must cover each month before commission starts (their cost to company). Leave it at 0 for commission on every job. Sales reps themselves are added and switched off under Settings &gt; Users &gt; User Setup.</div>
    </section>
  );
}

function RepSettingRow({ rep, canEdit, onChanged }: { rep: RepView; canEdit: boolean; onChanged: () => Promise<void> }) {
  const [rate, setRate] = useState(rep.setting ? String(Math.round(rep.setting.rate * 10000) / 100) : "");
  const [target, setTarget] = useState(rep.setting ? String(rep.setting.monthlyTarget) : "");
  const [state, setState] = useState<"" | "saving" | "saved">("");
  const [error, setError] = useState("");
  const rateNumber = Number(rate);
  const valid = rate.trim() !== "" && rateNumber >= 0 && rateNumber <= 100;

  async function save() {
    setState("saving"); setError("");
    try { await commissionsApi(`/api/v1/commissions/reps/${rep.id}`, { method: "PUT", body: { ratePercent: rateNumber, monthlyTarget: parseMoney(target) } }); setState("saved"); await onChanged(); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not save."); setState(""); }
  }

  return (
    <tr>
      <td><strong>{rep.name}</strong>{!rep.active && <span className="cm-sub">Inactive</span>}{!rep.setting && <span className="cm-sub cm-warn">Not set up yet</span>}</td>
      <td><div className="cm-money" style={{ maxWidth: 140, paddingLeft: 0, paddingRight: 9 }}><input aria-label={`${rep.name} commission rate`} inputMode="decimal" value={rate} disabled={!canEdit} onChange={(e) => { setRate(e.target.value); setState(""); }} placeholder="15" /><span>%</span></div></td>
      <td><div className="cm-money" style={{ maxWidth: 200 }}><span>R</span><input aria-label={`${rep.name} monthly target`} inputMode="decimal" value={target} disabled={!canEdit} onChange={(e) => { setTarget(e.target.value); setState(""); }} placeholder="0 = no target" /></div></td>
      <td>{canEdit && <span className="cm-row"><button type="button" className="quiet-button" disabled={!valid || state === "saving"} onClick={() => void save()}>{state === "saving" ? "Saving…" : "Save"}</button>{state === "saved" && <span className="cm-sub cm-good">Saved</span>}{error && <span className="cm-sub cm-bad">{error}</span>}</span>}</td>
    </tr>
  );
}

function PayoutDialog({ rep, month, owed, today, onClose, onSaved }: { rep: RepView; month: string; owed: number; today: string; onClose: () => void; onSaved: () => void }) {
  const [amount, setAmount] = useState(owed.toFixed(2));
  const [paidOn, setPaidOn] = useState(today);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    setSaving(true); setError("");
    try { await commissionsApi("/api/v1/commissions/payouts", { method: "POST", body: { salesRepresentativeId: rep.id, month, amount: parseMoney(amount), paidOn, note } }); onSaved(); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not save."); setSaving(false); }
  }

  return (
    <div className="drawer-backdrop" role="dialog" aria-modal="true" aria-label="Record commission payment">
      <div className="form-drawer compact-dialog" style={{ maxWidth: 460 }}>
        <div className="cm-dialog">
          <div className="cm-row"><h2>Record payment</h2><button type="button" className="cm-icon" aria-label="Close" onClick={onClose}><X size={15} /></button></div>
          <div className="cm-sub">{rep.name} · commission for {monthLabel(month, true)} · {formatMoney(owed)} still owed</div>
          {error && <div className="inline-error" style={{ borderRadius: 7 }}>{error}</div>}
          <div className="cm-grid2">
            <label className="cm-field"><span>Amount paid</span><div className="cm-money"><span>R</span><input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></div></label>
            <label className="cm-field"><span>Paid on</span><input type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} /></label>
          </div>
          <label className="cm-field"><span>Note</span><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. with November payroll" /></label>
          <div className="cm-foot">
            <button type="button" className="quiet-button" onClick={onClose} disabled={saving}>Cancel</button>
            <button type="button" className="gold-button" disabled={saving || parseMoney(amount) <= 0 || !paidOn} onClick={() => void save()}>{saving ? "Saving…" : "Record payment"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

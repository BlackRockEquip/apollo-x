"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2, Search } from "lucide-react";
import { jobStatusLabelsFor, jobTypeLabelsFor } from "@/lib/jobs/ui";
import { customerJobSide, statusTone } from "@/lib/ui/job-tone";
import { useTenantPermissions } from "./AppShell";
import { PartyTile, fmtDay, plural } from "./PartyBits";

// The "Jobs" section of a customer's page (work received / sent back) and of a supplier's page (outwork sent / received back) — 2026-10-29.
// One hook loads the data, so the tiles above and the table below always agree.

type Kind = "customers" | "suppliers";

export type CustomerJobItem = { id: string; jobNumber: string; type: string; status: string; returnedUnrepaired: boolean; machine: string | null; component: string | null; dateIn: string | null; eta: string | null; delivered: string | null; overdue: boolean };
export type SupplierOutworkItem = { id: string; jobId: string; jobNumber: string; customer: string | null; description: string; quantity: number; status: string; state: "out" | "overdue" | "received"; sentAt: string | null; receivedAt: string | null; days: number };
type Paging = { total: number; page: number; pageSize: number };
export type CustomerJobsData = Paging & { summary: { total: number; inWorkshop: number; sentBack: number; overdue: number; warranty: number; warrantyShare: string }; counts: { received: number; sent: number; all: number }; items: CustomerJobItem[] };
export type SupplierJobsData = Paging & { summary: { out: number; overdue: number; receivedBack: number; avgTurnaround: number | null }; counts: { sent: number; received: number; all: number }; items: SupplierOutworkItem[] };

export type JobsState = {
  kind: Kind;
  side: string;
  setSide: (v: string) => void;
  q: string;
  setQ: (v: string) => void;
  page: number;
  setPage: (v: number) => void;
  data: CustomerJobsData | SupplierJobsData | null;
  loading: boolean;
  problem: "" | "forbidden" | "error";
};

export function usePartyJobs(kind: Kind, id: string): JobsState {
  const [side, setSideRaw] = useState(kind === "customers" ? "received" : "sent");
  const [q, setQRaw] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<CustomerJobsData | SupplierJobsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [problem, setProblem] = useState<"" | "forbidden" | "error">("");

  useEffect(() => {
    let live = true;
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ side, q, page: String(page), pageSize: "10" });
        const r = await fetch(`/api/v1/${kind}/${id}/jobs?${params}`, { cache: "no-store" });
        if (!live) return;
        if (r.status === 403) { setProblem("forbidden"); setData(null); return; }
        if (!r.ok) { setProblem("error"); return; }
        setData(await r.json());
        setProblem("");
      } catch {
        if (live) setProblem("error");
      } finally {
        if (live) setLoading(false);
      }
    }, q ? 250 : 0);
    return () => { live = false; clearTimeout(timer); };
  }, [kind, id, side, q, page]);

  return { kind, side, setSide: (v) => { setSideRaw(v); setPage(1); }, q, setQ: (v) => { setQRaw(v); setPage(1); }, page, setPage, data, loading, problem };
}

export function PartyJobsTiles({ jobs }: { jobs: JobsState }) {
  if (!jobs.data) return null;
  if (jobs.kind === "customers") {
    const s = (jobs.data as CustomerJobsData).summary;
    return (
      <div className="pt-tiles">
        <PartyTile label="In the workshop" value={s.inWorkshop.toLocaleString("en-ZA")} hint="Received, not yet sent back" />
        <PartyTile label="Overdue ETA" value={s.overdue.toLocaleString("en-ZA")} hint="Past the ETA date" danger={s.overdue > 0} />
        <PartyTile label="Sent back" value={s.sentBack.toLocaleString("en-ZA")} hint="Ready, delivered or complete" />
        <PartyTile label="Warranty jobs" value={s.warranty.toLocaleString("en-ZA")} hint={`${s.warrantyShare} of their jobs`} />
      </div>
    );
  }
  const s = (jobs.data as SupplierJobsData).summary;
  return (
    <div className="pt-tiles">
      <PartyTile label="Out with supplier" value={s.out.toLocaleString("en-ZA")} hint="Sent, not yet received back" />
      <PartyTile label="Overdue" value={s.overdue.toLocaleString("en-ZA")} hint="Out for more than 7 days" danger={s.overdue > 0} />
      <PartyTile label="Received back" value={s.receivedBack.toLocaleString("en-ZA")} hint="Last 90 days" />
      <PartyTile label="Avg turnaround" value={s.avgTurnaround == null ? "—" : `${s.avgTurnaround} days`} hint="Sent to received" />
    </div>
  );
}

const TONE_CLASS = { work: "is-blue", wait: "is-amber", done: "is-green", neutral: "is-grey" } as const;

export function PartyJobsCard({ jobs, partyName }: { jobs: JobsState; partyName: string }) {
  const { industryBuild } = useTenantPermissions();
  const statusLabels = jobStatusLabelsFor(industryBuild);
  const typeLabels = jobTypeLabelsFor(industryBuild);
  const isCustomers = jobs.kind === "customers";
  const d = jobs.data;
  const counts = d ? (d.counts as Record<string, number>) : null;
  const segments: Array<[string, string]> = isCustomers ? [["received", "Received"], ["sent", "Sent back"], ["all", "All"]] : [["sent", "Sent out"], ["received", "Received back"], ["all", "All"]];
  const first = d && d.total > 0 ? (d.page - 1) * d.pageSize + 1 : 0;
  const last = d ? Math.min(d.total, d.page * d.pageSize) : 0;
  const pages = d ? Math.max(1, Math.ceil(d.total / d.pageSize)) : 1;
  const noun = isCustomers ? "job" : "item";

  return (
    <section className="pt-card">
      <div className="pt-card-head">
        <div>
          <h2>{isCustomers ? "Jobs" : "Outwork"}</h2>
          <p>{isCustomers ? `Work received from ${partyName} and what has gone back to them.` : `Items sent to ${partyName} and what has come back. “Sent out” means still with the supplier.`}</p>
        </div>
        <Link className="pt-link" href={isCustomers ? "/jobs" : "/outwork"}>{isCustomers ? "Open in Jobs & WIP →" : "Open Outwork →"}</Link>
      </div>
      <div className="pt-toolbar">
        <div className="pt-seg" role="group" aria-label="Show">
          {segments.map(([v, label]) => (
            <button key={v} type="button" className={jobs.side === v ? "on" : ""} aria-pressed={jobs.side === v} onClick={() => jobs.setSide(v)}>
              {label}{counts ? <span className="pt-seg-count">{(counts[v] ?? 0).toLocaleString("en-ZA")}</span> : null}
            </button>
          ))}
        </div>
        <label className="pt-search">
          <Search size={15} />
          <input aria-label="Search" value={jobs.q} onChange={(e) => jobs.setQ(e.target.value)} placeholder={isCustomers ? "Search this customer’s jobs…" : "Search job, customer or description…"} />
        </label>
      </div>
      {jobs.problem === "forbidden" ? (
        <div className="pt-state">You don’t have access to Jobs, so the {isCustomers ? "job" : "outwork"} list isn’t shown here.</div>
      ) : jobs.problem === "error" && !d ? (
        <div className="pt-state">Couldn’t load the {isCustomers ? "jobs" : "outwork"}. Try again in a moment.</div>
      ) : !d ? (
        <div className="pt-state"><Loader2 className="spin" size={18} />Loading…</div>
      ) : d.items.length === 0 ? (
        <div className="pt-state">{jobs.q ? `No ${noun}s match “${jobs.q}”.` : `No ${noun}s in this view yet.`}</div>
      ) : isCustomers ? (
        <div className={`pt-table-wrap${jobs.loading ? " is-busy" : ""}`}>
          <table className="pt-table">
            <thead>
              <tr><th>Job #</th><th>Type</th><th>Status</th><th>Machine</th><th>Component</th><th>Date in</th><th>{jobs.side === "sent" ? "Delivered" : jobs.side === "received" ? "ETA" : "ETA / delivered"}</th></tr>
            </thead>
            <tbody>
              {(d.items as CustomerJobItem[]).map((j) => {
                const label = j.returnedUnrepaired ? "Returned unrepaired" : statusLabels[j.status as keyof typeof statusLabels] ?? j.status;
                const tone = TONE_CLASS[statusTone(j.returnedUnrepaired ? "RETURNED_UNREPAIRED" : j.status)];
                const sentBack = customerJobSide(j.status, j.returnedUnrepaired) === "sent";
                const dateCell = sentBack ? fmtDay(j.delivered) : j.eta ? fmtDay(j.eta) : "—";
                return (
                  <tr key={j.id}>
                    <td><Link href={`/jobs/${j.id}`} className="pt-jobno">{j.jobNumber}</Link></td>
                    <td className="pt-soft">{typeLabels[j.type as keyof typeof typeLabels] ?? j.type}</td>
                    <td><span className={`pt-pill ${tone}`}>{label}</span></td>
                    <td className="pt-soft">{j.machine || "—"}</td>
                    <td className="pt-soft">{j.component || "—"}</td>
                    <td className="pt-soft pt-nowrap">{fmtDay(j.dateIn)}</td>
                    <td className={`pt-nowrap ${j.overdue ? "pt-overdue" : "pt-soft"}`}>{dateCell}{j.overdue ? <small> overdue</small> : null}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className={`pt-table-wrap${jobs.loading ? " is-busy" : ""}`}>
          <table className="pt-table">
            <thead>
              <tr><th>Job #</th><th>Customer</th><th>Description</th><th className="num">Qty</th><th>Status</th><th>Sent</th><th>Received</th><th className="num">Days</th></tr>
            </thead>
            <tbody>
              {(d.items as SupplierOutworkItem[]).map((i) => (
                <tr key={i.id}>
                  <td><Link href={`/jobs/${i.jobId}`} className="pt-jobno">{i.jobNumber}</Link></td>
                  <td className="pt-soft">{i.customer || "—"}</td>
                  <td className="pt-desc">{i.description}</td>
                  <td className="num">{i.quantity}</td>
                  <td><span className={`pt-pill ${i.state === "received" ? "is-green" : i.state === "overdue" ? "is-red" : "is-blue"}`}>{i.state === "received" ? "Received back" : i.state === "overdue" ? "Overdue" : "With supplier"}</span></td>
                  <td className="pt-soft pt-nowrap">{fmtDay(i.sentAt)}</td>
                  <td className="pt-soft pt-nowrap">{fmtDay(i.receivedAt)}</td>
                  <td className={`num${i.state === "overdue" ? " pt-overdue" : ""}`}>{i.sentAt ? i.days : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {d && d.items.length > 0 ? (
        <footer className="pt-foot">
          <span>Showing {first} to {last} of {plural(d.total, noun)}</span>
          <div className="pt-pager">
            <button type="button" disabled={d.page <= 1} onClick={() => jobs.setPage(d.page - 1)}><ChevronLeft size={15} /> Previous</button>
            <button type="button" disabled={d.page >= pages} onClick={() => jobs.setPage(d.page + 1)}>Next <ChevronRight size={15} /></button>
          </div>
        </footer>
      ) : null}
    </section>
  );
}

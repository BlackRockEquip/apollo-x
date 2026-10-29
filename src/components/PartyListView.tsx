"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2, Plus, Search } from "lucide-react";
import { ScrollRestore } from "./ScrollRestore";
import { PartyAvatar, PartyTile, fmtDay, plural } from "./PartyBits";

// The Customers / Suppliers list page (2026-10-29 redesign). MasterDataWorkspace still owns the data, the edit drawer, merge and clone;
// this component only draws the header, the tiles, the table and the pager, so every action behaves exactly as before.

type Kind = "customers" | "suppliers";
type Row = Record<string, unknown> & { id: string };
type CustomerStats = { openJobs: number; jobs12m: number; lastJobAt: string | null };
type SupplierStats = { workOut: number; overdue: number };

export type PartyListProps = {
  kind: Kind;
  title: string;
  eyebrow: string;
  description: string;
  singular: string;
  cloneLabel?: string;
  rows: Row[];
  total: number;
  page: number;
  pages: number;
  pageSize: number;
  loading: boolean;
  error: string;
  notice: { text: string; href: string; linkText: string } | null;
  onDismissNotice: () => void;
  q: string;
  onQ: (v: string) => void;
  status: string;
  onStatus: (v: string) => void;
  activity: "all" | "open";
  onActivity: (v: "all" | "open") => void;
  onPage: (p: number) => void;
  canClone: boolean;
  cloningId: string;
  onClone: (row: Row) => void;
  onEdit: (row: Row) => void;
  onNew: () => void;
  onMerge: () => void;
  tilesKey: number;
};

type CustomerSummary = { active: number; inactive: number; withOpenJobs: number | null; openJobs: number | null; onHold: number };
type SupplierSummary = { active: number; inactive: number; rfqReady: number; workOut: number | null; overdue: number | null; brands: number };

function num(v: number | null | undefined) {
  return v == null ? "—" : v.toLocaleString("en-ZA");
}

function PartyTiles({ kind, reloadKey }: { kind: Kind; reloadKey: number }) {
  const [data, setData] = useState<CustomerSummary | SupplierSummary | null>(null);
  useEffect(() => {
    let live = true;
    fetch(`/api/v1/${kind}/summary`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((b) => { if (live) setData(b); })
      .catch(() => { if (live) setData(null); });
    return () => { live = false; };
  }, [kind, reloadKey]);
  if (kind === "customers") {
    const s = data as CustomerSummary | null;
    return (
      <div className="pt-tiles">
        <PartyTile label="Active customers" value={num(s?.active)} hint={s ? `${s.inactive} inactive account${s.inactive === 1 ? "" : "s"}` : " "} />
        <PartyTile label="With open jobs" value={num(s?.withOpenJobs)} hint="Customers with work in the workshop" />
        <PartyTile label="Open jobs" value={num(s?.openJobs)} hint="Across all active customers" />
        <PartyTile label="Accounts on hold" value={num(s?.onHold)} hint="Marked on hold on the account" danger={Boolean(s && s.onHold > 0)} />
      </div>
    );
  }
  const s = data as SupplierSummary | null;
  return (
    <div className="pt-tiles">
      <PartyTile label="Active suppliers" value={num(s?.active)} hint={s ? `${s.rfqReady} can receive RFQs` : " "} />
      <PartyTile label="Items out with suppliers" value={num(s?.workOut)} hint="Sent and not yet received back" />
      <PartyTile label="Overdue returns" value={num(s?.overdue)} hint="Out for more than 7 days" danger={Boolean(s && s.overdue)} />
      <PartyTile label="Brands covered" value={num(s?.brands)} hint="Linked to active suppliers" />
    </div>
  );
}

function openJobsPill(n: number) {
  return n > 0 ? <span className="pt-pill is-blue">{n}</span> : <span className="pt-zero">—</span>;
}

export function PartyListView(p: PartyListProps) {
  const isCustomers = p.kind === "customers";
  const first = p.total === 0 ? 0 : (p.page - 1) * p.pageSize + 1;
  const last = Math.min(p.total, p.page * p.pageSize);
  const word = p.title.toLowerCase();
  return (
    <div className="pt">
      <header className="pt-head">
        <div>
          <p className="eyebrow">{p.eyebrow}</p>
          <h1>{p.title}</h1>
          <p className="pt-sub">{p.description}</p>
        </div>
        <div className="pt-actions">
          <button type="button" className="pt-btn" onClick={p.onMerge}>Merge {word}</button>
          <button type="button" className="pt-btn is-gold" onClick={p.onNew}><Plus size={16} /> New {p.singular.toLowerCase()}</button>
        </div>
      </header>

      <PartyTiles kind={p.kind} reloadKey={p.tilesKey} />

      <section className="pt-card">
        <div className="pt-toolbar">
          <label className="pt-search">
            <Search size={15} />
            <input aria-label={`Search ${p.title}`} value={p.q} onChange={(e) => p.onQ(e.target.value)} placeholder={`Search ${word}, contacts or ${isCustomers ? "branches" : "brands"}…`} />
          </label>
          <div className="pt-seg" role="group" aria-label="Status filter">
            {[["active", "Active"], ["inactive", "Inactive"], ["all", "All"]].map(([v, label]) => (
              <button key={v} type="button" className={p.status === v ? "on" : ""} aria-pressed={p.status === v} onClick={() => p.onStatus(v)}>{label}</button>
            ))}
          </div>
          <button type="button" className={`pt-chipbtn${p.activity === "open" ? " on" : ""}`} aria-pressed={p.activity === "open"} onClick={() => p.onActivity(p.activity === "open" ? "all" : "open")}>
            {isCustomers ? "Has open jobs" : "Has work out"}
          </button>
          <span className="pt-count">{plural(p.total, p.singular.toLowerCase())}</span>
        </div>
        {p.error && <div className="inline-error pt-msg">{p.error}</div>}
        {p.notice && (
          <div className="inline-success pt-msg pt-notice">
            <span>{p.notice.text}</span>
            <Link className="pt-link" href={p.notice.href}>{p.notice.linkText}</Link>
            <button type="button" className="pt-link" onClick={p.onDismissNotice}>Dismiss</button>
          </div>
        )}
        {p.loading ? (
          <div className="pt-state"><Loader2 className="spin" size={18} />Loading…</div>
        ) : p.rows.length === 0 ? (
          <div className="pt-state">No matching {word}. {p.status === "active" && !p.q && p.activity === "all" ? `Create the first ${p.singular.toLowerCase()} when ready.` : "Try a different search or filter."}</div>
        ) : (
          <div className="pt-table-wrap">
            <table className="pt-table">
              <thead>
                <tr>
                  <th>{p.singular}</th>
                  <th>Primary contact</th>
                  <th>Telephone</th>
                  {isCustomers ? (<><th className="num">Open jobs</th><th className="num">Jobs, 12 mo</th><th>Last job in</th></>) : (<><th>Brands</th><th className="num">Work out</th><th className="num">Overdue</th></>)}
                  <th>Status</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {p.rows.map((row) => {
                  const cs = row.stats as CustomerStats | null | undefined;
                  const ss = row.stats as SupplierStats | null | undefined;
                  const brands = (row.brandList as string[] | undefined) ?? [];
                  const email = (row.primaryContactEmail as string | null | undefined) ?? null;
                  return (
                    <tr key={row.id}>
                      <td>
                        <Link href={`/${p.kind}/${row.id}`} className="pt-cell-name">
                          <PartyAvatar name={String(row.name ?? "")} />
                          <span className="pt-name-text">
                            <strong>{String(row.name ?? "")}</strong>
                            <small>{(row.accountCode as string | null) || (row.tradingName as string | null) || " "}</small>
                          </span>
                        </Link>
                      </td>
                      <td>
                        <div className="pt-stack">
                          <span>{(row.primaryContactName as string | null) || "—"}{!isCustomers && row.rfqReady ? <span className="pt-rfq">RFQ</span> : null}</span>
                          {email ? <small>{email}</small> : null}
                        </div>
                      </td>
                      <td className="pt-soft pt-nowrap">{(row.mainTelephone as string | null) || "—"}</td>
                      {isCustomers ? (
                        <>
                          <td className="num">{cs ? openJobsPill(cs.openJobs) : <span className="pt-zero">—</span>}</td>
                          <td className="num">{cs ? (cs.jobs12m > 0 ? cs.jobs12m.toLocaleString("en-ZA") : <span className="pt-zero">0</span>) : <span className="pt-zero">—</span>}</td>
                          <td className="pt-soft">{cs ? fmtDay(cs.lastJobAt) : "—"}</td>
                        </>
                      ) : (
                        <>
                          <td>
                            {brands.length === 0 ? <span className="pt-zero">—</span> : (
                              <span className="pt-chips" title={brands.join(", ")}>
                                {brands.slice(0, 2).map((b) => <span key={b} className="pt-chip">{b}</span>)}
                                {brands.length > 2 ? <span className="pt-chip is-more">+{brands.length - 2}</span> : null}
                              </span>
                            )}
                          </td>
                          <td className="num">{ss ? (ss.workOut > 0 ? <span className="pt-pill is-blue">{ss.workOut}</span> : <span className="pt-zero">—</span>) : <span className="pt-zero">—</span>}</td>
                          <td className="num">{ss ? (ss.overdue > 0 ? <span className="pt-pill is-red">{ss.overdue}</span> : <span className="pt-zero">—</span>) : <span className="pt-zero">—</span>}</td>
                        </>
                      )}
                      <td><span className={`pt-pill ${row.active === false ? "is-grey" : "is-green"}`}>{row.active === false ? "Inactive" : "Active"}</span></td>
                      <td className="pt-row-actions">
                        <Link className="pt-link" href={`/${p.kind}/${row.id}`}>View</Link>
                        <button type="button" className="pt-link" onClick={() => p.onEdit(row)}>Edit</button>
                        {p.canClone && p.cloneLabel ? (
                          <button type="button" className="pt-link" disabled={p.cloningId === row.id} onClick={() => p.onClone(row)}>
                            {p.cloningId === row.id ? <Loader2 className="spin" size={13} /> : p.cloneLabel}
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <footer className="pt-foot">
          <span>{p.total === 0 ? `No ${word}` : `Showing ${first} to ${last} of ${p.total.toLocaleString("en-ZA")} ${word}`}</span>
          <div className="pt-pager">
            <button type="button" disabled={p.page <= 1} onClick={() => p.onPage(p.page - 1)}><ChevronLeft size={15} /> Previous</button>
            <button type="button" disabled={p.page >= p.pages} onClick={() => p.onPage(p.page + 1)}>Next <ChevronRight size={15} /></button>
          </div>
        </footer>
        {!p.loading && <ScrollRestore selector=".pt .pt-table-wrap" storageKey={`master-data.${p.kind}`} />}
      </section>
    </div>
  );
}

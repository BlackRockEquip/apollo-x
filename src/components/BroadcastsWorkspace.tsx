"use client";

/* eslint-disable react-hooks/set-state-in-effect -- the broadcast list is loaded from the server on mount */
import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Megaphone, Search, Send, Wrench, X } from "lucide-react";
import { useConfirmDialog } from "@/components/ConfirmDialog";
import type { BroadcastAudience, BroadcastCompanyOption, BroadcastKind, BroadcastRow, BroadcastState, BroadcastUserOption } from "@/lib/platform/broadcast-model";

// 2026-10-27, user request: "add functionality to do broadcast message throughout the platform to all companies, specific
// companies, specific users". Platform > Broadcasts. Left: the message (who, what, how, when). Right: a live preview of the
// banner people will see and a summary of who it reaches. Below: every broadcast sent so far with its read rate, and a
// Withdraw button that stops one showing. Mockup: the "Platform admin" Design canvas, Broadcasts board.

type Expiry = "3d" | "7d" | "date" | "never";
type Form = {
  title: string; message: string; linkUrl: string; kind: BroadcastKind; audience: BroadcastAudience;
  companyIds: string[]; users: BroadcastUserOption[]; sendEmail: boolean; requireAck: boolean;
  schedule: boolean; startsAt: string; expiry: Expiry; expiresAt: string;
};
const EMPTY: Form = { title: "", message: "", linkUrl: "", kind: "INFORMATION", audience: "ALL", companyIds: [], users: [], sendEmail: false, requireAck: false, schedule: false, startsAt: "", expiry: "3d", expiresAt: "" };
const KIND_LABEL: Record<BroadcastKind, string> = { INFORMATION: "Information", IMPORTANT: "Important", MAINTENANCE: "Maintenance" };
const STATE_LABEL: Record<BroadcastState, string> = { scheduled: "Scheduled", showing: "Showing", expired: "Expired", withdrawn: "Withdrawn" };
const QUICK_ROLES = [["COMPANY_ADMIN", "All company administrators"], ["MANAGER", "All managers"], ["STORE_CONTROLLER", "All store controllers"], ["USER", "All mechanics / users"]] as const;

function errorText(body: { error?: { message?: string; fields?: Record<string, string[] | undefined> } }, fallback: string) {
  const fields = body.error?.fields ? Object.values(body.error.fields).flat().filter(Boolean) : [];
  return fields.length ? (fields as string[]).join(" ") : body.error?.message || fallback;
}
const fmt = (iso: string) => new Date(iso).toLocaleString("en-ZA", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function BroadcastsWorkspace() {
  const [broadcasts, setBroadcasts] = useState<BroadcastRow[]>([]);
  const [companies, setCompanies] = useState<BroadcastCompanyOption[]>([]);
  const [emailConfigured, setEmailConfigured] = useState(true);
  const [form, setForm] = useState<Form>(EMPTY);
  const [companyFilter, setCompanyFilter] = useState("");
  const [userQuery, setUserQuery] = useState("");
  const [userResults, setUserResults] = useState<BroadcastUserOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const { confirm, dialog } = useConfirmDialog();
  const searchSeq = useRef(0);

  async function load(silent = false) {
    if (!silent) setLoading(true);
    try {
      const r = await fetch("/api/v1/platform/broadcasts", { cache: "no-store" });
      const b = await r.json();
      if (!r.ok) throw new Error(errorText(b, "Unable to load the broadcasts."));
      setBroadcasts(b.broadcasts); setCompanies(b.companies); setEmailConfigured(Boolean(b.emailConfigured));
    } catch (e) {
      if (!silent) setError(e instanceof Error ? e.message : "Unable to load the broadcasts.");
    } finally {
      if (!silent) setLoading(false);
    }
  }
  useEffect(() => { void load(); }, []);
  // Read counts and Scheduled -> Showing change by themselves, so the list refreshes every 30 s and when the tab is shown again.
  useEffect(() => {
    const refresh = () => { if (document.visibilityState === "visible") void load(true); };
    const timer = setInterval(refresh, 30000);
    document.addEventListener("visibilitychange", refresh);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", refresh); };
  }, []);

  // Type-ahead for "Specific users": by name, email or company name.
  useEffect(() => {
    const q = userQuery.trim();
    if (form.audience !== "USERS" || q.length < 2) { setUserResults([]); return; }
    const seq = ++searchSeq.current;
    const timer = setTimeout(async () => {
      try {
        const r = await fetch(`/api/v1/platform/broadcasts/users?q=${encodeURIComponent(q)}`, { cache: "no-store" });
        const b = await r.json();
        if (r.ok && seq === searchSeq.current) setUserResults(b.users);
      } catch { /* the list just stays as it was */ }
    }, 250);
    return () => clearTimeout(timer);
  }, [userQuery, form.audience]);

  const patch = (changes: Partial<Form>) => setForm((f) => ({ ...f, ...changes }));
  const activeCompanies = companies.filter((c) => c.status === "ACTIVE");
  const visibleCompanies = companies.filter((c) => !companyFilter.trim() || `${c.name} ${c.code}`.toLowerCase().includes(companyFilter.trim().toLowerCase()));
  const chosenCompanies = companies.filter((c) => form.companyIds.includes(c.id) && c.status === "ACTIVE");

  const reach = useMemo(() => {
    if (form.audience === "ALL") return { companies: activeCompanies.length, people: activeCompanies.reduce((n, c) => n + c.userCount, 0), label: "All companies" };
    if (form.audience === "COMPANIES") return { companies: chosenCompanies.length, people: chosenCompanies.reduce((n, c) => n + c.userCount, 0), label: "Specific companies" };
    return { companies: new Set(form.users.flatMap((u) => u.companies)).size, people: form.users.length, label: "Specific users" };
  }, [form.audience, form.users, activeCompanies, chosenCompanies]);

  const canSend = form.title.trim() !== "" && form.message.trim() !== ""
    && (form.audience === "ALL" || (form.audience === "COMPANIES" ? form.companyIds.length > 0 : form.users.length > 0))
    && (!form.schedule || form.startsAt !== "") && (form.expiry !== "date" || form.expiresAt !== "");

  function toggleCompany(c: BroadcastCompanyOption) {
    if (c.status !== "ACTIVE") return;
    patch({ companyIds: form.companyIds.includes(c.id) ? form.companyIds.filter((id) => id !== c.id) : [...form.companyIds, c.id] });
  }
  function addUsers(list: BroadcastUserOption[]) {
    const have = new Set(form.users.map((u) => u.userId));
    patch({ users: [...form.users, ...list.filter((u) => !have.has(u.userId))] });
  }
  async function quickAdd(role: string) {
    if (!role) return;
    setError("");
    try {
      const r = await fetch(`/api/v1/platform/broadcasts/users?role=${encodeURIComponent(role)}`, { cache: "no-store" });
      const b = await r.json();
      if (!r.ok) throw new Error(errorText(b, "Unable to find those users."));
      addUsers(b.users);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to find those users.");
    }
  }

  async function send() {
    setError(""); setNotice("");
    const startsAt = form.schedule && form.startsAt ? new Date(form.startsAt) : null;
    const base = startsAt ?? new Date();
    let expiresAt: Date | null = null;
    if (form.expiry === "3d") expiresAt = new Date(base.getTime() + 3 * 86400000);
    if (form.expiry === "7d") expiresAt = new Date(base.getTime() + 7 * 86400000);
    if (form.expiry === "date" && form.expiresAt) expiresAt = new Date(form.expiresAt);
    const summary = `${plural(reach.people, "person", "people")} in ${plural(reach.companies, "company", "companies")}`;
    const ok = await confirm({
      title: form.schedule ? "Schedule broadcast" : "Send broadcast",
      message: `"${form.title.trim()}" ${form.schedule ? `will go out ${fmt(startsAt!.toISOString())} to` : "will pop up now for"} up to ${summary}${form.sendEmail ? ", and be emailed too" : ""}. It cannot be edited once sent, only withdrawn.`,
      confirmLabel: form.schedule ? "Schedule" : "Send",
    });
    if (!ok) return;
    setSending(true);
    try {
      const r = await fetch("/api/v1/platform/broadcasts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: form.title, message: form.message, linkUrl: form.linkUrl, kind: form.kind, audience: form.audience,
          companyIds: form.audience === "COMPANIES" ? form.companyIds : [], userIds: form.audience === "USERS" ? form.users.map((u) => u.userId) : [],
          sendEmail: form.sendEmail, requireAck: form.requireAck,
          startsAt: startsAt ? startsAt.toISOString() : null, expiresAt: expiresAt ? expiresAt.toISOString() : null,
        }),
      });
      const b = await r.json();
      if (!r.ok) throw new Error(errorText(b, "Unable to send this broadcast."));
      setNotice(form.schedule ? `Scheduled for ${fmt(b.startsAt)}.` : `Sent to ${plural(b.recipientCount, "person", "people")} in ${plural(b.companyCount, "company", "companies")}.`);
      setForm(EMPTY); setUserQuery(""); setUserResults([]);
      await load(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to send this broadcast.");
    } finally {
      setSending(false);
    }
  }

  async function withdraw(b: BroadcastRow) {
    if (!(await confirm({ title: "Withdraw broadcast", message: `Stop "${b.title}" showing? People who have not read it yet will no longer see it.`, confirmLabel: "Withdraw", tone: "danger" }))) return;
    setError(""); setNotice("");
    const r = await fetch(`/api/v1/platform/broadcasts/${b.id}/withdraw`, { method: "POST" });
    if (!r.ok) { setError(errorText(await r.json(), "Unable to withdraw this broadcast.")); return; }
    setNotice("Broadcast withdrawn.");
    await load(true);
  }

  const PreviewIcon = form.kind === "MAINTENANCE" ? Wrench : form.kind === "IMPORTANT" ? AlertTriangle : Megaphone;
  const showUsers = form.audience === "USERS";

  return (
    <>
      <style>{STYLES}</style>
      {dialog}
      {error ? <div className="inline-error">{error}</div> : null}
      {notice ? <div className="inline-success">{notice}</div> : null}
      <div className="bcw-grid">
        <div className="bcw-main">
          <section className="detail-panel">
            <h3>1. Who should see it</h3>
            <div className="tab-strip" role="group" aria-label="Audience">
              <button type="button" className={form.audience === "ALL" ? "active" : ""} onClick={() => patch({ audience: "ALL" })}>All companies</button>
              <button type="button" className={form.audience === "COMPANIES" ? "active" : ""} onClick={() => patch({ audience: "COMPANIES" })}>Specific companies</button>
              <button type="button" className={form.audience === "USERS" ? "active" : ""} onClick={() => patch({ audience: "USERS" })}>Specific users</button>
            </div>
            {form.audience === "ALL" ? (
              <p className="bcw-note">Every user in <b>{plural(activeCompanies.length, "active company", "active companies")}</b> ({reach.people} memberships). Suspended and closed companies are skipped.</p>
            ) : null}
            {form.audience === "COMPANIES" ? (
              <div className="bcw-picker">
                <div className="bcw-picker-bar">
                  <label className="search-control inventory-search-control"><Search size={15} /><input type="text" value={companyFilter} onChange={(e) => setCompanyFilter(e.target.value)} placeholder="Search companies" /></label>
                  <button type="button" className="quiet-button" onClick={() => patch({ companyIds: Array.from(new Set([...form.companyIds, ...visibleCompanies.filter((c) => c.status === "ACTIVE").map((c) => c.id)])) })}>Select shown</button>
                  <button type="button" className="quiet-button" onClick={() => patch({ companyIds: [] })}>Clear</button>
                </div>
                <div className="bcw-list">
                  {visibleCompanies.map((c) => (
                    <label key={c.id} className={c.status === "ACTIVE" ? "bcw-row" : "bcw-row off"}>
                      <input type="checkbox" checked={form.companyIds.includes(c.id)} disabled={c.status !== "ACTIVE"} onChange={() => toggleCompany(c)} />
                      <span className="bcw-row-main"><b>{c.name}</b><small>{c.code} · {plural(c.userCount, "user")}</small></span>
                      {c.status !== "ACTIVE" ? <span className="status-pill neutral">{c.status === "SUSPENDED" ? "Suspended" : "Closed"}</span> : null}
                    </label>
                  ))}
                  {visibleCompanies.length === 0 ? <p className="muted small-line" style={{ padding: 10 }}>No company matches.</p> : null}
                </div>
                <p className="bcw-count">{plural(chosenCompanies.length, "company", "companies")} selected, {plural(reach.people, "user")}</p>
              </div>
            ) : null}
            {showUsers ? (
              <div className="bcw-picker">
                <div className="bcw-picker-bar">
                  <label className="search-control inventory-search-control"><Search size={15} /><input type="text" value={userQuery} onChange={(e) => setUserQuery(e.target.value)} placeholder="Search by name, email or company" /></label>
                  <select value="" onChange={(e) => void quickAdd(e.target.value)} aria-label="Quick add by role"><option value="">Quick add by role</option>{QUICK_ROLES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
                </div>
                {form.users.length > 0 ? (
                  <div className="bcw-chips">
                    {form.users.map((u) => (
                      <span className="bcw-chip" key={u.userId} title={`${u.email} · ${u.companies.join(", ")}`}>{u.name}<small>{u.companies[0]}{u.companies.length > 1 ? ` +${u.companies.length - 1}` : ""}</small>
                        <button type="button" aria-label={`Remove ${u.name}`} onClick={() => patch({ users: form.users.filter((x) => x.userId !== u.userId) })}><X size={12} /></button>
                      </span>
                    ))}
                  </div>
                ) : null}
                {userResults.length > 0 ? (
                  <div className="bcw-list">
                    {userResults.map((u) => {
                      const added = form.users.some((x) => x.userId === u.userId);
                      return (
                        <div className="bcw-row" key={u.userId}>
                          <span className="bcw-row-main"><b>{u.name}</b><small>{u.email} · {u.companies.join(", ")}</small></span>
                          <button type="button" className="quiet-button" disabled={added} onClick={() => addUsers([u])}>{added ? "Added" : "Add"}</button>
                        </div>
                      );
                    })}
                  </div>
                ) : <p className="bcw-count muted">{userQuery.trim().length >= 2 ? "No one matches that search." : "Type at least two letters to find people, or use Quick add."}</p>}
                <p className="bcw-count">{plural(form.users.length, "user")} selected</p>
              </div>
            ) : null}
          </section>

          <section className="detail-panel">
            <h3>2. The message</h3>
            <div className="tab-strip" role="group" aria-label="Message type">
              {(["INFORMATION", "IMPORTANT", "MAINTENANCE"] as BroadcastKind[]).map((k) => <button type="button" key={k} className={form.kind === k ? "active" : ""} onClick={() => patch({ kind: k })}>{KIND_LABEL[k]}</button>)}
            </div>
            <div className="drawer-fields compact-form-fields">
              <label className="wide"><span>Title</span><input value={form.title} maxLength={120} onChange={(e) => patch({ title: e.target.value })} placeholder="e.g. Planned maintenance on Saturday" /></label>
              <label className="wide"><span>Message</span><textarea rows={4} maxLength={1000} value={form.message} onChange={(e) => patch({ message: e.target.value })} placeholder="Keep it short. People see the title first." /></label>
              <label className="wide"><span>Link (optional)</span><input value={form.linkUrl} maxLength={500} onChange={(e) => patch({ linkUrl: e.target.value })} placeholder="https://" /></label>
            </div>
          </section>

          <section className="detail-panel">
            <h3>3. Delivery and timing</h3>
            <label className="bcw-opt"><input type="checkbox" checked disabled /><span><b>Popup inside the app</b><small>Shown across the top of every page until it is dismissed or runs out. Also kept in each person&apos;s notifications.</small></span></label>
            <label className="bcw-opt"><input type="checkbox" checked={form.sendEmail} disabled={!emailConfigured} onChange={(e) => patch({ sendEmail: e.target.checked })} /><span><b>Also send as email</b><small>{emailConfigured ? "Sent from the platform mail server (Platform Settings)." : "Set up the platform mail server in Platform Settings first."}</small></span></label>
            <label className="bcw-opt"><input type="checkbox" checked={form.requireAck} onChange={(e) => patch({ requireAck: e.target.checked })} /><span><b>Ask people to acknowledge</b><small>The cross is replaced by an &ldquo;I have read this&rdquo; button. Good for downtime or terms.</small></span></label>
            <div className="bcw-timing">
              <div className="tab-strip" role="group" aria-label="When">
                <button type="button" className={!form.schedule ? "active" : ""} onClick={() => patch({ schedule: false })}>Send now</button>
                <button type="button" className={form.schedule ? "active" : ""} onClick={() => patch({ schedule: true })}>Schedule</button>
              </div>
              {form.schedule ? <label><span>Starts</span><input type="datetime-local" value={form.startsAt} onChange={(e) => patch({ startsAt: e.target.value })} /></label> : null}
              <label><span>Stops showing</span>
                <select value={form.expiry} onChange={(e) => patch({ expiry: e.target.value as Expiry })}>
                  <option value="3d">After 3 days</option><option value="7d">After 7 days</option><option value="date">On a date</option><option value="never">When I withdraw it</option>
                </select>
              </label>
              {form.expiry === "date" ? <label><span>Ends</span><input type="datetime-local" value={form.expiresAt} onChange={(e) => patch({ expiresAt: e.target.value })} /></label> : null}
            </div>
          </section>
        </div>

        <aside className="bcw-side">
          <section className="detail-panel">
            <h3>Preview</h3>
            <div className={`bcw-banner ${form.kind.toLowerCase()}`}>
              <PreviewIcon size={16} />
              <div><b>{form.title.trim() || "Your title appears here"}</b><span>{form.message.trim() || "Your message appears here, across the top of every page."}</span><em>From Flo X</em></div>
              {form.requireAck ? <i className="ack">I have read this</i> : <X size={15} />}
            </div>
          </section>
          <section className="detail-panel">
            <h3>Summary</h3>
            <dl className="bcw-facts">
              <div><dt>Audience</dt><dd>{reach.label}</dd></div>
              <div><dt>Reaches</dt><dd>{plural(reach.people, form.audience === "USERS" ? "user" : "membership")} in {plural(reach.companies, "company", "companies")}</dd></div>
              <div><dt>Delivery</dt><dd>{form.sendEmail ? "Popup and email" : "Popup only"}{form.requireAck ? ", acknowledge" : ""}</dd></div>
              <div><dt>Starts</dt><dd>{form.schedule && form.startsAt ? fmt(new Date(form.startsAt).toISOString()) : "Immediately"}</dd></div>
              <div><dt>Type</dt><dd>{KIND_LABEL[form.kind]}</dd></div>
            </dl>
            <button type="button" className="gold-button bcw-send" disabled={sending || !canSend} onClick={() => void send()}><Send size={14} /> {sending ? "Sending…" : form.schedule ? "Schedule broadcast" : "Send broadcast"}</button>
            <p className="bcw-count muted">Broadcasts are recorded in the audit log. A sent one can be withdrawn but not edited.</p>
          </section>
        </aside>
      </div>

      <section className="detail-panel bcw-history">
        <h3>Broadcast history</h3>
        <div className="data-table-wrap">
          <table className="data-table">
            <thead><tr><th>Message</th><th>Audience</th><th>Delivery</th><th>Sent by</th><th>Read</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {broadcasts.map((b) => {
                const pct = b.recipientCount > 0 ? Math.round((b.readCount / b.recipientCount) * 100) : 0;
                return (
                  <tr key={b.id}>
                    <td><strong>{b.title}</strong><div className="muted small-line">{KIND_LABEL[b.kind]}{b.requireAck ? " · acknowledge" : ""}</div></td>
                    <td title={b.companyNames.join(", ")}>{b.audience === "ALL" ? "All companies" : b.audience === "COMPANIES" ? plural(b.companyNames.length, "company", "companies") : plural(b.recipientCount, "user")}</td>
                    <td>{b.sendEmail ? `Popup and email${b.state === "scheduled" ? "" : ` (${b.emailedCount} sent)`}` : "Popup"}</td>
                    <td>{b.createdByName}<div className="muted small-line">{b.state === "scheduled" ? `Starts ${fmt(b.startsAt)}` : fmt(b.createdAt)}</div></td>
                    <td>{b.state === "scheduled" || b.state === "withdrawn" ? <span className="muted small-line">{b.state === "withdrawn" ? "Withdrawn" : "Not started"}</span> : <span className="bcw-meter"><i style={{ width: `${pct}%` }} /><small>{b.readCount} of {b.recipientCount} ({pct}%)</small></span>}</td>
                    <td><span className={b.state === "showing" ? "status-pill" : "status-pill neutral"}>{STATE_LABEL[b.state]}</span></td>
                    <td className="actions">{b.state === "showing" || b.state === "scheduled" ? <button type="button" className="table-action" onClick={() => void withdraw(b)}>Withdraw</button> : null}</td>
                  </tr>
                );
              })}
              {!loading && broadcasts.length === 0 ? <tr><td colSpan={7} className="table-state compact-empty-state">Nothing has been broadcast yet.</td></tr> : null}
              {loading ? <tr><td colSpan={7} className="table-state compact-empty-state">Loading…</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

const STYLES = `
.bcw-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(280px,380px);gap:16px;align-items:start;margin-bottom:16px}
@media (max-width:1000px){.bcw-grid{grid-template-columns:1fr}}
.bcw-main,.bcw-side{display:grid;gap:16px;min-width:0}
.bcw-grid .detail-panel,.bcw-history{padding:16px}
.bcw-grid h3,.bcw-history h3{margin:0 0 10px;font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:var(--ink-700)}
.bcw-note{margin:12px 0 0;padding:10px 12px;border-radius:8px;background:var(--ink-50,#f4f6fa);font-size:13px}
.bcw-picker{display:grid;gap:10px;margin-top:12px}
.bcw-picker-bar{display:flex;flex-wrap:wrap;gap:8px;align-items:center}.bcw-picker-bar .search-control{flex:1 1 220px}
.bcw-list{max-height:272px;overflow-y:auto;border:1px solid var(--line,#e2e6ec);border-radius:8px}
.bcw-row{display:flex;align-items:center;gap:10px;padding:9px 12px;border-bottom:1px solid var(--line,#edf0f4);cursor:pointer}.bcw-row:last-child{border-bottom:0}.bcw-row:hover{background:var(--ink-50,#f7f8fb)}.bcw-row.off{opacity:.55;cursor:not-allowed}
.bcw-row-main{display:grid;flex:1;min-width:0}.bcw-row-main b{font-size:13px}.bcw-row-main small{color:var(--ink-500);font-size:11.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bcw-count{margin:0;font-size:12.5px}
.bcw-chips{display:flex;flex-wrap:wrap;gap:6px}
.bcw-chip{display:inline-flex;align-items:center;gap:6px;padding:3px 4px 3px 10px;border-radius:999px;background:#eceff4;font-size:12.5px;font-weight:600}.bcw-chip small{color:var(--ink-500);font-weight:400;font-size:11px}
.bcw-chip button{display:grid;place-items:center;width:18px;height:18px;border:0;border-radius:50%;background:transparent;color:var(--ink-500);cursor:pointer}.bcw-chip button:hover{background:#c6cdd8;color:#fff}
.bcw-opt{display:flex;align-items:flex-start;gap:10px;padding:10px 0;border-bottom:1px solid var(--line,#edf0f4);cursor:pointer}.bcw-opt span{display:grid;gap:2px}.bcw-opt small{color:var(--ink-500);font-size:12px}
.bcw-timing{display:flex;flex-wrap:wrap;gap:14px;align-items:flex-end;padding-top:14px}.bcw-timing label{display:grid;gap:4px}.bcw-timing label>span{font-size:10.5px;font-weight:800;color:var(--ink-500);text-transform:uppercase;letter-spacing:.06em}
.bcw-banner{display:flex;gap:10px;align-items:flex-start;padding:12px 14px;border-radius:10px;border:1px solid #c9dcf3;background:#eef4fc;color:#173a63;font-size:13px}
.bcw-banner>svg{flex:none;margin-top:2px}.bcw-banner div{display:grid;flex:1;gap:2px;min-width:0}.bcw-banner em{font-size:11px;font-style:normal;opacity:.7}
.bcw-banner.important{background:#fdf0d2;border-color:#e6c36a;color:#5b4310}.bcw-banner.maintenance{background:#0c1a2c;border-color:#0c1a2c;color:#e9eef6}
.bcw-banner .ack{flex:none;align-self:center;padding:5px 10px;border-radius:7px;background:#d6a83b;color:#1c1405;font-size:11px;font-style:normal;font-weight:800}
.bcw-facts{display:grid;gap:10px;margin:0 0 14px}.bcw-facts div{display:grid;grid-template-columns:90px 1fr;gap:8px;font-size:13px}.bcw-facts dt{color:var(--ink-500)}.bcw-facts dd{margin:0;font-weight:600}
.bcw-send{width:100%;justify-content:center}
.bcw-meter{display:grid;gap:3px;min-width:120px}.bcw-meter i{display:block;height:6px;border-radius:999px;background:var(--navy-950,#0c1a2c);min-width:2px}.bcw-meter::before{content:"";grid-area:1/1;height:6px;border-radius:999px;background:#eceff4}.bcw-meter i{grid-area:1/1}.bcw-meter small{grid-area:2/1;color:var(--ink-500);font-size:11px}
`;

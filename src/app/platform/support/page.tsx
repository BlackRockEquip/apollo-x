"use client";

/* eslint-disable react-hooks/set-state-in-effect -- async support loading intentionally mirrors existing workspace patterns */
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRightLeft, MessageSquarePlus, Paperclip, Search, Send, ShieldCheck, X } from "lucide-react";

type Attachment = { id: string; fileName: string; mimeType: string; sizeBytes: number; createdAt?: string };
type PlatformTicket = {
  id: string;
  ticketNumber: string;
  subject: string;
  priority: string;
  status: string;
  createdAt?: string;
  updatedAt?: string;
  company?: { id?: string; tradingName?: string | null; legalName?: string | null } | null;
  reportedBy?: { displayName?: string | null; email?: string | null } | null;
  assignedSupport?: { id?: string; displayName?: string | null; email?: string | null } | null;
  moduleKey?: string | null;
  pageRoute?: string | null;
};
type PlatformTicketDetail = PlatformTicket & {
  userAgent?: string | null;
  appVersion?: string | null;
  description?: string;
  attachments: Attachment[];
  events: Array<{ id: string; eventType: string; fromValue?: string | null; toValue?: string | null; note?: string | null; createdAt: string; actor?: { displayName?: string | null } | null }>;
  messages: Array<{ id: string; kind: string; body: string; createdAt: string; author?: { displayName?: string | null } | null; attachments?: Attachment[] }>;
};
const ALLOWED = ["image/png", "image/jpeg", "image/webp", "application/pdf", "text/plain"];
const LIMIT = 4_000_000;
async function fileToPayload(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return { fileName: file.name.replace(/[^A-Za-z0-9._ -]/g, "_").slice(0, 160), mimeType: file.type, contentBase64: btoa(binary) };
}

function ActionDialog({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return <div className="drawer-backdrop" role="dialog" aria-modal="true"><aside className="form-drawer compact-dialog"><header><div><p className="eyebrow">Platform Support</p><h2>{title}</h2></div><button type="button" onClick={onClose}><X size={18} /></button></header>{children}</aside></div>;
}

export default function PlatformSupportPage() {
  const [tickets, setTickets] = useState<PlatformTicket[]>([]);
  const [selected, setSelected] = useState<PlatformTicket | null>(null);
  const [detail, setDetail] = useState<PlatformTicketDetail | null>(null);
  const [error, setError] = useState("");
  const [filters, setFilters] = useState({ q: "", status: "", priority: "" });
  const [dialog, setDialog] = useState<null | "reply" | "note" | "assign" | "status" | "priority">(null);
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [assignment, setAssignment] = useState("");
  const [status, setStatus] = useState("");
  const [priority, setPriority] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const qs = new URLSearchParams(Object.entries(filters).filter(([, v]) => v));
    const r = await fetch(`/api/v1/platform/support?${qs.toString()}`, { cache: "no-store" });
    const b = await r.json();
    if (!r.ok) throw new Error(b.error?.message || "Unable to load tickets.");
    setTickets(b);
  }, [filters]);

  async function open(id: string) {
    const r = await fetch(`/api/v1/platform/support/${id}`, { cache: "no-store" });
    const b = await r.json();
    if (!r.ok) throw new Error(b.error?.message || "Unable to load ticket.");
    setDetail(b);
    setStatus(b.status);
    setPriority(b.priority);
    setAssignment(b.assignedSupport?.id || "");
  }

  useEffect(() => { void load().catch((e) => setError(e instanceof Error ? e.message : "Unable to load tickets.")); }, [load]);
  useEffect(() => { if (selected) void open(selected.id).catch((e) => setError(e instanceof Error ? e.message : "Unable to load ticket.")); }, [selected]);

  function pick(list: FileList | null) {
    const picked = Array.from(list || []);
    for (const file of picked) {
      if (!ALLOWED.includes(file.type)) { setError(`Unsupported file type: ${file.name}`); return; }
      if (file.size > LIMIT) { setError(`File too large: ${file.name}`); return; }
    }
    setError("");
    setFiles((current) => [...current, ...picked].slice(0, 3));
  }

  async function submitMessage(kind: "REPLY" | "INTERNAL_NOTE") {
    if (!detail || text.trim().length < 1) return;
    setSaving(true); setError("");
    try {
      const attachments = await Promise.all(files.map(fileToPayload));
      const r = await fetch(`/api/v1/platform/support/${detail.id}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ body: text, kind, attachments }) });
      const b = await r.json();
      if (!r.ok) throw new Error(b.error?.message || "Unable to send message.");
      setDialog(null); setText(""); setFiles([]);
      await open(detail.id); await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to send message."); }
    finally { setSaving(false); }
  }

  async function patchTicket(payload: Record<string, unknown>) {
    if (!detail) return;
    setSaving(true); setError("");
    try {
      const r = await fetch(`/api/v1/platform/support/${detail.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const b = await r.json();
      if (!r.ok) throw new Error(b.error?.message || "Unable to update ticket.");
      setDialog(null);
      await open(detail.id); await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to update ticket."); }
    finally { setSaving(false); }
  }

  async function enterSupport(mode: "READ_ONLY" | "READ_WRITE") {
    if (!detail) return;
    const r = await fetch(`/api/v1/platform/support/${detail.id}/enter-context`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mode }) });
    const b = await r.json();
    if (!r.ok) { setError(b.error?.message || "Unable to enter support context."); return; }
    window.location.href = b.destination || "/dashboard";
  }

  const allAttachments = useMemo(() => detail ? [...detail.attachments, ...detail.messages.flatMap((message) => message.attachments || [])] : [], [detail]);

  return <div>
    <header className="page-header compact"><div><p className="eyebrow">Platform</p><h1>Support</h1><p>Review cross-tenant tickets with audited platform authority.</p></div></header>
    {error ? <div className="inline-error">{error}</div> : null}
    <section className="master-panel platform-panel"><div className="master-toolbar jobs-toolbar"><label className="search-control inventory-search-control"><Search size={15} /><input value={filters.q} onChange={(e) => setFilters((c) => ({ ...c, q: e.target.value }))} placeholder="Search ticket, subject or company" /></label><select value={filters.status} onChange={(e) => setFilters((c) => ({ ...c, status: e.target.value }))}><option value="">All statuses</option><option value="OPEN">Open</option><option value="IN_PROGRESS">In Progress</option><option value="WAITING_ON_CUSTOMER">Waiting on Customer</option><option value="RESOLVED">Resolved</option><option value="CLOSED">Closed</option></select><select value={filters.priority} onChange={(e) => setFilters((c) => ({ ...c, priority: e.target.value }))}><option value="">All priorities</option><option value="LOW">Low</option><option value="NORMAL">Normal</option><option value="HIGH">High</option><option value="CRITICAL">Critical</option></select><span>{tickets.length} ticket{tickets.length === 1 ? "" : "s"}</span></div></section>
    <div className="platform-grid">
      <section className="detail-panel"><header><div><h2>Tickets</h2></div></header><div className="record-list support-ticket-list">{tickets.map((ticket) => <article key={ticket.id} className={selected?.id === ticket.id ? "active-record" : ""} onClick={() => setSelected(ticket)}><div className="record-icon">SUP</div><div><strong>{ticket.ticketNumber} · {ticket.subject}</strong><span>{ticket.company?.tradingName || ticket.company?.legalName} · {ticket.priority} · {ticket.status}</span></div></article>)}{tickets.length === 0 && <div className="table-state compact-empty-state">No support tickets found.</div>}</div></section>
      {detail && <section className="detail-panel"><header><div><h2>{detail.ticketNumber}</h2><p>{detail.company?.tradingName || detail.company?.legalName} · {detail.status}</p></div><div className="header-actions"><button type="button" className="table-action" onClick={() => setDialog("reply")}><Send size={14} /> Reply</button><button type="button" className="table-action" onClick={() => setDialog("note")}><MessageSquarePlus size={14} /> Internal Note</button><button type="button" className="table-action" onClick={() => setDialog("assign")}><ArrowRightLeft size={14} /> Assign</button><button type="button" className="table-action" onClick={() => setDialog("priority")}>Priority</button><button type="button" className="table-action" onClick={() => setDialog("status")}>Status</button><button type="button" className="table-action" onClick={() => void enterSupport("READ_ONLY")}><ShieldCheck size={14} /> Read-Only</button><button type="button" className="table-action" onClick={() => void enterSupport("READ_WRITE")}>Read-Write</button></div></header>
        <div className="detail-grid">
          <section className="info-card"><header><h2>Ticket</h2></header><dl><div><dt>Company</dt><dd>{detail.company?.tradingName || detail.company?.legalName}</dd></div><div><dt>Reporter</dt><dd>{detail.reportedBy?.displayName || detail.reportedBy?.email || "Unknown"}</dd></div><div><dt>Priority</dt><dd>{detail.priority}</dd></div><div><dt>Status</dt><dd>{detail.status}</dd></div><div><dt>Assigned</dt><dd>{detail.assignedSupport?.displayName || "Unassigned"}</dd></div><div><dt>Module / Page</dt><dd>{[detail.moduleKey, detail.pageRoute].filter(Boolean).join(" · ") || "—"}</dd></div><div><dt>Created</dt><dd>{detail.createdAt ? new Date(detail.createdAt).toLocaleString("en-ZA") : "—"}</dd></div><div><dt>Updated</dt><dd>{detail.updatedAt ? new Date(detail.updatedAt).toLocaleString("en-ZA") : "—"}</dd></div></dl></section>
          <section className="detail-panel"><header><div><h2>Description</h2></div></header><div className="history-list"><article><strong>Reported issue</strong><time>{detail.createdAt ? new Date(detail.createdAt).toLocaleString("en-ZA") : ""}</time><p>{detail.description}</p><span>{detail.userAgent || ""}</span><span>{detail.appVersion || ""}</span></article></div></section>
        </div>
        <section className="detail-panel inner-panel"><header><div><h2>Conversation & activity</h2></div></header><div className="history-list">{detail.messages.map((message) => <article key={message.id}><strong>{message.kind === "INTERNAL_NOTE" ? `Internal note · ${message.author?.displayName || "Support"}` : message.author?.displayName || "Support"}</strong><span>{message.kind.replaceAll("_", " ")}</span><time>{new Date(message.createdAt).toLocaleString("en-ZA")}</time><p>{message.body}</p>{(message.attachments || []).map((attachment) => <a key={attachment.id} href={`/api/v1/support/attachments/${attachment.id}`} target="_blank" rel="noreferrer" className="table-action">{attachment.fileName}</a>)}</article>)}{detail.events.map((event) => <article key={event.id}><strong>{event.eventType.replaceAll("_", " ")}</strong><span>{event.actor?.displayName || "System"}{event.fromValue || event.toValue ? ` · ${event.fromValue || ""} → ${event.toValue || ""}` : ""}</span><time>{new Date(event.createdAt).toLocaleString("en-ZA")}</time>{event.note ? <p>{event.note}</p> : null}</article>)}</div></section>
        {allAttachments.length > 0 ? <section className="detail-panel inner-panel"><header><div><h2>Attachments</h2></div></header><div className="record-list">{allAttachments.map((attachment) => <article key={attachment.id}><div className="record-icon"><Paperclip size={14} /></div><div><strong>{attachment.fileName}</strong><span>{attachment.mimeType} · {Math.round(attachment.sizeBytes / 1024)} KB</span></div><a href={`/api/v1/support/attachments/${attachment.id}`} target="_blank" rel="noreferrer" className="table-action">Open</a></article>)}</div></section> : null}
      </section>}
    </div>
    {dialog === "reply" && <ActionDialog title="Reply" onClose={() => setDialog(null)}><div className="drawer-fields"><label className="wide"><span>Reply</span><textarea rows={4} value={text} onChange={(e) => setText(e.target.value)} /></label><label className="wide"><span>Attachments</span><input type="file" multiple accept=".png,.jpg,.jpeg,.webp,.pdf,.txt,text/plain,application/pdf,image/png,image/jpeg,image/webp" onChange={(e) => pick(e.target.files)} /></label></div>{files.length > 0 ? <div className="record-list">{files.map((file, index) => <article key={`${file.name}:${index}`}><div className="record-icon"><Paperclip size={14} /></div><div><strong>{file.name}</strong><span>{Math.round(file.size / 1024)} KB</span></div><button type="button" className="table-action" onClick={() => setFiles((current) => current.filter((_, i) => i !== index))}><X size={14} /> Remove</button></article>)}</div> : null}<footer className="detail-actions"><button type="button" className="gold-button" disabled={saving || text.trim().length < 1} onClick={() => void submitMessage("REPLY")}>Send reply</button></footer></ActionDialog>}
    {dialog === "note" && <ActionDialog title="Add Internal Note" onClose={() => setDialog(null)}><div className="drawer-fields"><label className="wide"><span>Internal note</span><textarea rows={4} value={text} onChange={(e) => setText(e.target.value)} /></label><label className="wide"><span>Attachments</span><input type="file" multiple accept=".png,.jpg,.jpeg,.webp,.pdf,.txt,text/plain,application/pdf,image/png,image/jpeg,image/webp" onChange={(e) => pick(e.target.files)} /></label></div>{files.length > 0 ? <div className="record-list">{files.map((file, index) => <article key={`${file.name}:${index}`}><div className="record-icon"><Paperclip size={14} /></div><div><strong>{file.name}</strong><span>{Math.round(file.size / 1024)} KB</span></div><button type="button" className="table-action" onClick={() => setFiles((current) => current.filter((_, i) => i !== index))}><X size={14} /> Remove</button></article>)}</div> : null}<footer className="detail-actions"><button type="button" className="gold-button" disabled={saving || text.trim().length < 1} onClick={() => void submitMessage("INTERNAL_NOTE")}>Save note</button></footer></ActionDialog>}
    {dialog === "assign" && <ActionDialog title="Assign Support Person" onClose={() => setDialog(null)}><div className="drawer-fields"><label><span>Assigned support user id</span><input value={assignment} onChange={(e) => setAssignment(e.target.value)} placeholder="cuid or blank to clear" /></label></div><footer className="detail-actions"><button type="button" className="gold-button" disabled={saving} onClick={() => void patchTicket({ assignedSupportId: assignment || null })}>Save assignment</button></footer></ActionDialog>}
    {dialog === "priority" && <ActionDialog title="Change Priority" onClose={() => setDialog(null)}><div className="drawer-fields"><label><span>Priority</span><select value={priority} onChange={(e) => setPriority(e.target.value)}><option value="LOW">Low</option><option value="NORMAL">Normal</option><option value="HIGH">High</option><option value="CRITICAL">Critical</option></select></label></div><footer className="detail-actions"><button type="button" className="gold-button" disabled={saving} onClick={() => void patchTicket({ priority })}>Save priority</button></footer></ActionDialog>}
    {dialog === "status" && <ActionDialog title="Change Status" onClose={() => setDialog(null)}><div className="drawer-fields"><label><span>Status</span><select value={status} onChange={(e) => setStatus(e.target.value)}><option value="OPEN">Open</option><option value="IN_PROGRESS">In Progress</option><option value="WAITING_ON_CUSTOMER">Waiting on Customer</option><option value="RESOLVED">Resolved</option><option value="CLOSED">Closed</option></select></label></div><footer className="detail-actions"><button type="button" className="gold-button" disabled={saving} onClick={() => void patchTicket({ status })}>Save status</button></footer></ActionDialog>}
  </div>;
}

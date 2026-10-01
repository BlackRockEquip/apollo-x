"use client";

/* eslint-disable react-hooks/set-state-in-effect -- async support loading intentionally mirrors existing workspace patterns */
// 2026-09-10 — split out of what used to be support/page.tsx itself (a
// "use client" page.tsx can't be an async server component, so it couldn't
// fetch the RequestContext the new shared SettingsTabNav needs — see the
// settings-nav.ts header comment). Same ticket logic as before, unchanged;
// the new page.tsx is a thin async server wrapper that renders the header
// + tab bar + this component.
//
// 2026-10-01 — user request ("Support ticket to Org Admins — display all
// tickets received in table form (Ticket Number, Date received, User,
// Priority), when the org admin clicks on the ticket it opens the ticket in
// its own window, not below as it does now, add delete button; allow the
// reply functionality to work back the user who requested support, and user
// receives notification and can respond accordingly; add functionality for
// org admin to change status of support request (Open, In Process,
// Closed)"): substantial rewrite of the "Your tickets" list + inline detail
// section below it. The list is now a real .data-table (the same
// table/.data-table-wrap convention used by every other list in this app —
// see OutworkAllWorkspace.tsx/JobKitsWorkspace.tsx) with the four requested
// columns plus Status, and clicking a row opens the ticket in a centered
// modal dialog (createPortal + .drawer-backdrop/.form-drawer.compact-dialog,
// same pattern as SupportRequestDialog.tsx/ConfirmDialog.tsx) instead of the
// old render-below-the-grid section. Delete and the status <select> are only
// shown to whoever can see every ticket in the company (tenantPermissions
// has USERS_MANAGE — the same gate listTenantSupportTickets/
// deleteTenantSupportTicket/updateTenantSupportTicketStatus already enforce
// server-side in support/service.ts) — a non-admin only ever sees their own
// tickets and has no "manage someone else's ticket" controls to begin with.
// The reply-notification loop itself (reporter <-> Org Admin) is server-
// side, in replyToSupportTicket (support/service.ts) — this component just
// needed the delete/status/table-and-modal UI to go with it.
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, MessageSquarePlus, Paperclip, Send, Trash2, X } from "lucide-react";
import { useTenantPermissions } from "@/components/AppShell";
import { useConfirmDialog } from "@/components/ConfirmDialog";

type Attachment = { id: string; fileName: string; mimeType: string; sizeBytes: number };
type Ticket = { id: string; ticketNumber: string; subject: string; priority: string; status: string; category?: string | null; createdAt: string; updatedAt: string; attachments?: Attachment[]; reportedBy?: { displayName?: string | null; email?: string | null } | null };
type TicketMessage = { id: string; body: string; kind: string; createdAt: string; author?: { displayName?: string | null } | null; attachments?: Attachment[] };
type TicketDetail = Ticket & { messages: TicketMessage[]; attachments: Attachment[] };
type TenantStatus = "OPEN" | "IN_PROGRESS" | "CLOSED";
const ALLOWED = ["image/png", "image/jpeg", "image/webp", "application/pdf", "text/plain"];
const LIMIT = 4_000_000;
async function fileToPayload(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return { fileName: file.name.replace(/[^A-Za-z0-9._ -]/g, "_").slice(0, 160), mimeType: file.type, contentBase64: btoa(binary) };
}
function fmtDate(value: string) { return new Date(value).toLocaleDateString("en-ZA", { day: "2-digit", month: "short", year: "numeric" }); }
function statusLabel(status: string) {
  switch (status) {
    case "OPEN": return "Open";
    case "IN_PROGRESS": return "In Process";
    case "WAITING_ON_CUSTOMER": return "Waiting on customer";
    case "RESOLVED": return "Resolved";
    case "CLOSED": return "Closed";
    default: return status;
  }
}
function statusTone(status: string) {
  switch (status) {
    case "OPEN": return "tone-blue";
    case "IN_PROGRESS": return "tone-amber";
    case "WAITING_ON_CUSTOMER": return "tone-purple";
    case "RESOLVED": return "tone-green";
    case "CLOSED": return "tone-neutral";
    default: return "tone-neutral";
  }
}
function priorityTone(priority: string) {
  switch (priority) {
    case "LOW": return "tone-neutral";
    case "HIGH": return "tone-orange";
    case "CRITICAL": return "tone-red";
    default: return "tone-blue";
  }
}

export function SupportWorkspace() {
  const { tenantPermissions } = useTenantPermissions();
  const isAdmin = tenantPermissions.has("USERS_MANAGE");
  const { confirm, dialog } = useConfirmDialog();

  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ subject: "", description: "", category: "", priority: "NORMAL", moduleKey: "", pageRoute: "" });
  const [files, setFiles] = useState<File[]>([]);

  const [modalTicketId, setModalTicketId] = useState<string | null>(null);
  const [detail, setDetail] = useState<TicketDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [statusSaving, setStatusSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [replyFiles, setReplyFiles] = useState<File[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/v1/support", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message || "Unable to load support tickets.");
      setTickets(body);
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to load support tickets."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function openTicket(id: string) {
    setDetailLoading(true);
    try {
      const response = await fetch(`/api/v1/support/${id}`, { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message || "Unable to load support ticket.");
      setDetail(body);
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to load support ticket."); }
    finally { setDetailLoading(false); }
  }
  function openModal(ticket: Ticket) {
    setModalTicketId(ticket.id);
    setDetail(null);
    setReply("");
    setReplyFiles([]);
    setError("");
    void openTicket(ticket.id);
  }
  function closeModal() {
    setModalTicketId(null);
    setDetail(null);
    setReply("");
    setReplyFiles([]);
  }

  function validatePicked(list: FileList | null, target: "files" | "replyFiles") {
    const picked = Array.from(list || []);
    for (const file of picked) {
      if (!ALLOWED.includes(file.type)) { setError(`Unsupported file type: ${file.name}`); return; }
      if (file.size > LIMIT) { setError(`File too large: ${file.name}`); return; }
    }
    setError("");
    if (target === "files") setFiles((current) => [...current, ...picked].slice(0, 3));
    else setReplyFiles((current) => [...current, ...picked].slice(0, 3));
  }

  async function createTicket() {
    setSaving(true); setError("");
    try {
      const attachments = await Promise.all(files.map(fileToPayload));
      const response = await fetch("/api/v1/support", { method: "POST", headers: { "content-type": "application/json", "x-apollo-route": window.location.pathname }, body: JSON.stringify({ ...form, moduleKey: form.moduleKey || null, pageRoute: form.pageRoute || window.location.pathname || null, attachments }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message || "Unable to create support ticket.");
      setForm({ subject: "", description: "", category: "", priority: "NORMAL", moduleKey: "", pageRoute: "" });
      setFiles([]);
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to create support ticket."); }
    finally { setSaving(false); }
  }

  async function sendReply() {
    if (!modalTicketId || reply.trim().length < 1) return;
    setSaving(true); setError("");
    try {
      const attachments = await Promise.all(replyFiles.map(fileToPayload));
      const response = await fetch(`/api/v1/support/${modalTicketId}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ body: reply, attachments }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message || "Unable to reply.");
      setReply(""); setReplyFiles([]);
      await openTicket(modalTicketId);
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to reply."); }
    finally { setSaving(false); }
  }

  async function changeStatus(status: TenantStatus) {
    if (!modalTicketId) return;
    setStatusSaving(true); setError("");
    try {
      const response = await fetch(`/api/v1/support/${modalTicketId}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message || "Unable to update status.");
      await openTicket(modalTicketId);
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to update status."); }
    finally { setStatusSaving(false); }
  }

  async function deleteTicket(ticket: Ticket) {
    if (!(await confirm({ message: `Delete ticket ${ticket.ticketNumber} — "${ticket.subject}"? This removes the ticket and its full message history. This can't be undone.`, tone: "danger", confirmLabel: "Delete ticket" }))) return;
    setDeletingId(ticket.id); setError("");
    try {
      const response = await fetch(`/api/v1/support/${ticket.id}`, { method: "DELETE" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message || "Unable to delete ticket.");
      if (modalTicketId === ticket.id) closeModal();
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to delete ticket."); }
    finally { setDeletingId(null); }
  }

  const allAttachments = detail ? [...detail.attachments, ...detail.messages.flatMap((message) => message.attachments || [])] : [];

  return (
    <div>
      {error ? <div className="inline-error">{error}</div> : null}
      <div className="platform-grid">
        <section className="detail-panel">
          <header><div><h2>Log an issue</h2></div><div className="header-actions"><button type="button" className="gold-button" disabled={saving || form.subject.trim().length < 3 || form.description.trim().length < 8} onClick={() => void createTicket()}><MessageSquarePlus size={14} /> Submit</button></div></header>
          <div className="drawer-fields">
            <label><span>Subject</span><input value={form.subject} onChange={(e) => setForm((current) => ({ ...current, subject: e.target.value }))} /></label>
            <label><span>Category</span><input value={form.category} onChange={(e) => setForm((current) => ({ ...current, category: e.target.value }))} /></label>
            <label><span>Priority</span><select value={form.priority} onChange={(e) => setForm((current) => ({ ...current, priority: e.target.value }))}><option value="LOW">Low</option><option value="NORMAL">Normal</option><option value="HIGH">High</option><option value="CRITICAL">Critical</option></select></label>
            <label><span>Affected module</span><input value={form.moduleKey} onChange={(e) => setForm((current) => ({ ...current, moduleKey: e.target.value.toUpperCase() }))} placeholder="JOBS_WIP" /></label>
            <label className="wide"><span>Description</span><textarea rows={5} value={form.description} onChange={(e) => setForm((current) => ({ ...current, description: e.target.value }))} /></label>
            <label className="wide"><span>Attachments</span><input type="file" multiple accept=".png,.jpg,.jpeg,.webp,.pdf,.txt,text/plain,application/pdf,image/png,image/jpeg,image/webp" onChange={(e) => validatePicked(e.target.files, "files")} /></label>
          </div>
          {files.length > 0 ? <div className="record-list">{files.map((file, index) => <article key={`${file.name}:${index}`}><div className="record-icon"><Paperclip size={14} /></div><div><strong>{file.name}</strong><span>{Math.round(file.size / 1024)} KB</span></div><button type="button" className="table-action" onClick={() => setFiles((current) => current.filter((_, i) => i !== index))}><X size={14} /> Remove</button></article>)}</div> : null}
        </section>

        <section className="detail-panel">
          <header><div><h2>{isAdmin ? "Support tickets" : "Your tickets"}</h2><p>{tickets.length} ticket{tickets.length === 1 ? "" : "s"}</p></div></header>
          {loading ? <div className="table-state"><Loader2 className="spin" size={18} /> Loading…</div> : (
            <div className="data-table-wrap">
              <table className="data-table">
                <thead><tr><th>Ticket number</th><th>Date received</th><th>User</th><th>Priority</th><th>Status</th><th></th></tr></thead>
                <tbody>
                  {tickets.map((ticket) => (
                    <tr key={ticket.id} className="clickable-row" onClick={() => openModal(ticket)}>
                      <td><strong>{ticket.ticketNumber}</strong><div className="muted">{ticket.subject}</div></td>
                      <td>{fmtDate(ticket.createdAt)}</td>
                      <td>{ticket.reportedBy?.displayName || ticket.reportedBy?.email || "—"}</td>
                      <td><span className={`status-pill ${priorityTone(ticket.priority)}`}>{ticket.priority}</span></td>
                      <td><span className={`status-pill ${statusTone(ticket.status)}`}>{statusLabel(ticket.status)}</span></td>
                      <td className="actions" onClick={(e) => e.stopPropagation()}>
                        <button type="button" className="table-action" onClick={() => openModal(ticket)}>Open</button>
                        {isAdmin && <button type="button" className="table-action" disabled={deletingId === ticket.id} onClick={() => void deleteTicket(ticket)}>{deletingId === ticket.id ? "Deleting…" : <><Trash2 size={13} /> Delete</>}</button>}
                      </td>
                    </tr>
                  ))}
                  {tickets.length === 0 && <tr><td colSpan={6} className="table-state compact-empty-state">No support tickets yet.</td></tr>}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      {modalTicketId && typeof document !== "undefined" && createPortal(
        <div className="drawer-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) closeModal(); }}>
          <aside className="form-drawer compact-dialog support-ticket-dialog" aria-modal="true" role="dialog" aria-label={detail ? `${detail.ticketNumber} — ${detail.subject}` : "Support ticket"}>
            <header>
              <div><p className="eyebrow">{detail ? detail.ticketNumber : "Loading…"}</p><h2>{detail ? detail.subject : ""}</h2></div>
              <button type="button" aria-label="Close" onClick={closeModal}><X size={18} /></button>
            </header>
            <div className="drawer-body">
              {detailLoading && !detail ? <div className="table-state"><Loader2 className="spin" size={18} /> Loading…</div> : detail ? (
                <>
                  <div className="header-actions" style={{ flexWrap: "wrap" }}>
                    <span className={`status-pill ${priorityTone(detail.priority)}`}>{detail.priority}</span>
                    {isAdmin ? (
                      <select aria-label="Status" className="inline-status-select" value={["OPEN", "IN_PROGRESS", "CLOSED"].includes(detail.status) ? detail.status : "OPEN"} disabled={statusSaving} onChange={(e) => void changeStatus(e.target.value as TenantStatus)}><option value="OPEN">Open</option><option value="IN_PROGRESS">In Process</option><option value="CLOSED">Closed</option></select>
                    ) : (
                      <span className={`status-pill ${statusTone(detail.status)}`}>{statusLabel(detail.status)}</span>
                    )}
                    {isAdmin && <button type="button" className="table-action" disabled={deletingId === detail.id} onClick={() => void deleteTicket(detail)}><Trash2 size={13} /> {deletingId === detail.id ? "Deleting…" : "Delete ticket"}</button>}
                  </div>

                  <div className="history-list">
                    {detail.messages.map((message) => (
                      <article key={message.id}>
                        <strong>{message.author?.displayName || "User"}</strong>
                        <span>{message.kind.replaceAll("_", " ")}</span>
                        <time>{new Date(message.createdAt).toLocaleString("en-ZA")}</time>
                        <p>{message.body}</p>
                        {(message.attachments || []).map((attachment) => <a key={attachment.id} href={`/api/v1/support/attachments/${attachment.id}`} target="_blank" rel="noreferrer" className="table-action">{attachment.fileName}</a>)}
                      </article>
                    ))}
                  </div>

                  {allAttachments.length > 0 ? (
                    <section className="detail-panel inner-panel">
                      <header><div><h2>Attachments</h2></div></header>
                      <div className="record-list">{allAttachments.map((attachment) => <article key={attachment.id}><div className="record-icon"><Paperclip size={14} /></div><div><strong>{attachment.fileName}</strong><span>{attachment.mimeType} · {Math.round(attachment.sizeBytes / 1024)} KB</span></div><a href={`/api/v1/support/attachments/${attachment.id}`} target="_blank" rel="noreferrer" className="table-action">Open</a></article>)}</div>
                    </section>
                  ) : null}

                  <div className="drawer-fields">
                    <label className="wide"><span>Reply</span><textarea rows={3} value={reply} onChange={(e) => setReply(e.target.value)} /></label>
                    <label className="wide"><span>Reply attachments</span><input type="file" multiple accept=".png,.jpg,.jpeg,.webp,.pdf,.txt,text/plain,application/pdf,image/png,image/jpeg,image/webp" onChange={(e) => validatePicked(e.target.files, "replyFiles")} /></label>
                  </div>
                  {replyFiles.length > 0 ? <div className="record-list">{replyFiles.map((file, index) => <article key={`${file.name}:${index}`}><div className="record-icon"><Paperclip size={14} /></div><div><strong>{file.name}</strong><span>{Math.round(file.size / 1024)} KB</span></div><button type="button" className="table-action" onClick={() => setReplyFiles((current) => current.filter((_, i) => i !== index))}><X size={14} /> Remove</button></article>)}</div> : null}
                </>
              ) : null}
            </div>
            <footer className="detail-actions">
              <button type="button" className="quiet-button" onClick={closeModal}>Close</button>
              <button type="button" className="gold-button" disabled={saving || reply.trim().length < 1} onClick={() => void sendReply()}><Send size={14} /> Send reply</button>
            </footer>
          </aside>
        </div>,
        document.body,
      )}
      {dialog}
    </div>
  );
}

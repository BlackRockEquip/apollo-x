"use client";

/* eslint-disable react-hooks/set-state-in-effect -- async support loading intentionally mirrors existing workspace patterns */
// 2026-09-10 — split out of what used to be support/page.tsx itself (a
// "use client" page.tsx can't be an async server component, so it couldn't
// fetch the RequestContext the new shared SettingsTabNav needs — see the
// settings-nav.ts header comment). Same ticket logic as before, unchanged;
// the new page.tsx is a thin async server wrapper that renders the header
// + tab bar + this component.
import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, MessageSquarePlus, Paperclip, Send, X } from "lucide-react";

type Attachment = { id: string; fileName: string; mimeType: string; sizeBytes: number };
type Ticket = { id: string; ticketNumber: string; subject: string; priority: string; status: string; category?: string | null; createdAt: string; updatedAt: string; attachments?: Attachment[] };
type TicketMessage = { id: string; body: string; kind: string; createdAt: string; author?: { displayName?: string | null } | null; attachments?: Attachment[] };
type TicketDetail = Ticket & { messages: TicketMessage[]; attachments: Attachment[] };
const ALLOWED = ["image/png", "image/jpeg", "image/webp", "application/pdf", "text/plain"];
const LIMIT = 4_000_000;
async function fileToPayload(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return { fileName: file.name.replace(/[^A-Za-z0-9._ -]/g, "_").slice(0, 160), mimeType: file.type, contentBase64: btoa(binary) };
}

export function SupportWorkspace() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [selected, setSelected] = useState<Ticket | null>(null);
  const [detail, setDetail] = useState<TicketDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ subject: "", description: "", category: "", priority: "NORMAL", moduleKey: "", pageRoute: "" });
  const [reply, setReply] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [replyFiles, setReplyFiles] = useState<File[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/v1/support", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message || "Unable to load support tickets.");
      setTickets(body);
      if (!selected && body[0]) setSelected(body[0]);
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to load support tickets."); }
    finally { setLoading(false); }
  }, [selected]);
  async function openTicket(id: string) { const response = await fetch(`/api/v1/support/${id}`, { cache: "no-store" }); const body = await response.json(); if (!response.ok) throw new Error(body.error?.message || "Unable to load support ticket."); setDetail(body); }
  useEffect(() => { void load().catch((e) => setError(e instanceof Error ? e.message : "Unable to load support tickets.")); }, [load]);
  useEffect(() => { if (selected) void openTicket(selected.id).catch((e) => setError(e instanceof Error ? e.message : "Unable to load support ticket.")); }, [selected]);
  function validatePicked(list: FileList | null, target: "files" | "replyFiles") { const picked = Array.from(list || []); for (const file of picked) { if (!ALLOWED.includes(file.type)) { setError(`Unsupported file type: ${file.name}`); return; } if (file.size > LIMIT) { setError(`File too large: ${file.name}`); return; } } setError(""); if (target === "files") setFiles((current) => [...current, ...picked].slice(0, 3)); else setReplyFiles((current) => [...current, ...picked].slice(0, 3)); }
  async function createTicket() { setSaving(true); setError(""); try { const attachments = await Promise.all(files.map(fileToPayload)); const response = await fetch("/api/v1/support", { method: "POST", headers: { "content-type": "application/json", "x-apollo-route": window.location.pathname }, body: JSON.stringify({ ...form, moduleKey: form.moduleKey || null, pageRoute: form.pageRoute || window.location.pathname || null, attachments }) }); const body = await response.json(); if (!response.ok) throw new Error(body.error?.message || "Unable to create support ticket."); setForm({ subject: "", description: "", category: "", priority: "NORMAL", moduleKey: "", pageRoute: "" }); setFiles([]); await load(); } catch (e) { setError(e instanceof Error ? e.message : "Unable to create support ticket."); } finally { setSaving(false); } }
  async function sendReply() { if (!selected || reply.trim().length < 1) return; setSaving(true); setError(""); try { const attachments = await Promise.all(replyFiles.map(fileToPayload)); const response = await fetch(`/api/v1/support/${selected.id}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ body: reply, attachments }) }); const body = await response.json(); if (!response.ok) throw new Error(body.error?.message || "Unable to reply."); setReply(""); setReplyFiles([]); await openTicket(selected.id); await load(); } catch (e) { setError(e instanceof Error ? e.message : "Unable to reply."); } finally { setSaving(false); } }
  const allAttachments = useMemo(() => detail ? [...detail.attachments, ...detail.messages.flatMap((message) => message.attachments || [])] : [], [detail]);
  return <div>{error ? <div className="inline-error">{error}</div> : null}<div className="platform-grid"><section className="detail-panel"><header><div><h2>Log an issue</h2></div><div className="header-actions"><button type="button" className="gold-button" disabled={saving || form.subject.trim().length < 3 || form.description.trim().length < 8} onClick={() => void createTicket()}><MessageSquarePlus size={14} /> Submit</button></div></header><div className="drawer-fields"><label><span>Subject</span><input value={form.subject} onChange={(e) => setForm((current) => ({ ...current, subject: e.target.value }))} /></label><label><span>Category</span><input value={form.category} onChange={(e) => setForm((current) => ({ ...current, category: e.target.value }))} /></label><label><span>Priority</span><select value={form.priority} onChange={(e) => setForm((current) => ({ ...current, priority: e.target.value }))}><option value="LOW">Low</option><option value="NORMAL">Normal</option><option value="HIGH">High</option><option value="CRITICAL">Critical</option></select></label><label><span>Affected module</span><input value={form.moduleKey} onChange={(e) => setForm((current) => ({ ...current, moduleKey: e.target.value.toUpperCase() }))} placeholder="JOBS_WIP" /></label><label className="wide"><span>Description</span><textarea rows={5} value={form.description} onChange={(e) => setForm((current) => ({ ...current, description: e.target.value }))} /></label><label className="wide"><span>Attachments</span><input type="file" multiple accept=".png,.jpg,.jpeg,.webp,.pdf,.txt,text/plain,application/pdf,image/png,image/jpeg,image/webp" onChange={(e) => validatePicked(e.target.files, "files")} /></label></div>{files.length > 0 ? <div className="record-list">{files.map((file, index) => <article key={`${file.name}:${index}`}><div className="record-icon"><Paperclip size={14} /></div><div><strong>{file.name}</strong><span>{Math.round(file.size / 1024)} KB</span></div><button type="button" className="table-action" onClick={() => setFiles((current) => current.filter((_, i) => i !== index))}><X size={14} /> Remove</button></article>)}</div> : null}</section><section className="detail-panel"><header><div><h2>Your tickets</h2><p>{tickets.length} ticket{tickets.length === 1 ? "" : "s"}</p></div></header>{loading ? <div className="table-state"><Loader2 className="spin" size={18} /> Loading…</div> : <div className="record-list support-ticket-list">{tickets.map((ticket) => <article key={ticket.id} className={selected?.id === ticket.id ? "active-record" : ""} onClick={() => setSelected(ticket)}><div className="record-icon">SUP</div><div><strong>{ticket.ticketNumber} · {ticket.subject}</strong><span>{ticket.priority} · {ticket.status}{ticket.category ? ` · ${ticket.category}` : ""}</span></div></article>)}{tickets.length === 0 && <div className="table-state compact-empty-state">No support tickets yet.</div>}</div>}</section></div>{detail && <section className="detail-panel"><header><div><h2>{detail.ticketNumber}</h2><p>{detail.subject}</p></div></header><div className="history-list">{detail.messages.map((message) => <article key={message.id}><strong>{message.author?.displayName || "User"}</strong><span>{message.kind.replaceAll("_", " ")}</span><time>{new Date(message.createdAt).toLocaleString("en-ZA")}</time><p>{message.body}</p>{(message.attachments || []).map((attachment) => <a key={attachment.id} href={`/api/v1/support/attachments/${attachment.id}`} target="_blank" rel="noreferrer" className="table-action">{attachment.fileName}</a>)}</article>)}</div>{allAttachments.length > 0 ? <section className="detail-panel inner-panel"><header><div><h2>Attachments</h2></div></header><div className="record-list">{allAttachments.map((attachment) => <article key={attachment.id}><div className="record-icon"><Paperclip size={14} /></div><div><strong>{attachment.fileName}</strong><span>{attachment.mimeType} · {Math.round(attachment.sizeBytes / 1024)} KB</span></div><a href={`/api/v1/support/attachments/${attachment.id}`} target="_blank" rel="noreferrer" className="table-action">Open</a></article>)}</div></section> : null}<div className="drawer-fields"><label className="wide"><span>Reply</span><textarea rows={3} value={reply} onChange={(e) => setReply(e.target.value)} /></label><label className="wide"><span>Reply attachments</span><input type="file" multiple accept=".png,.jpg,.jpeg,.webp,.pdf,.txt,text/plain,application/pdf,image/png,image/jpeg,image/webp" onChange={(e) => validatePicked(e.target.files, "replyFiles")} /></label></div>{replyFiles.length > 0 ? <div className="record-list">{replyFiles.map((file, index) => <article key={`${file.name}:${index}`}><div className="record-icon"><Paperclip size={14} /></div><div><strong>{file.name}</strong><span>{Math.round(file.size / 1024)} KB</span></div><button type="button" className="table-action" onClick={() => setReplyFiles((current) => current.filter((_, i) => i !== index))}><X size={14} /> Remove</button></article>)}</div> : null}<footer className="detail-actions"><button type="button" className="gold-button" disabled={saving || reply.trim().length < 1} onClick={() => void sendReply()}><Send size={14} /> Send reply</button></footer></section>}</div>;
}

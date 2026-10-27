"use client";

/* eslint-disable react-hooks/set-state-in-effect -- async loading mirrors the other platform workspaces */
import { useEffect, useMemo, useRef, useState } from "react";
import { Eye, ImagePlus, Plus, Trash2, X } from "lucide-react";
import { useConfirmDialog } from "@/components/ConfirmDialog";
import { MAX_AD_IMAGE_BYTES, MAX_SLOTS, WEEKDAY_LABELS, localParts, type AdSlot } from "@/lib/ads/model";
import type { AdCompanyOption, AdRow } from "@/lib/ads/service";
import { SIDEBAR_AD_STYLES, SupplierAdCard } from "@/components/SidebarAd";

// 2026-10-23, user request: Platform > Advertising. Left: the ads. Right: the selected ad - what it says, who sees it, its
// picture and up to 10 timeslots (weekdays + times + a date range, South African time) - and a week preview of who shows when.
// Companies that have no ad at a given moment see Flo X's own card. Several ads in the same slot rotate.

type Form = { advertiser: string; headline: string; body: string; buttonText: string; linkUrl: string; active: boolean; audience: "ALL" | "SELECTED"; companyIds: string[]; slots: AdSlot[] };
const EMPTY: Form = { advertiser: "", headline: "", body: "", buttonText: "", linkUrl: "", active: true, audience: "ALL", companyIds: [], slots: [] };
const PALETTE = ["#7aa7ee", "#e5b64a", "#6fc4a0", "#c79bea", "#f0937a", "#8fd0e0"];

function fromRow(row: AdRow): Form {
  return { advertiser: row.advertiser, headline: row.headline, body: row.body, buttonText: row.buttonText, linkUrl: row.linkUrl, active: row.active, audience: row.audience, companyIds: row.companyIds, slots: row.slots.map((s) => ({ ...s, days: [...s.days] })) };
}
function newSlot(): AdSlot {
  const today = localParts(new Date()).date;
  const end = new Date(`${today}T00:00:00Z`);
  end.setUTCDate(end.getUTCDate() + 30);
  return { days: [0, 1, 2, 3, 4], from: "08:00", to: "17:00", startDate: today, endDate: end.toISOString().slice(0, 10) };
}
const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "AD";
function errorText(body: { error?: { message?: string; fields?: Record<string, string[] | undefined> } }, fallback: string) {
  const fields = body.error?.fields ? Object.values(body.error.fields).flat().filter(Boolean) : [];
  return fields.length ? (fields as string[]).join(" ") : body.error?.message || fallback;
}
function slotsCoverBand(slot: AdSlot, date: string, weekday: number, bandStart: number, bandEnd: number) {
  if (date < slot.startDate || date > slot.endDate || !slot.days.includes(weekday)) return false;
  const from = Number(slot.from.slice(0, 2)) * 60 + Number(slot.from.slice(3, 5));
  const to = Number(slot.to.slice(0, 2)) * 60 + Number(slot.to.slice(3, 5));
  return from < bandEnd && to > bandStart;
}
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const prettyDate = (iso: string) => `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1] ?? ""} ${iso.slice(0, 4)}`;
/** [0,1,2,3,4] -> "Mon-Fri"; [0,2,4] -> "Mon, Wed, Fri". */
function prettyDays(days: number[]) {
  const list = Array.from(new Set(days)).sort((a, b) => a - b);
  if (list.length === 7) return "Every day";
  const runs: number[][] = [];
  for (const d of list) {
    const last = runs[runs.length - 1];
    if (last && last[last.length - 1] === d - 1) last.push(d); else runs.push([d]);
  }
  return runs.map((r) => (r.length >= 3 ? `${WEEKDAY_LABELS[r[0]]}-${WEEKDAY_LABELS[r[r.length - 1]]}` : r.map((d) => WEEKDAY_LABELS[d]).join(", "))).join(", ");
}

const stateLabel = (ad: AdRow) => (ad.state === "live" ? "Live now" : ad.state === "scheduled" ? `Next: ${ad.nextLive}` : ad.state === "paused" ? "Paused" : "No slots");

export function AdvertisingWorkspace() {
  const [ads, setAds] = useState<AdRow[]>([]);
  const [companies, setCompanies] = useState<AdCompanyOption[]>([]);
  const [selected, setSelected] = useState<string | "new" | null>(null);
  const [form, setForm] = useState<Form>(EMPTY);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [companyFilter, setCompanyFilter] = useState("");
  // 2026-10-27, user request: preview an ad that is already allocated, straight from the list, without opening it for editing.
  const [previewAdId, setPreviewAdId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const { confirm, dialog } = useConfirmDialog();

  // silent = refresh the list in the background (no "Loading" flash, the open form is left as it is).
  async function load(keep?: string | "new" | null, silent = false) {
    if (!silent) setLoading(true);
    try {
      const r = await fetch("/api/v1/platform/ads", { cache: "no-store" });
      const b = await r.json();
      if (!r.ok) throw new Error(errorText(b, "Unable to load the ads."));
      setAds(b.ads);
      setCompanies(b.companies);
      if (keep !== undefined && keep !== null && keep !== "new") {
        const row = (b.ads as AdRow[]).find((a) => a.id === keep);
        if (row) { setSelected(row.id); setForm(fromRow(row)); }
      }
    } catch (e) {
      if (!silent) setError(e instanceof Error ? e.message : "Unable to load the ads.");
    } finally {
      if (!silent) setLoading(false);
    }
  }
  useEffect(() => { void load(); }, []);
  // The screen keeps itself up to date: every 30 seconds and whenever the tab is shown again (live / scheduled labels, views, clicks).
  useEffect(() => {
    const refresh = () => { if (document.visibilityState === "visible") void load(undefined, true); };
    const timer = setInterval(refresh, 30000);
    document.addEventListener("visibilitychange", refresh);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", refresh); };
  }, []);
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  const row = ads.find((a) => a.id === selected) ?? null;
  const dirty = useMemo(() => selected === "new" || Boolean(pendingFile) || (row ? JSON.stringify(fromRow(row)) !== JSON.stringify(form) : false), [selected, pendingFile, row, form]);

  function select(id: string | "new") {
    setError(""); setNotice(""); setPendingFile(null); setPreviewUrl(null); setCompanyFilter("");
    setSelected(id);
    setForm(id === "new" ? { ...EMPTY, slots: [newSlot()] } : fromRow(ads.find((a) => a.id === id) as AdRow));
  }
  const patch = (changes: Partial<Form>) => setForm((f) => ({ ...f, ...changes }));
  const patchSlot = (index: number, changes: Partial<AdSlot>) => setForm((f) => ({ ...f, slots: f.slots.map((s, i) => (i === index ? { ...s, ...changes } : s)) }));
  const toggleDay = (index: number, day: number) => setForm((f) => ({ ...f, slots: f.slots.map((s, i) => (i === index ? { ...s, days: s.days.includes(day) ? s.days.filter((d) => d !== day) : [...s.days, day].sort() } : s)) }));

  function chooseFile(file: File | null) {
    if (!file) return;
    if (file.size > MAX_AD_IMAGE_BYTES) { setError(`The image is too large. Use a file under ${Math.round(MAX_AD_IMAGE_BYTES / 1024)} KB.`); return; }
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) { setError("Use a PNG, JPG or WebP image."); return; }
    setError("");
    setPendingFile(file);
    setPreviewUrl(URL.createObjectURL(file));
  }

  async function save(changes: Partial<Form> = {}, doneNotice = "Ad saved.") {
    setSaving(true); setError(""); setNotice("");
    try {
      const isNew = selected === "new";
      const r = await fetch(isNew ? "/api/v1/platform/ads" : `/api/v1/platform/ads/${selected}`, { method: isNew ? "POST" : "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...form, ...changes }) });
      const b = await r.json();
      if (!r.ok) throw new Error(errorText(b, "Unable to save the ad."));
      const id = (b as AdRow).id;
      if (pendingFile) {
        const data = new FormData();
        data.append("file", pendingFile);
        const up = await fetch(`/api/v1/platform/ads/${id}/image`, { method: "POST", body: data });
        if (!up.ok) throw new Error(errorText(await up.json(), "The ad was saved, but the image could not be uploaded."));
      }
      setPendingFile(null); setPreviewUrl(null);
      setNotice(doneNotice);
      await load(id, true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save the ad.");
    } finally {
      setSaving(false);
    }
  }

  async function removeImage() {
    if (pendingFile) { setPendingFile(null); setPreviewUrl(null); return; }
    if (!row) return;
    setError("");
    const r = await fetch(`/api/v1/platform/ads/${row.id}/image`, { method: "DELETE" });
    if (!r.ok) { setError(errorText(await r.json(), "Unable to remove the image.")); return; }
    await load(row.id, true);
  }

  async function remove() {
    if (!row) return;
    if (!(await confirm({ title: "Delete ad", message: `Delete the ad ${row.headline ? `"${row.headline}" ` : ""}for ${row.advertiser}? Its views and clicks are lost.`, confirmLabel: "Delete", tone: "danger" }))) return;
    const r = await fetch(`/api/v1/platform/ads/${row.id}`, { method: "DELETE" });
    if (!r.ok) { setError(errorText(await r.json(), "Unable to delete the ad.")); return; }
    setSelected(null); setForm(EMPTY); setNotice("Ad deleted.");
    await load(undefined, true);
  }

  // ---- week preview: this week, 2-hour bands, saved ads plus the unsaved edits of the open one
  const preview = useMemo(() => {
    const today = localParts(new Date());
    const monday = new Date(`${today.date}T00:00:00Z`);
    monday.setUTCDate(monday.getUTCDate() - today.weekday);
    const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(monday); d.setUTCDate(d.getUTCDate() + i); return d.toISOString().slice(0, 10); });
    const list = ads.filter((a) => a.id !== selected).map((a) => ({ key: a.id, name: a.advertiser, active: a.active, slots: a.slots }));
    if (selected) list.push({ key: selected, name: form.advertiser || "This ad", active: form.active, slots: form.slots });
    const bands = [6, 8, 10, 12, 14, 16, 18, 20];
    const rows = bands.map((start) => ({
      label: `${String(start).padStart(2, "0")}–${String(start + 2).padStart(2, "0")}`,
      cells: days.map((date, weekday) => list.map((ad, index) => ({ ad, index })).filter(({ ad }) => ad.active && ad.slots.some((s) => slotsCoverBand(s, date, weekday, start * 60, (start + 2) * 60))).map(({ ad, index }) => ({ name: ad.name, color: PALETTE[index % PALETTE.length] }))),
    }));
    return { rows, days, legend: list.map((ad, index) => ({ name: ad.name, color: PALETTE[index % PALETTE.length] })) };
  }, [ads, selected, form]);

  const visibleCompanies = companies.filter((c) => !companyFilter.trim() || `${c.name} ${c.code}`.toLowerCase().includes(companyFilter.trim().toLowerCase()));
  const imageSrc = previewUrl ?? (row?.hasImage ? `/api/v1/ads/${row.id}/image?v=${row.imageVersion}` : null);
  const editing = selected !== null;
  const previewAd = previewAdId ? ads.find((a) => a.id === previewAdId) ?? null : null;
  // Preview: the real sidebar card built from what is typed and the chosen picture, so the picture can be judged before saving.
  const [imageInfo, setImageInfo] = useState<{ w: number; h: number } | null>(null);
  useEffect(() => {
    if (!imageSrc) { setImageInfo(null); return; }
    let cancelled = false;
    const probe = new window.Image();
    probe.onload = () => { if (!cancelled) setImageInfo({ w: probe.naturalWidth, h: probe.naturalHeight }); };
    probe.onerror = () => { if (!cancelled) setImageInfo(null); };
    probe.src = imageSrc;
    return () => { cancelled = true; };
  }, [imageSrc]);
  const imageWarning = imageInfo
    ? imageInfo.w < 420 ? "This picture is small and may look soft in the sidebar. A width of 500 px or more is best."
      : imageInfo.w / imageInfo.h > 6 ? "This picture is very wide, so it will appear as a thin strip."
        : imageInfo.h / imageInfo.w > 1.6 ? "This picture is very tall, so it will appear narrow with white sides."
          : ""
    : "";

  return (
    <>
      <style>{STYLES}</style>
      {dialog}
      {previewAd ? (
        <AdPreviewDialog
          ad={previewAd}
          companies={companies}
          onClose={() => setPreviewAdId(null)}
          onEdit={() => { const id = previewAd.id; setPreviewAdId(null); select(id); }}
        />
      ) : null}
      {error ? <div className="inline-error">{error}</div> : null}
      {notice ? <div className="inline-success">{notice}</div> : null}
      <div className="adv-grid">
        <section className="detail-panel adv-list">
          <h3>Ads</h3>
          {loading && ads.length === 0 ? <p className="muted small-line">Loading…</p> : null}
          {ads.map((ad, index) => (
            <div key={ad.id} className="adv-row">
              <button type="button" className={selected === ad.id ? "adv-item sel" : "adv-item"} onClick={() => select(ad.id)}>
                <span className="adv-thumb" style={{ background: PALETTE[index % PALETTE.length] }}>{ad.hasImage ? <img src={`/api/v1/ads/${ad.id}/image?v=${ad.imageVersion}`} alt="" /> : initials(ad.advertiser)}</span>
                <span className="adv-meta"><b>{ad.advertiser}</b><small>{ad.slots.length} of {MAX_SLOTS} slots · {ad.views} views · {ad.clicks} clicks</small></span>
                <span className={`adv-pill ${ad.state}`}>{stateLabel(ad)}</span>
              </button>
              <button type="button" className="adv-eye" aria-label={`Preview the ${ad.advertiser} ad`} title="Preview" onClick={() => setPreviewAdId(ad.id)}><Eye size={15} /></button>
            </div>
          ))}
          {!loading && ads.length === 0 ? <p className="muted small-line">No ads yet. Companies see the Flo X card.</p> : null}
          <div style={{ marginTop: 10 }}><button type="button" className="gold-button" onClick={() => select("new")}><Plus size={14} /> New ad</button></div>
          <div className="adv-note"><b>When no ad is scheduled</b><span>Companies see the Flo X card. Companies with ads switched off, and platform support sessions, see nothing.</span></div>
        </section>

        <section className="detail-panel adv-edit">
          {!editing ? (
            <div className="adv-empty"><p><b>Select an ad</b> on the left, or create a new one.</p><p className="muted small-line">Each ad can have up to {MAX_SLOTS} timeslots. When two ads are live in the same slot they take turns in the sidebar.</p></div>
          ) : (
            <>
              <div className="adv-head">
                <h3>{selected === "new" ? "New ad" : `Edit ad — ${row?.advertiser ?? ""}`}</h3>
                <div className="adv-actions">
                  {row ? <button type="button" className="quiet-button" disabled={saving} onClick={() => void save({ active: !form.active }, form.active ? "Ad paused - companies no longer see it." : "Ad resumed.")}>{form.active ? "Pause" : "Resume"}</button> : null}
                  {row ? <button type="button" className="quiet-button danger" onClick={() => void remove()}><Trash2 size={13} /> Delete</button> : null}
                  <button type="button" className="gold-button" disabled={saving || !dirty} onClick={() => void save()}>{saving ? "Saving…" : "Save ad"}</button>
                </div>
              </div>
              {!form.active ? <p className="adv-paused">This ad is paused and will not show to any company. Press Resume to show it again.</p> : null}
              <div className="adv-fields">
                <label><span>Advertiser / supplier</span><input value={form.advertiser} maxLength={120} onChange={(e) => patch({ advertiser: e.target.value })} /></label>
                <label><span>Button link</span><input value={form.linkUrl} maxLength={500} placeholder="https://" onChange={(e) => patch({ linkUrl: e.target.value })} /></label>
                <label><span>Headline (optional)</span><input value={form.headline} maxLength={80} onChange={(e) => patch({ headline: e.target.value })} /></label>
                <label><span>Button text (optional)</span><input value={form.buttonText} maxLength={24} placeholder="e.g. Learn more" onChange={(e) => patch({ buttonText: e.target.value })} /></label>
                <label className="wide"><span>Text, one line (optional)</span><input value={form.body} maxLength={160} onChange={(e) => patch({ body: e.target.value })} /></label>
                <div className="adv-image">
                  <span className="adv-label">Image</span>
                  <div className="adv-image-row">
                    <span className="adv-image-box">{imageSrc ? <img src={imageSrc} alt="" /> : <ImagePlus size={20} />}</span>
                    <span className="adv-image-actions">
                      <button type="button" className="quiet-button" onClick={() => fileInput.current?.click()}>{imageSrc ? "Replace" : "Choose image"}</button>
                      {imageSrc ? <button type="button" className="quiet-button" onClick={() => void removeImage()}>Remove</button> : null}
                      <small className="muted">PNG, JPG or WebP, under {Math.round(MAX_AD_IMAGE_BYTES / 1024)} KB. Any shape works - the picture is shown whole and scaled to fit the sidebar. Leave the headline, text and button empty to show just the picture (the whole picture is the link).</small>
                    </span>
                    <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => { chooseFile(e.target.files?.[0] ?? null); e.target.value = ""; }} />
                  </div>
                </div>
                <div className="adv-preview">
                  <span className="adv-label">Preview — how it looks in a company's sidebar</span>
                  <div className="adv-preview-row">
                    <div className="adv-preview-sidebar">
                      <style>{SIDEBAR_AD_STYLES}</style>
                      <SupplierAdCard
                        preview
                        href="#"
                        ad={{ id: "preview", advertiser: form.advertiser.trim() || "Advertiser", headline: form.headline.trim(), body: form.body.trim(), buttonText: form.buttonText.trim(), imageUrl: imageSrc }}
                      />
                    </div>
                    <div className="adv-preview-notes">
                      <p>{imageSrc ? (!form.headline.trim() && !form.body.trim() && !form.buttonText.trim() ? "Picture only: the whole picture is the link." : "Picture with text underneath.") : "No picture yet: the advertiser name shows on a blue banner."}</p>
                      {imageInfo ? <p>Picture: {imageInfo.w} × {imageInfo.h} px{pendingFile ? `, ${Math.max(1, Math.round(pendingFile.size / 1024))} KB` : ""}. It is shown whole, scaled to fit.</p> : null}
                      {imageWarning ? <p className="adv-preview-warn">{imageWarning}</p> : null}
                      <p className="muted">Nothing is saved or shown to companies until you press Save ad.</p>
                    </div>
                  </div>
                </div>
                <label><span>Show to</span>
                  <select value={form.audience} onChange={(e) => patch({ audience: e.target.value as "ALL" | "SELECTED" })}>
                    <option value="ALL">All companies</option>
                    <option value="SELECTED">Selected companies</option>
                  </select>
                </label>
              </div>

              {form.audience === "SELECTED" ? (
                <div className="adv-companies">
                  <div className="adv-companies-head">
                    <b>Companies that see this ad ({form.companyIds.length} chosen)</b>
                    <input placeholder="Search companies" value={companyFilter} onChange={(e) => setCompanyFilter(e.target.value)} />
                    <button type="button" className="quiet-button" onClick={() => patch({ companyIds: Array.from(new Set([...form.companyIds, ...visibleCompanies.map((c) => c.id)])) })}>Tick shown</button>
                    <button type="button" className="quiet-button" onClick={() => patch({ companyIds: [] })}>Clear</button>
                  </div>
                  <div className="adv-company-list">
                    {visibleCompanies.map((c) => (
                      <label key={c.id}><input type="checkbox" checked={form.companyIds.includes(c.id)} onChange={(e) => patch({ companyIds: e.target.checked ? [...form.companyIds, c.id] : form.companyIds.filter((id) => id !== c.id) })} /><span>{c.name}</span><small>{c.code}</small></label>
                    ))}
                    {visibleCompanies.length === 0 ? <p className="muted small-line">No companies match.</p> : null}
                  </div>
                </div>
              ) : null}

              <div className="adv-slots">
                <div className="adv-slots-head">
                  <div><b>Timeslots</b><div className="adv-bar"><i style={{ width: `${(form.slots.length / MAX_SLOTS) * 100}%` }} /></div></div>
                  <div><span className="adv-count">{form.slots.length} of {MAX_SLOTS} used</span> <button type="button" className="quiet-button" disabled={form.slots.length >= MAX_SLOTS} onClick={() => patch({ slots: [...form.slots, newSlot()] })}><Plus size={13} /> Add timeslot</button></div>
                </div>
                {form.slots.length === 0 ? <p className="adv-help">No timeslots yet, so this ad will not show. Add at least one.</p> : (
                  <div className="data-table-wrap">
                    <table className="data-table adv-table">
                      <thead><tr><th>#</th><th>Days</th><th>From</th><th>To</th><th>Start date</th><th>End date</th><th></th></tr></thead>
                      <tbody>
                        {form.slots.map((slot, index) => (
                          <tr key={index}>
                            <td>{index + 1}</td>
                            <td>{WEEKDAY_LABELS.map((label, day) => <button type="button" key={label} className={slot.days.includes(day) ? "adv-day on" : "adv-day"} title={label} aria-pressed={slot.days.includes(day)} onClick={() => toggleDay(index, day)}>{label[0]}</button>)}</td>
                            <td><input type="time" value={slot.from} onChange={(e) => patchSlot(index, { from: e.target.value })} /></td>
                            <td><input type="time" value={slot.to} onChange={(e) => patchSlot(index, { to: e.target.value })} /></td>
                            <td><input type="date" value={slot.startDate} onChange={(e) => patchSlot(index, { startDate: e.target.value })} /></td>
                            <td><input type="date" value={slot.endDate} onChange={(e) => patchSlot(index, { endDate: e.target.value })} /></td>
                            <td><button type="button" className="adv-x" title="Remove timeslot" onClick={() => patch({ slots: form.slots.filter((_, i) => i !== index) })}>×</button></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <p className="adv-help">Times are South African time. A slot runs on the ticked days between its start and end date, from the start time until just before the end time.</p>
              </div>

              <div className="adv-preview">
                <b>This week — who is showing when</b>
                <div className="adv-week">
                  <div className="h" />
                  {WEEKDAY_LABELS.map((label, i) => <div className="h" key={label}>{label} {preview.days[i].slice(8, 10)}</div>)}
                  {preview.rows.map((r) => (
                    <FragmentRow key={r.label} label={r.label} cells={r.cells} />
                  ))}
                </div>
                <div className="adv-legend">{preview.legend.map((l) => <span key={l.name + l.color}><i style={{ background: l.color }} />{l.name}</span>)}<span><i className="flox" />Flo X (default)</span></div>
              </div>
            </>
          )}
        </section>
      </div>
    </>
  );
}

/** Read-only look at an ad that is already saved: the real sidebar card, who it is allocated to and when it runs. */
function AdPreviewDialog({ ad, companies, onClose, onEdit }: { ad: AdRow; companies: AdCompanyOption[]; onClose: () => void; onEdit: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  const imageUrl = ad.hasImage ? `/api/v1/ads/${ad.id}/image?v=${ad.imageVersion}` : null;
  const names = ad.audience === "SELECTED" ? ad.companyIds.map((id) => companies.find((c) => c.id === id)?.name).filter((n): n is string => Boolean(n)) : [];
  const shown = names.slice(0, 8);
  return (
    <div className="adv-modal-back" onClick={onClose}>
      <div className="adv-modal" role="dialog" aria-modal="true" aria-label={`Preview of the ${ad.advertiser} ad`} onClick={(e) => e.stopPropagation()}>
        <style>{SIDEBAR_AD_STYLES}</style>
        <header className="adv-modal-head">
          <div><b>{ad.advertiser}</b><small>{ad.headline || "Picture only"}</small></div>
          <span className={`adv-pill ${ad.state}`}>{stateLabel(ad)}</span>
          <button type="button" className="adv-eye" aria-label="Close preview" onClick={onClose}><X size={16} /></button>
        </header>
        <div className="adv-modal-body">
          <div className="adv-modal-side">
            <span className="adv-label">As a company sees it</span>
            <div className="adv-preview-sidebar">
              <SupplierAdCard preview ad={{ id: ad.id, advertiser: ad.advertiser, headline: ad.headline, body: ad.body, buttonText: ad.buttonText, imageUrl }} href="#" />
            </div>
          </div>
          <dl className="adv-modal-facts">
            <div><dt>Shown to</dt><dd>{ad.audience === "ALL" ? `All companies (${companies.length})` : `${ad.companyIds.length} selected ${ad.companyIds.length === 1 ? "company" : "companies"}`}
              {ad.audience === "SELECTED" ? <span className="adv-chips">{shown.map((n) => <i key={n}>{n}</i>)}{names.length > shown.length ? <i>+{names.length - shown.length} more</i> : null}</span> : null}</dd></div>
            <div><dt>Timeslots</dt><dd>{ad.slots.length === 0 ? "None yet, so it never shows." : <ul>{ad.slots.map((slot, i) => <li key={i}><b>{prettyDays(slot.days)}</b> {slot.from}-{slot.to}<small>{prettyDate(slot.startDate)} to {prettyDate(slot.endDate)}</small></li>)}</ul>}</dd></div>
            <div><dt>Status</dt><dd>{!ad.active ? "Paused - companies do not see it." : ad.state === "live" ? "Live now." : ad.state === "scheduled" ? `Not showing yet. Next: ${ad.nextLive}.` : "Active, but no timeslot is running."}</dd></div>
            <div><dt>Results</dt><dd>{ad.views} views, {ad.clicks} clicks{ad.views > 0 ? ` (${((ad.clicks / ad.views) * 100).toFixed(1)}%)` : ""}</dd></div>
            <div><dt>Link</dt><dd className="adv-link">{ad.linkUrl || "None"}</dd></div>
          </dl>
        </div>
        <footer className="adv-modal-foot"><button type="button" className="quiet-button" onClick={onClose}>Close</button><button type="button" className="gold-button" onClick={onEdit}>Edit this ad</button></footer>
      </div>
    </div>
  );
}

function FragmentRow({ label, cells }: { label: string; cells: { name: string; color: string }[][] }) {
  return (
    <>
      <div className="l">{label}</div>
      {cells.map((cell, i) => cell.length === 0
        ? <div key={i} className="c">Flo X</div>
        : <div key={i} className="c on" title={cell.map((x) => x.name).join(" + ")} style={{ background: cell[0].color }}>{cell.length > 1 ? `${cell.length} ads` : cell[0].name}</div>)}
    </>
  );
}

const STYLES = `
.adv-row{display:flex;align-items:stretch;gap:4px;margin-bottom:6px}.adv-row .adv-item{flex:1;min-width:0;margin-bottom:0}
.adv-eye{display:grid;flex:none;width:34px;place-items:center;border:1px solid transparent;border-radius:8px;background:transparent;color:var(--ink-500);cursor:pointer}
.adv-eye:hover{background:var(--ink-50,#f4f6fa);color:var(--ink-900,#172033)}
.adv-modal-back{position:fixed;inset:0;z-index:80;display:grid;place-items:center;padding:20px;background:rgba(7,17,31,.55)}
.adv-modal{display:flex;flex-direction:column;width:min(720px,100%);max-height:calc(100vh - 40px);border-radius:14px;background:#fff;box-shadow:0 24px 60px rgba(7,17,31,.35);overflow:hidden}
.adv-modal-head{display:flex;align-items:center;gap:12px;padding:14px 16px;border-bottom:1px solid var(--line,#e2e6ec)}.adv-modal-head>div{display:grid;flex:1;min-width:0}.adv-modal-head small{color:var(--ink-500);font-size:12px}
.adv-modal-body{display:flex;flex-wrap:wrap;gap:20px;padding:16px;overflow-y:auto}
.adv-modal-side{display:grid;flex:0 0 242px;gap:6px;align-content:start}
.adv-modal-facts{flex:1 1 260px;display:grid;gap:12px;margin:0;align-content:start}.adv-modal-facts div{display:grid;gap:3px}
.adv-modal-facts dt{font-size:10.5px;font-weight:800;color:var(--ink-500);text-transform:uppercase;letter-spacing:.06em}.adv-modal-facts dd{margin:0;font-size:13px}
.adv-modal-facts ul{margin:0;padding:0;list-style:none;display:grid;gap:6px}.adv-modal-facts li small{display:block;color:var(--ink-500);font-size:11.5px}
.adv-chips{display:flex;flex-wrap:wrap;gap:5px;margin-top:6px}.adv-chips i{padding:2px 8px;border-radius:999px;background:#eceff4;font-size:11.5px;font-style:normal}
.adv-link{word-break:break-all;color:var(--ink-500)}
.adv-modal-foot{display:flex;justify-content:flex-end;gap:8px;padding:12px 16px;border-top:1px solid var(--line,#e2e6ec)}
.adv-grid{display:grid;grid-template-columns:minmax(260px,330px) minmax(0,1fr);gap:16px;align-items:start}
@media (max-width:1000px){.adv-grid{grid-template-columns:1fr}}
.adv-grid>.detail-panel{padding:16px}
.adv-help{margin:8px 0 0;color:var(--ink-500);font-size:11.5px;line-height:1.4}
.adv-grid h3{margin:0 0 10px;font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:var(--ink-700)}
.adv-item{display:flex;width:100%;align-items:center;gap:10px;padding:9px;margin-bottom:6px;border:1px solid transparent;border-radius:8px;background:transparent;cursor:pointer;text-align:left;font:inherit;color:inherit}
.adv-item:hover{background:var(--ink-50,#f4f6fa)}.adv-item.sel{border-color:var(--blue-600);background:var(--blue-100,#eef4ff)}
.adv-thumb{display:grid;flex:none;width:38px;height:38px;place-items:center;overflow:hidden;border-radius:8px;color:#fff;font-size:11px;font-weight:900}
.adv-thumb img,.adv-image-box img{width:100%;height:100%;object-fit:cover}
.adv-meta{display:grid;min-width:0;flex:1}.adv-meta b{overflow:hidden;font-size:12.5px;text-overflow:ellipsis;white-space:nowrap}.adv-meta small{color:var(--ink-500);font-size:11px}
.adv-pill{flex:none;border-radius:20px;padding:3px 8px;font-size:10px;font-weight:800;background:#eceff4;color:#6b7689;white-space:nowrap}
.adv-pill.live{background:#dff5e9;color:#1f8a5b}.adv-pill.scheduled{background:#fff3d6;color:#9a7211}
.adv-note{display:grid;gap:3px;margin-top:12px;padding:10px;border-radius:8px;background:var(--navy-950,#07111f);color:#9db0c9;font-size:11px}.adv-note b{color:#fff;font-size:12px}
.adv-empty{padding:30px 10px;text-align:center}
.adv-head{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px;margin-bottom:12px}.adv-head h3{margin:0}
.adv-actions{display:flex;flex-wrap:wrap;gap:8px}
.quiet-button.danger{color:#b3261e}
.adv-paused{margin:0 0 12px;padding:8px 10px;border-radius:7px;background:#fff3d6;color:#7a5a0e;font-size:12px}
.adv-fields{display:grid;grid-template-columns:1fr 1fr;gap:10px 14px}
.adv-fields .wide,.adv-image{grid-column:1/-1}
.adv-fields label{display:grid;gap:4px}.adv-fields label>span,.adv-label{font-size:10.5px;font-weight:800;color:var(--ink-500);text-transform:uppercase;letter-spacing:.06em}
.adv-fields input,.adv-fields select,.adv-table input,.adv-companies-head input{min-height:36px;border:1px solid var(--ink-300);border-radius:7px;background:#fff;padding:6px 9px;font:inherit;width:100%}
.adv-preview{grid-column:1/-1}
.adv-preview-row{display:flex;flex-wrap:wrap;align-items:flex-start;gap:16px;margin-top:4px}
.adv-preview-sidebar{flex:none;width:242px;box-sizing:border-box;padding:14px;border-radius:10px;background:var(--navy-950,#0c1a2c)}
.adv-preview-sidebar .sb-ad{margin:0}
.adv-preview-notes{min-width:200px;flex:1}
.adv-preview-notes p{margin:0 0 7px;font-size:12px;line-height:1.45;color:var(--ink-700)}
.adv-preview-notes .adv-preview-warn{color:#9a5b00;font-weight:600}
.adv-image-row{display:flex;align-items:center;gap:12px;margin-top:4px}
.adv-image-box{display:grid;flex:none;width:120px;height:44px;place-items:center;overflow:hidden;border:1px dashed var(--ink-300);border-radius:8px;background:var(--ink-50,#f4f6fa);color:var(--ink-500)}
.adv-image-actions{display:flex;flex-wrap:wrap;align-items:center;gap:8px}
.adv-companies{margin-top:12px;padding:10px;border:1px solid var(--ink-150);border-radius:8px}
.adv-companies-head{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-bottom:8px}.adv-companies-head input{width:200px;min-height:32px}
.adv-company-list{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:2px 12px;max-height:190px;overflow:auto}
.adv-company-list label{display:flex;align-items:center;gap:7px;padding:3px 2px;font-size:12.5px}.adv-company-list small{color:var(--ink-500);margin-left:auto}
.adv-slots{margin-top:16px}.adv-slots-head{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px}
.adv-bar{width:150px;height:5px;margin-top:5px;border-radius:3px;background:#e3e8f0}.adv-bar i{display:block;height:5px;border-radius:3px;background:var(--blue-600)}
.adv-count{margin-right:6px;font-weight:800;color:var(--blue-700)}
.adv-table td{vertical-align:middle;white-space:nowrap}.adv-table input{min-height:32px;padding:3px 6px;width:auto}
.adv-day{width:24px;height:24px;margin-right:2px;border:0;border-radius:5px;background:#eceff4;color:#8a95a5;font-size:10px;font-weight:800;cursor:pointer}.adv-day.on{background:var(--blue-600);color:#fff}
.adv-x{border:0;background:transparent;color:#b3261e;font-size:18px;font-weight:800;cursor:pointer;line-height:1}
.adv-preview{margin-top:16px}.adv-week{display:grid;grid-template-columns:62px repeat(7,minmax(0,1fr));gap:3px;margin-top:8px;font-size:10px;color:var(--ink-500)}
.adv-week>div{display:flex;align-items:center;justify-content:center;height:22px;overflow:hidden;border-radius:3px;background:#eef1f6;padding:0 3px;white-space:nowrap;text-overflow:ellipsis}
.adv-week .h{background:none;font-weight:800}.adv-week .l{justify-content:flex-start;background:none}.adv-week .c.on{color:#10223a;font-weight:700}
.adv-legend{display:flex;flex-wrap:wrap;gap:14px;margin-top:8px;font-size:11px}.adv-legend i{display:inline-block;width:10px;height:10px;margin-right:5px;border-radius:2px;vertical-align:-1px}.adv-legend i.flox{background:#eef1f6;border:1px solid #cfd6e1}
@media (max-width:640px){.adv-fields{grid-template-columns:1fr}}
`;

"use client";

import "./failure-reports.css";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Loader2, Plus, Star, Trash2 } from "lucide-react";
import { useConfirmDialog } from "@/components/ConfirmDialog";
import { aspectOf, logoColours, processLogo, readFile } from "./image";
import { hx, themeOf } from "./theme";
import { frApi, profileForBuild, type Profile, type ProfileDetails } from "./types";

type Draft = Omit<Profile, "id" | "active" | "updatedAt" | "reportCount"> & { id: string | null };

const BLANK: Draft = {
  id: null, name: "", legalName: "", logoData: null, logoAspect: 1.4, logoDark: false, accent: "F0B429", dark: "14213D", accentText: null, headerStyle: "auto",
  details: { address: "", phone: "", email: "", website: "", coreg: "", vat: "", extra: "" }, footer: "", showDetails: false, isDefault: false,
};
const DETAIL_FIELDS: Array<{ key: keyof ProfileDetails; label: string; placeholder?: string }> = [
  { key: "address", label: "Address" }, { key: "phone", label: "Phone(s)" }, { key: "email", label: "Email" }, { key: "website", label: "Website" },
  { key: "coreg", label: "Co Reg no." }, { key: "vat", label: "VAT no." }, { key: "extra", label: "Extra line (optional)", placeholder: "e.g. Import/Export: 2193 4440" },
];

// Company profiles: the logo, colours and details a report is printed with. Our own company is set up from Apollo's company
// details the first time; clients that want their own branding on the report get a profile each. Kept per company in Apollo,
// so every user and every PC sees the same profiles (in the builder they lived in one browser only).
export function ProfilesWorkspace({ canEdit }: { canEdit: boolean }) {
  const { confirm, dialog } = useConfirmDialog();
  const [items, setItems] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [trim, setTrim] = useState(true);
  const [sugg, setSugg] = useState<string[]>([]);
  const [message, setMessage] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [showOff, setShowOff] = useState(false);

  const load = useCallback(async (selectId?: string | null) => {
    try {
      const body = await frApi<{ items: Profile[] }>("/api/v1/failure-reports/profiles?all=1");
      setItems(body.items);
      const pick = body.items.find((p) => p.id === selectId) ?? body.items.find((p) => p.isDefault) ?? body.items[0];
      if (pick) { setDraft({ ...pick }); setDirty(false); setSugg([]); }
    } catch (e) { setMessage({ tone: "err", text: e instanceof Error ? e.message : "Unable to load company profiles." }); }
    finally { setLoading(false); }
  }, []);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- async resource load, same pattern as the other workspaces
  useEffect(() => { void load(); }, [load]);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => { setDraft((d) => (d ? { ...d, [key]: value } : d)); setDirty(true); };
  const setDetail = (key: keyof ProfileDetails, value: string) => { setDraft((d) => (d ? { ...d, details: { ...d.details, [key]: value } } : d)); setDirty(true); };

  async function choose(p: Profile | null) {
    if (dirty && !(await confirm({ message: "Leave this profile without saving your changes?", confirmLabel: "Leave without saving" }))) return;
    setDraft(p ? { ...p } : { ...BLANK }); setDirty(!p); setSugg([]); setMessage(null);
  }

  async function uploadLogo(file: File) {
    try {
      const r = await processLogo(await readFile(file), trim);
      setDraft((d) => (d ? { ...d, logoData: r.data, logoAspect: r.ar, logoDark: r.dark } : d)); setDirty(true);
      setMessage({ tone: "ok", text: "Logo updated - use Pick colours from logo to match the colours, then Save." });
    } catch (e) { setMessage({ tone: "err", text: `Could not read that image: ${e instanceof Error ? e.message : String(e)}` }); }
  }

  async function pickColours() {
    if (!draft?.logoData) { setMessage({ tone: "err", text: "Upload a logo first." }); return; }
    try { setSugg(await logoColours(draft.logoData)); } catch { setMessage({ tone: "err", text: "Could not read the logo's colours." }); }
  }

  async function saveDraft() {
    if (!draft) return;
    if (!draft.name.trim()) { setMessage({ tone: "err", text: "Give the company a name (as it should show on the report)." }); return; }
    setSaving(true); setMessage(null);
    try {
      // A profile made from the company settings has no stored aspect ratio yet - measure it now.
      const logoAspect = draft.logoData && draft.logoAspect === 1.4 ? await aspectOf(draft.logoData) : draft.logoAspect;
      const body = { ...profileForBuild({ ...draft, id: draft.id ?? "", active: true, updatedAt: "" } as Profile), logoAspect, isDefault: draft.isDefault, accentText: draft.accentText || null };
      const saved = draft.id
        ? await frApi<Profile>(`/api/v1/failure-reports/profiles/${draft.id}`, { method: "PUT", body })
        : await frApi<Profile>("/api/v1/failure-reports/profiles", { method: "POST", body });
      await load(saved.id);
      const d = new Date();
      setMessage({ tone: "ok", text: `Saved at ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}.` });
    } catch (e) { setMessage({ tone: "err", text: e instanceof Error ? e.message : "Could not save the profile." }); }
    finally { setSaving(false); }
  }

  async function remove() {
    if (!draft?.id) { setDraft(null); setDirty(false); void load(); return; }
    const used = items.find((p) => p.id === draft.id)?.reportCount ?? 0;
    if (!(await confirm({ title: "Delete profile?", message: used ? `${draft.name} is used by ${used} report(s). It will be switched off - those reports still print with it - and no longer offered for new reports.` : `Delete ${draft.name}?`, tone: "danger", confirmLabel: used ? "Switch off" : "Delete" }))) return;
    try { await frApi(`/api/v1/failure-reports/profiles/${draft.id}`, { method: "DELETE" }); setDirty(false); await load(); setMessage({ tone: "ok", text: used ? "Profile switched off." : "Profile deleted." }); }
    catch (e) { setMessage({ tone: "err", text: e instanceof Error ? e.message : "Could not delete the profile." }); }
  }

  const theme = useMemo(() => (draft ? themeOf(profileForBuild({ ...draft, id: "", active: true, updatedAt: "" } as Profile)) : null), [draft]);
  const shown = items.filter((p) => p.active || showOff);
  const readOnly = !canEdit;

  return (
    <div>
      <header className="page-header compact">
        <div><p className="eyebrow"><Link href="/failure-reports" className="fr-link" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><ArrowLeft size={12} /> Failure Reports</Link></p><h1>Company profiles</h1><p>A profile holds a company&apos;s logo, colours and details. Pick the profile on a report and the whole report (logo, bars, lines, warranty blocks, headings, footer and details) uses it.</p></div>
        {canEdit && <button type="button" className="gold-button" onClick={() => void choose(null)}><Plus size={15} /> Add new company</button>}
      </header>
      {message && <div className={message.tone === "err" ? "inline-error" : "inline-success"} role="status">{message.text}</div>}
      {loading ? <div className="table-state"><Loader2 className="spin" size={20} /> Loading…</div> : (
        <div className="fr-profiles">
          <div className="fr-plist">
            {shown.map((p) => {
              const t = themeOf(profileForBuild(p));
              return (
                <button key={p.id} type="button" className="fr-pitem" aria-pressed={draft?.id === p.id} onClick={() => void choose(p)}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- a profile logo, a data URL */}
                  <span className="lg" style={{ background: p.logoDark ? `#${t.dark}` : "#fff" }}>{p.logoData ? <img src={p.logoData} alt="" /> : null}</span>
                  <span><span className="nm">{p.name}</span><br /><span className="fr-sub"><span className="fr-swatch" style={{ background: `#${t.accent}` }} /><span className="fr-swatch" style={{ background: `#${t.dark}` }} />{p.isDefault ? " Default" : ""}{p.active ? "" : " Switched off"}{p.reportCount ? ` · ${p.reportCount} report${p.reportCount === 1 ? "" : "s"}` : ""}</span></span>
                </button>
              );
            })}
            {items.some((p) => !p.active) && <label className="fr-sub"><input type="checkbox" checked={showOff} onChange={(e) => setShowOff(e.target.checked)} /> Show switched-off profiles</label>}
          </div>

          {draft && theme && (
            <section className="fr-card">
              <header>
                <h2 className="fr-grow">{draft.id ? draft.name || "Company" : "New company"}</h2>
                {canEdit && <label className="fr-sub" style={{ display: "inline-flex", gap: 6, alignItems: "center" }}><input type="checkbox" checked={draft.isDefault} onChange={(e) => set("isDefault", e.target.checked)} /> <Star size={13} /> Default for new reports</label>}
              </header>
              <div className="fr-body">
                <div className="fr-grid" style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
                  <label className="fr-field"><span>Company name (as on the report)</span><input value={draft.name} disabled={readOnly} onChange={(e) => set("name", e.target.value)} /></label>
                  <label className="fr-field"><span>Registered / full name (optional)</span><input value={draft.legalName} disabled={readOnly} onChange={(e) => set("legalName", e.target.value)} /></label>
                </div>
                <div className="fr-subh">Logo</div>
                <div className="fr-logobox">
                  {/* eslint-disable-next-line @next/next/no-img-element -- a profile logo, a data URL */}
                  <div className="pv" style={{ background: draft.logoDark ? `#${theme.dark}` : "#fff" }}>{draft.logoData ? <img src={draft.logoData} alt="Logo" /> : <span className="fr-sub">No logo</span>}</div>
                  {canEdit && (
                    <div style={{ display: "grid", gap: 8 }}>
                      <label className="quiet-button" style={{ cursor: "pointer" }}>Upload logo (PNG / JPG)…<input type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void uploadLogo(f); }} /></label>
                      <label className="fr-sub"><input type="checkbox" checked={trim} onChange={(e) => setTrim(e.target.checked)} /> Trim empty edges around the logo</label>
                      {draft.logoData && <button type="button" className="fr-link" style={{ justifySelf: "start" }} onClick={() => { set("logoData", null); }}>Remove logo</button>}
                    </div>
                  )}
                </div>
                <div className="fr-subh">Colour scheme</div>
                <div className="fr-colours">
                  <label className="fr-field"><span>Accent (lines, highlights, N/A block)</span><span className="fr-colf"><input type="color" value={`#${hx(draft.accent) ?? "F0B429"}`} disabled={readOnly} onChange={(e) => set("accent", e.target.value.slice(1).toUpperCase())} /><input type="text" value={draft.accent} maxLength={7} disabled={readOnly} onChange={(e) => set("accent", e.target.value.replace("#", "").toUpperCase())} /></span></label>
                  <label className="fr-field"><span>Dark / secondary (top bars, headers, titles)</span><span className="fr-colf"><input type="color" value={`#${hx(draft.dark) ?? "14213D"}`} disabled={readOnly} onChange={(e) => set("dark", e.target.value.slice(1).toUpperCase())} /><input type="text" value={draft.dark} maxLength={7} disabled={readOnly} onChange={(e) => set("dark", e.target.value.replace("#", "").toUpperCase())} /></span></label>
                  <label className="fr-field"><span>Report header style</span>
                    <select value={draft.headerStyle} disabled={readOnly} onChange={(e) => set("headerStyle", e.target.value as Draft["headerStyle"])}><option value="auto">Automatic (from logo)</option><option value="light">Light – logo on white</option><option value="band">Dark band – logo on dark colour</option></select>
                  </label>
                </div>
                {canEdit && (
                  <div className="fr-bar">
                    <button type="button" className="quiet-button" onClick={() => void pickColours()}>Pick colours from logo</button>
                    {sugg.length > 0 && <span className="fr-sub">Click a colour: left click = accent, right click = dark.</span>}
                    <div className="fr-sugg">{sugg.map((c) => <button key={c} type="button" title={`#${c}`} aria-label={`Use #${c}`} style={{ background: `#${c}` }} onClick={() => set("accent", c)} onContextMenu={(e) => { e.preventDefault(); set("dark", c); }} />)}</div>
                  </div>
                )}
                <div className="fr-subh">Preview</div>
                <div className="fr-hprev">
                  <div className="bar" style={{ background: `#${theme.dark}`, borderBottom: `2px solid #${theme.accent}`, height: theme.band ? 0 : 6 }} />
                  <div className="head" style={{ background: theme.band ? `#${theme.dark}` : "#fff", borderBottom: theme.band ? `3px solid #${theme.accent}` : undefined }}>
                    {/* eslint-disable-next-line @next/next/no-img-element -- a profile logo, a data URL */}
                    {draft.logoData && <img src={draft.logoData} alt="" />}
                    <strong style={{ color: theme.band ? `#${theme.onDark}` : `#${theme.title}` }}>FAILURE REPORT</strong>
                    <span className="fr-grow" />
                    <span style={{ padding: "4px 10px", borderRadius: 4, background: `#${theme.naFill}`, color: `#${theme.naText}`, fontWeight: 800, fontSize: 12 }}>N/A</span>
                  </div>
                  {!theme.band && <div className="rule" style={{ background: `#${theme.accent}` }} />}
                </div>
                <div className="fr-subh">Company details</div>
                <div className="fr-grid" style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
                  {DETAIL_FIELDS.map((f) => <label key={f.key} className="fr-field"><span>{f.label}</span><input value={draft.details[f.key]} placeholder={f.placeholder} disabled={readOnly} onChange={(e) => setDetail(f.key, e.target.value)} /></label>)}
                  <label className="fr-field"><span>Footer text (every page)</span><input value={draft.footer} placeholder={`${draft.name || "Company"} | Failure Report`} disabled={readOnly} onChange={(e) => set("footer", e.target.value)} /></label>
                </div>
                <label className="fr-sub"><input type="checkbox" checked={draft.showDetails} disabled={readOnly} onChange={(e) => set("showDetails", e.target.checked)} /> Print company details on page 1 of the report</label>
                {canEdit && (
                  <div className="fr-bar">
                    {draft.id && <button type="button" className="quiet-button danger" onClick={() => void remove()}><Trash2 size={14} /> Delete</button>}
                    <span className="fr-grow" />
                    <span className={`fr-save ${dirty ? "dirty" : ""}`}>{dirty ? "● Changes not saved" : "All changes saved"}</span>
                    <button type="button" className="gold-button" disabled={saving} onClick={() => void saveDraft()}>{saving ? <Loader2 className="spin" size={15} /> : null} Save</button>
                  </div>
                )}
              </div>
            </section>
          )}
        </div>
      )}
      {dialog}
    </div>
  );
}

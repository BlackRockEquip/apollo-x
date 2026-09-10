"use client";

/* eslint-disable react-hooks/set-state-in-effect -- async settings loading intentionally mirrors existing workspace patterns */

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ImagePlus, RotateCcw, Save, Upload, X } from "lucide-react";

type SettingsData = {
  internalCode: string;
  legalName: string;
  tradingName: string | null;
  settings: Record<string, string | number | boolean | null> | null;
};

type FormState = Record<string, string>;

function normalizeColor(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
}

export function CompanySettingsForm() {
  const router = useRouter();
  const [data, setData] = useState<SettingsData | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);

  async function load() {
    const response = await fetch("/api/v1/company-settings", { cache: "no-store" });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error?.message || "Unable to load company settings.");
    setData(body);
    const s = body.settings || {};
    setForm({
      legalName: body.legalName || "",
      tradingName: body.tradingName || "",
      registrationNumber: String(s.registrationNumber || ""),
      vatNumber: String(s.vatNumber || ""),
      mainTelephone: String(s.mainTelephone || ""),
      mainEmail: String(s.mainEmail || ""),
      website: String(s.website || ""),
      defaultCurrencyCode: String(s.defaultCurrencyCode || "ZAR"),
      defaultTaxJurisdiction: String(s.defaultTaxJurisdiction || "ZA"),
      quoteValidityDays: String(s.quoteValidityDays || 30),
      themeColor: String(s.themeColor || ""),
      accentColor: String(s.accentColor || s.themeColor || ""),
      secondaryColor: String(s.secondaryColor || ""),
      documentHeaderText: String(s.documentHeaderText || ""),
      documentFooterText: String(s.documentFooterText || ""),
      // SMTP — added 2026-09-09 so real RFQ / Parts-follow-up emails can be
      // sent. smtpPassword is write-only: the server never returns the
      // stored value, so this always starts blank (see the "leave blank to
      // keep the current password" hint next to the field below); a
      // configured deployment is shown via smtpConfigured instead.
      smtpHost: String(s.smtpHost || ""),
      smtpPort: String(s.smtpPort || "587"),
      smtpSecure: s.smtpSecure === false ? "false" : "true",
      smtpUsername: String(s.smtpUsername || ""),
      smtpPassword: "",
      smtpFromAddress: String(s.smtpFromAddress || ""),
      smtpFromName: String(s.smtpFromName || ""),
    });
  }

  const smtpConfigured = !!data?.settings?.smtpConfigured;

  useEffect(() => { void load().catch((e) => setError(e instanceof Error ? e.message : "Unable to load company settings.")); }, []);

  const previewStyle = useMemo(() => ({
    ["--tenant-theme" as string]: normalizeColor(form?.themeColor || "#155fca"),
    ["--tenant-accent" as string]: normalizeColor(form?.accentColor || form?.themeColor || "#d6a83b"),
    ["--tenant-secondary" as string]: normalizeColor(form?.secondaryColor || "#07111f"),
  }), [form]);

  async function onSave() {
    if (!form) return;
    setSaving(true); setError("");
    try {
      const payload = { ...form, quoteValidityDays: Number(form.quoteValidityDays), smtpPort: form.smtpPort ? Number(form.smtpPort) : null, smtpSecure: form.smtpSecure === "true" };
      const response = await fetch("/api/v1/company-settings", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message || "Unable to save company settings.");
      await load();
      // 2026-09-10 — fixes "Primary colour picker does not change anything":
      // themeColor/accentColor/secondaryColor are read once per request by
      // the (tenant) server layout (see requireRequestContext in
      // TenantLayout) and handed to AppShell as a prop, so saving here
      // updated the database but the already-rendered app shell (topbar
      // border, selected module-access pills, etc. — see
      // .tenant-themed-shell in globals.css) kept showing the old colours
      // until a full reload. router.refresh() re-runs that server layout
      // in place so the new colours actually show up immediately.
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save company settings.");
    } finally {
      setSaving(false);
    }
  }

  async function onLogoSelected(file: File | null) {
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) { setError("Use PNG, JPG or WebP logos only."); return; }
    const dataUrl = await file.arrayBuffer().then((buffer) => `data:${file.type};base64,${Buffer.from(buffer).toString("base64")}`);
    setLogoPreview(dataUrl);
  }

  async function uploadLogo() {
    const input = document.getElementById("company-logo-input") as HTMLInputElement | null;
    const file = input?.files?.[0];
    if (!file) return;
    setSaving(true); setError("");
    try {
      const contentBase64 = await file.arrayBuffer().then((buffer) => Buffer.from(buffer).toString("base64"));
      const response = await fetch("/api/v1/company-settings/logo", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ fileName: file.name, mimeType: file.type, contentBase64 }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message || "Unable to upload logo.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to upload logo.");
    } finally {
      setSaving(false);
    }
  }

  async function removeLogo() {
    setSaving(true); setError("");
    try {
      const response = await fetch("/api/v1/company-settings/logo", { method: "DELETE" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message || "Unable to remove logo.");
      setLogoPreview(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to remove logo.");
    } finally {
      setSaving(false);
    }
  }

  if (!data || !form) return <div className="table-state">{error || "Loading company settings…"}</div>;

  return (
    <div className="settings-grid company-settings-grid">
      <section className="detail-panel">
        <header>
          <div><h2>Company / Branding</h2><p>Manage tenant-specific branding without affecting Apollo X product identity.</p></div>
          <div className="header-actions"><button type="button" className="quiet-button" onClick={() => void load()}><RotateCcw size={14} /> Reset</button><button type="button" className="gold-button" disabled={saving} onClick={() => void onSave()}><Save size={14} /> {saving ? "Saving…" : "Save"}</button></div>
        </header>
        {error ? <div className="inline-error">{error}</div> : null}
        <div className="drawer-fields">
          <label><span>Legal company name</span><input value={form.legalName} onChange={(e) => setForm((current) => current ? { ...current, legalName: e.target.value } : current)} /></label>
          <label><span>Trading name</span><input value={form.tradingName} onChange={(e) => setForm((current) => current ? { ...current, tradingName: e.target.value } : current)} /></label>
          <label><span>Registration number</span><input value={form.registrationNumber} onChange={(e) => setForm((current) => current ? { ...current, registrationNumber: e.target.value } : current)} /></label>
          <label><span>VAT number</span><input value={form.vatNumber} onChange={(e) => setForm((current) => current ? { ...current, vatNumber: e.target.value } : current)} /></label>
          <label><span>Main telephone</span><input value={form.mainTelephone} onChange={(e) => setForm((current) => current ? { ...current, mainTelephone: e.target.value } : current)} /></label>
          <label><span>Main email</span><input value={form.mainEmail} onChange={(e) => setForm((current) => current ? { ...current, mainEmail: e.target.value } : current)} /></label>
          <label><span>Website</span><input value={form.website} onChange={(e) => setForm((current) => current ? { ...current, website: e.target.value } : current)} /></label>
          <label><span>Quote validity (days)</span><input type="number" min={1} value={form.quoteValidityDays} onChange={(e) => setForm((current) => current ? { ...current, quoteValidityDays: e.target.value } : current)} /></label>
          <label><span>Primary colour</span>
            <div className="color-picker-field">
              <input type="color" value={normalizeColor(form.themeColor) || "#155fca"} onChange={(e) => setForm((current) => current ? { ...current, themeColor: e.target.value } : current)} />
              <input className="color-picker-hex" value={form.themeColor} placeholder="#155fca" onChange={(e) => setForm((current) => current ? { ...current, themeColor: e.target.value } : current)} />
            </div>
          </label>
          <label><span>Accent colour</span>
            <div className="color-picker-field">
              <input type="color" value={normalizeColor(form.accentColor) || "#d6a83b"} onChange={(e) => setForm((current) => current ? { ...current, accentColor: e.target.value } : current)} />
              <input className="color-picker-hex" value={form.accentColor} placeholder="#d6a83b" onChange={(e) => setForm((current) => current ? { ...current, accentColor: e.target.value } : current)} />
            </div>
          </label>
          <label><span>Secondary colour</span>
            <div className="color-picker-field">
              <input type="color" value={normalizeColor(form.secondaryColor) || "#07111f"} onChange={(e) => setForm((current) => current ? { ...current, secondaryColor: e.target.value } : current)} />
              <input className="color-picker-hex" value={form.secondaryColor} placeholder="#07111f" onChange={(e) => setForm((current) => current ? { ...current, secondaryColor: e.target.value } : current)} />
            </div>
          </label>
          <label className="wide"><span>Document header text</span><textarea rows={3} value={form.documentHeaderText} onChange={(e) => setForm((current) => current ? { ...current, documentHeaderText: e.target.value } : current)} /></label>
          <label className="wide"><span>Document footer text</span><textarea rows={3} value={form.documentFooterText} onChange={(e) => setForm((current) => current ? { ...current, documentFooterText: e.target.value } : current)} /></label>
        </div>
      </section>

      <section className="detail-panel">
        <header>
          <div><h2>Email / SMTP</h2><p>Used to send real RFQ request and parts follow-up emails to suppliers. Nothing is sent until this is filled in.</p></div>
          <span className={smtpConfigured ? "status-pill tone-green" : "status-pill neutral"}>{smtpConfigured ? "Configured" : "Not configured"}</span>
        </header>
        <div className="drawer-fields">
          <label><span>SMTP host</span><input value={form.smtpHost} placeholder="smtp.example.com" onChange={(e) => setForm((current) => current ? { ...current, smtpHost: e.target.value } : current)} /></label>
          <label><span>SMTP port</span><input type="number" min={1} max={65535} value={form.smtpPort} onChange={(e) => setForm((current) => current ? { ...current, smtpPort: e.target.value } : current)} /></label>
          <label><span>Connection security</span>
            <select value={form.smtpSecure} onChange={(e) => setForm((current) => current ? { ...current, smtpSecure: e.target.value } : current)}>
              <option value="true">TLS / SSL (port 465 typically)</option>
              <option value="false">STARTTLS or none (port 587/25 typically)</option>
            </select>
          </label>
          <label><span>SMTP username</span><input value={form.smtpUsername} onChange={(e) => setForm((current) => current ? { ...current, smtpUsername: e.target.value } : current)} /></label>
          <label><span>SMTP password</span><input type="password" value={form.smtpPassword} placeholder={smtpConfigured ? "Leave blank to keep the current password" : ""} onChange={(e) => setForm((current) => current ? { ...current, smtpPassword: e.target.value } : current)} /></label>
          <label><span>&quot;From&quot; email address</span><input value={form.smtpFromAddress} onChange={(e) => setForm((current) => current ? { ...current, smtpFromAddress: e.target.value } : current)} /></label>
          <label><span>&quot;From&quot; display name</span><input value={form.smtpFromName} placeholder={form.tradingName || form.legalName} onChange={(e) => setForm((current) => current ? { ...current, smtpFromName: e.target.value } : current)} /></label>
        </div>
      </section>

      <section className="detail-panel">
        <header><div><h2>Logo & preview</h2><p>Transparent PNG/JPG/WebP logos supported. Tenant-scoped only.</p></div></header>
        <div className="brand-preview-panel" style={previewStyle}>
          <div className="brand-preview-sidebar"><div className="brand-preview-logo">{logoPreview ? <Image src={logoPreview} alt="Logo preview" className="brand-logo-preview" width={84} height={84} unoptimized /> : <ImagePlus size={28} />}</div><strong>{form.tradingName || form.legalName}</strong><span>Apollo X remains visible</span></div>
          <div className="brand-preview-workspace"><div className="brand-preview-topbar" /><div className="brand-preview-card-grid"><div /><div /><div /></div></div>
        </div>
        <div className="stack-row" style={{ marginTop: 12 }}>
          <label className="quiet-button" htmlFor="company-logo-input"><Upload size={14} /> Choose logo</label>
          <input id="company-logo-input" type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => void onLogoSelected(e.target.files?.[0] ?? null)} />
          <button type="button" className="table-action" disabled={saving} onClick={() => void uploadLogo()}>Upload / replace</button>
          <button type="button" className="table-action danger" disabled={saving} onClick={() => void removeLogo()}><X size={14} /> Remove</button>
        </div>
      </section>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { Eye, X } from "lucide-react";
import { DEFAULT_DOCUMENT_TITLES, DOCUMENT_KINDS, DOCUMENT_TITLE_FORBIDDEN, DOCUMENT_TITLE_MAX, documentBaseName, type DocumentKind, type DocumentTitles } from "@/lib/documents/titles";

// Org Admin > Configuration > Document titles. One row per document the
// system prints or saves; the title is the heading on the printed/saved
// document and the file name "<JOB NUMBER> - <title>.pdf" in the job folder.
export function DocumentTitlesSettings() {
  const [titles, setTitles] = useState<DocumentTitles>(DEFAULT_DOCUMENT_TITLES);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  // 2026-10-16, user request: a Preview button so a user can see what the
  // title will look like before saving. Shows the heading as it prints, and
  // the file name it is saved under, using the titles as currently typed.
  const [previewKind, setPreviewKind] = useState<DocumentKind | null>(null);
  const [companyName, setCompanyName] = useState("Your company");
  const [logoOk, setLogoOk] = useState(true);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/v1/company-settings", { cache: "no-store" })
      .then((response) => response.json())
      .then((body) => { if (!cancelled && !body.error) setCompanyName((body.tradingName && String(body.tradingName).trim()) || body.legalName || "Your company"); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/v1/company-settings/document-titles", { cache: "no-store" })
      .then((response) => response.json())
      .then((body) => { if (!cancelled && !body.error) setTitles(body); })
      .catch(() => undefined)
      .finally(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
  }, []);

  const invalid = (value: string) => DOCUMENT_TITLE_FORBIDDEN.test(value);
  const anyInvalid = DOCUMENT_KINDS.some((kind) => invalid(titles[kind.key]));

  async function save() {
    setSaving(true); setMessage(null);
    try {
      const response = await fetch("/api/v1/company-settings/document-titles", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(titles) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message || "Could not save the titles.");
      setTitles(body);
      setMessage({ ok: true, text: "Document titles saved." });
    } catch (error) {
      setMessage({ ok: false, text: error instanceof Error ? error.message : "Could not save the titles." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="document-titles">
      <p className="muted small-line">
        The title is printed at the top of each document and is the name it is saved under in the job&rsquo;s folder, for example <strong>BRE1152 - {titles.JOB_HISTORY || DEFAULT_DOCUMENT_TITLES.JOB_HISTORY}.pdf</strong>. Files that people attach to a job keep the name they gave them.
      </p>
      <div className="data-table-wrap">
        <table className="data-table">
          <thead><tr><th>Document</th><th>Document title</th><th></th></tr></thead>
          <tbody>
            {DOCUMENT_KINDS.map((kind) => (
              <tr key={kind.key}>
                <td>{kind.label}</td>
                <td>
                  <input
                    value={titles[kind.key]}
                    maxLength={DOCUMENT_TITLE_MAX}
                    disabled={!loaded}
                    onChange={(event) => setTitles({ ...titles, [kind.key]: event.target.value })}
                    aria-label={`${kind.label} title`}
                    style={{ width: "100%", minHeight: 36, border: `1px solid ${invalid(titles[kind.key]) ? "var(--danger)" : "var(--ink-300)"}`, borderRadius: 8, padding: "6px 10px" }}
                  />
                  {invalid(titles[kind.key]) && <span className="form-error">A title cannot contain / \ : * ? &quot; &lt; &gt; |</span>}
                </td>
                <td className="actions"><button type="button" className="table-action" onClick={() => { setLogoOk(true); setPreviewKind(kind.key); }}><Eye size={14} /> Preview</button>{titles[kind.key] !== kind.defaultTitle && <button type="button" className="table-action" onClick={() => setTitles({ ...titles, [kind.key]: kind.defaultTitle })}>Reset</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="platform-form-actions compact-top-gap" style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <button type="button" className="primary-button" disabled={saving || !loaded || anyInvalid} onClick={() => void save()}>{saving ? "Saving…" : "Save titles"}</button>
        <button type="button" className="quiet-button" onClick={() => { setLogoOk(true); setPreviewKind(previewKind ?? DOCUMENT_KINDS[0].key); }}><Eye size={14} /> Preview</button>
        {message && <span className={message.ok ? "muted small-line" : "form-error"}>{message.text}</span>}
      </div>
      {previewKind && (() => {
        const kind = DOCUMENT_KINDS.find((k) => k.key === previewKind) ?? DOCUMENT_KINDS[0];
        const title = titles[kind.key].trim() || kind.defaultTitle;
        return (
          <div className="drawer-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setPreviewKind(null); }}>
            <aside className="form-drawer wide-drawer" aria-modal="true">
              <header><div><p className="eyebrow">Document titles</p><h2>Preview</h2></div><button type="button" aria-label="Close" onClick={() => setPreviewKind(null)}><X size={18} /></button></header>
              <div className="drawer-fields">
                <label className="wide"><span>Document</span>
                  <select value={kind.key} onChange={(event) => setPreviewKind(event.target.value as DocumentKind)}>
                    {DOCUMENT_KINDS.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}
                  </select>
                </label>
                <div className="wide" style={{ background: "#fff", color: "#111", border: "1px solid var(--ink-300)", borderRadius: 6, boxShadow: "0 2px 10px rgba(0,0,0,.08)", padding: "22px 26px", minHeight: 260 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, borderBottom: "2px solid #111", paddingBottom: 10 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      {logoOk ? /* eslint-disable-next-line @next/next/no-img-element */ <img src="/api/v1/company-settings/logo" alt="" onError={() => setLogoOk(false)} style={{ maxHeight: 42, maxWidth: 120, objectFit: "contain" }} /> : null}
                      <strong style={{ fontSize: 14 }}>{companyName}</strong>
                    </div>
                    <strong style={{ fontSize: 22, letterSpacing: ".02em", textAlign: "right" }}>{title}</strong>
                  </div>
                  <div style={{ display: "grid", gap: 8, marginTop: 16 }}>
                    {[60, 85, 45, 70, 55].map((width, index) => <div key={index} style={{ height: 8, width: `${width}%`, background: "#e3e6ea", borderRadius: 4 }} />)}
                  </div>
                </div>
                <p className="muted small-line wide">Saved as: <strong>{documentBaseName("BRE1152", title)}.pdf</strong> (the job number comes first, then the title).</p>
                {DOCUMENT_TITLE_FORBIDDEN.test(titles[kind.key]) && <p className="form-error wide">This title contains a character that is not allowed in a file name.</p>}
              </div>
              <footer><button type="button" className="quiet-button" onClick={() => setPreviewKind(null)}>Close</button></footer>
            </aside>
          </div>
        );
      })()}
    </div>
  );
}

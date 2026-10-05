"use client";

import { useEffect, useState } from "react";
import { DEFAULT_DOCUMENT_TITLES, DOCUMENT_KINDS, DOCUMENT_TITLE_FORBIDDEN, DOCUMENT_TITLE_MAX, type DocumentTitles } from "@/lib/documents/titles";

// Org Admin > Configuration > Document titles. One row per document the
// system prints or saves; the title is the heading on the printed/saved
// document and the file name "<JOB NUMBER> - <title>.pdf" in the job folder.
export function DocumentTitlesSettings() {
  const [titles, setTitles] = useState<DocumentTitles>(DEFAULT_DOCUMENT_TITLES);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

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
                <td>{titles[kind.key] !== kind.defaultTitle && <button type="button" className="table-action" onClick={() => setTitles({ ...titles, [kind.key]: kind.defaultTitle })}>Reset</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="platform-form-actions compact-top-gap" style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <button type="button" className="primary-button" disabled={saving || !loaded || anyInvalid} onClick={() => void save()}>{saving ? "Saving…" : "Save titles"}</button>
        {message && <span className={message.ok ? "muted small-line" : "form-error"}>{message.text}</span>}
      </div>
    </div>
  );
}

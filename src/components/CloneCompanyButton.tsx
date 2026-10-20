"use client";

import { useState } from "react";
import { Copy, X } from "lucide-react";
import { cloneCompanyAction } from "@/app/platform/actions";
import { companyCopyName } from "@/lib/platform/company-lifecycle-constants";

// 2026-10-20, user request: "Add a clone button as well which creates a copy of the
// company and adds the words "- copy" to the end of the company name."
export function CloneCompanyButton({ companyId, companyName, back = "list", variant = "table" }: { companyId: string; companyName: string; back?: "list" | "detail"; variant?: "table" | "page" }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <>
      <button type="button" className={variant === "page" ? "quiet-button" : "table-action"} onClick={() => { setBusy(false); setOpen(true); }}><Copy size={12} style={{ verticalAlign: "-2px" }} /> Clone</button>
      {open ? (
        <div className="drawer-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setOpen(false); }}>
          <aside className="form-drawer" aria-modal="true" role="dialog" aria-label={`Clone ${companyName}`}>
            <header><div><p className="eyebrow">Clone company</p><h2>{companyName}</h2></div><button type="button" aria-label="Close" onClick={() => setOpen(false)}><X size={18} /></button></header>
            <form action={cloneCompanyAction} onSubmit={() => setBusy(true)}>
              <input type="hidden" name="companyId" value={companyId} />
              <input type="hidden" name="back" value={back} />
              <div className="drawer-fields">
                <p className="wide">Creates <strong>{companyCopyName(companyName)}</strong> as a new company.</p>
                <p className="muted small-line wide">Copied: industry build, licensed modules, branding and logo, contact details, email/SMTP host and templates (the SMTP password is not copied), tax codes, payment terms, job types and document numbering (counters start at 1).</p>
                <p className="muted small-line wide">Not copied: users, customers, suppliers, parts, jobs or any other data, and the storage location (the copy uses the platform default). Add users to the copy from its company page.</p>
              </div>
              <footer>
                <button type="button" className="quiet-button" onClick={() => setOpen(false)} disabled={busy}>Cancel</button>
                <button type="submit" className="primary-button" disabled={busy}>{busy ? "Cloning\u2026" : "Clone company"}</button>
              </footer>
            </form>
          </aside>
        </div>
      ) : null}
    </>
  );
}

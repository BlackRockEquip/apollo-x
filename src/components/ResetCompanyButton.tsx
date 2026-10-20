"use client";

import { useState } from "react";
import { RotateCcw, X } from "lucide-react";
import { resetCompanyAction } from "@/app/platform/actions";
import { RESET_CONFIRM_PHRASE, isResetPhrase } from "@/lib/platform/company-lifecycle-constants";

// 2026-10-20, user request: "Add a reset company button which requires the user to
// type "Reset Company" in a text field and confirm it". The confirm button stays
// disabled until the phrase is typed; the server checks it again.
export function ResetCompanyButton({ companyId, companyName, protectedCompany = false, back = "list", variant = "table" }: { companyId: string; companyName: string; protectedCompany?: boolean; back?: "list" | "detail"; variant?: "table" | "page" }) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  if (protectedCompany) return null;
  return (
    <>
      <button type="button" className={variant === "page" ? "quiet-button" : "table-action danger"} onClick={() => { setTyped(""); setOpen(true); }}><RotateCcw size={12} style={{ verticalAlign: "-2px" }} /> Reset</button>
      {open ? (
        <div className="drawer-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
          <aside className="form-drawer" aria-modal="true" role="dialog" aria-label={`Reset ${companyName}`}>
            <header><div><p className="eyebrow">Reset company</p><h2>{companyName}</h2></div><button type="button" aria-label="Close" onClick={() => setOpen(false)}><X size={18} /></button></header>
            <form action={resetCompanyAction}>
              <input type="hidden" name="companyId" value={companyId} />
              <input type="hidden" name="back" value={back} />
              <div className="drawer-fields">
                <p className="wide"><strong>This permanently deletes all of the company&rsquo;s data</strong> &mdash; jobs, customers, suppliers, parts, stock, PEX units, RFQs and quotes, notes, attachments, support tickets and its history &mdash; and starts document numbering again from 1. It cannot be undone.</p>
                <p className="muted small-line wide">Kept as they are: the company itself, its industry build and licensed modules, its users and their access, branding, email/SMTP settings and templates, tax codes, payment terms, job types, mechanics and sales representatives.</p>
                <label className="wide"><span>Type <strong>{RESET_CONFIRM_PHRASE}</strong> to confirm</span><input name="confirmText" autoComplete="off" value={typed} onChange={(event) => setTyped(event.target.value)} autoFocus /></label>
              </div>
              <footer>
                <button type="button" className="quiet-button" onClick={() => setOpen(false)}>Cancel</button>
                <button type="submit" className="danger-button" disabled={!isResetPhrase(typed)}>Reset company</button>
              </footer>
            </form>
          </aside>
        </div>
      ) : null}
    </>
  );
}

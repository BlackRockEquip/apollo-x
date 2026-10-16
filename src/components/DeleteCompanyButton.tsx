"use client";

import { useState } from "react";
import { Trash2, X } from "lucide-react";
import { deleteCompanyAction } from "@/app/platform/actions";

// 2026-10-16, user request: "add a delete company button next to the open
// button on the table". Deleting is permanent, so the button opens a
// confirmation window and the company's internal code has to be typed before
// the Delete button is enabled.
export function DeleteCompanyButton({ companyId, companyName, internalCode, protectedCompany = false }: { companyId: string; companyName: string; internalCode: string; protectedCompany?: boolean }) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  if (protectedCompany) return null;
  const matches = typed.trim().toUpperCase() === internalCode.toUpperCase();
  return (
    <>
      <button type="button" className="table-action danger" onClick={() => { setTyped(""); setOpen(true); }}><Trash2 size={12} style={{ verticalAlign: "-2px" }} /> Delete</button>
      {open ? (
        <div className="drawer-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
          <aside className="form-drawer" aria-modal="true" role="dialog" aria-label={`Delete ${companyName}`}>
            <header><div><p className="eyebrow">Delete company</p><h2>{companyName}</h2></div><button type="button" aria-label="Close" onClick={() => setOpen(false)}><X size={18} /></button></header>
            <form action={deleteCompanyAction}>
              <input type="hidden" name="companyId" value={companyId} />
              <div className="drawer-fields">
                <p className="wide"><strong>This permanently deletes the company and everything in it</strong> — jobs, parts, customers, suppliers, quotes, invoices, settings and its audit history. It cannot be undone. People who only belonged to this company are deactivated and can no longer sign in. Files stored in object storage are not removed.</p>
                <p className="muted small-line wide">If you may need the company again, set its status to Suspended instead.</p>
                <label className="wide"><span>Type <strong>{internalCode}</strong> to confirm</span><input name="confirmCode" autoComplete="off" value={typed} onChange={(event) => setTyped(event.target.value)} autoFocus /></label>
              </div>
              <footer>
                <button type="button" className="quiet-button" onClick={() => setOpen(false)}>Cancel</button>
                <button type="submit" className="danger-button" disabled={!matches}>Delete company</button>
              </footer>
            </form>
          </aside>
        </div>
      ) : null}
    </>
  );
}

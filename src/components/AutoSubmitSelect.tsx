"use client";

import type { ReactNode } from "react";

// 2026-10-06 — user request: the Jobs list's job-type and status dropdowns
// should filter the list as soon as an option is picked, without clicking
// Apply. The Jobs page is a server component with a plain GET <form>
// (jobs-filter-form), so this tiny client wrapper submits that form on
// change. `form` associates the select with the form even though it sits
// outside it in the DOM, same as before; select.form resolves that
// association.
//
// `dropWhenChanged` (also 2026-10-06): names a field in the form to leave out of
// the submit when this select changes — the Jobs page uses it so picking a
// status clears the hidden "view" (WIP / completed) filter that a dashboard
// link may have set, instead of silently combining the two.
export function AutoSubmitSelect({ name, form, defaultValue, dropWhenChanged, children }: { name: string; form: string; defaultValue: string; dropWhenChanged?: string; children: ReactNode }) {
  return (
    <select name={name} form={form} defaultValue={defaultValue} onChange={(e) => {
        const f = e.currentTarget.form;
        if (!f) return;
        if (dropWhenChanged) f.querySelectorAll<HTMLInputElement>(`input[name="${dropWhenChanged}"]`).forEach((input) => { input.disabled = true; });
        f.requestSubmit();
      }}>
      {children}
    </select>
  );
}

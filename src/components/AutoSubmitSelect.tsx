"use client";

import type { ReactNode } from "react";

// 2026-10-06 — user request: the Jobs list's job-type and status dropdowns
// should filter the list as soon as an option is picked, without clicking
// Apply. The Jobs page is a server component with a plain GET <form>
// (jobs-filter-form), so this tiny client wrapper submits that form on
// change. `form` associates the select with the form even though it sits
// outside it in the DOM, same as before; select.form resolves that
// association.
export function AutoSubmitSelect({ name, form, defaultValue, children }: { name: string; form: string; defaultValue: string; children: ReactNode }) {
  return (
    <select name={name} form={form} defaultValue={defaultValue} onChange={(e) => e.currentTarget.form?.requestSubmit()}>
      {children}
    </select>
  );
}

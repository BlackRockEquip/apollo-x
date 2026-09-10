"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

// `redirectTo` must stay in sync with the fixed allowlist enforced
// server-side in /api/v1/platform/support-context — this is just what's
// offered in the UI, the route re-validates it regardless.
type SupportDestination = "/dashboard" | "/users";

export function SupportContextForm({ companyId, companyName, compact = true, redirectTo = "/dashboard", defaultMode = "READ_ONLY", actionLabel }: { companyId: string; companyName?: string; compact?: boolean; redirectTo?: SupportDestination; defaultMode?: "READ_ONLY" | "READ_WRITE"; actionLabel?: string }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    const data = new FormData(event.currentTarget);
    const response = await fetch("/api/v1/platform/support-context", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companyId, mode: data.get("mode"), reason: data.get("reason"), durationMinutes: 30, redirectTo }),
    });
    const body = await response.json();
    if (!response.ok) { setError(body.error?.message ?? "Unable to enter support context."); setPending(false); return; }
    router.replace(body.destination ?? "/dashboard");
    router.refresh();
  }
  return (
    <form className={compact ? "support-form" : "support-form support-form-detailed"} onSubmit={submit}>
      {!compact && <div className="support-form-heading"><strong>{companyName ?? "Selected company"}</strong><span className="muted small-line">Explicit audited platform support entry</span></div>}
      <select name="mode" defaultValue={defaultMode} aria-label="Support access mode">
        <option value="READ_ONLY">Enter support mode — Read Only</option>
        <option value="READ_WRITE">Enter support mode — Read Write</option>
      </select>
      <input name="reason" required minLength={10} maxLength={1000} placeholder="Reason for tenant access" aria-label="Reason for tenant access" />
      <button disabled={pending}>{pending ? "Entering…" : actionLabel ?? (compact ? "Enter tenant" : "Enter support context")}</button>
      {error && <span className="form-error">{error}</span>}
    </form>
  );
}

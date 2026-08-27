"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export function SupportContextForm({ companyId }: { companyId: string }) {
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
      body: JSON.stringify({ companyId, mode: data.get("mode"), reason: data.get("reason"), durationMinutes: 30 }),
    });
    const body = await response.json();
    if (!response.ok) { setError(body.error?.message ?? "Unable to enter support context."); setPending(false); return; }
    router.replace(body.destination ?? "/dashboard");
    router.refresh();
  }
  return (
    <form className="support-form" onSubmit={submit}>
      <select name="mode" defaultValue="READ_ONLY" aria-label="Support access mode"><option value="READ_ONLY">Read-only</option><option value="READ_WRITE">Read/write</option></select>
      <input name="reason" required minLength={10} maxLength={1000} placeholder="Reason for tenant access" aria-label="Reason for tenant access" />
      <button disabled={pending}>{pending ? "Entering…" : "Enter tenant"}</button>
      {error && <span className="form-error">{error}</span>}
    </form>
  );
}

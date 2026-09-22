"use client";

import { FormEvent, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { ArrowRight, LoaderCircle } from "lucide-react";

// 2026-09-22 — the page a "forgot password" email link lands on
// (/reset-password?token=...). Public/unauthenticated by design — the
// token itself is the proof of identity, same as any email-based reset
// flow.
export function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (newPassword !== confirmPassword) { setError("New password and confirmation don't match."); return; }
    setPending(true); setError("");
    try {
      const response = await fetch("/api/v1/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? "Unable to reset password.");
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to reset password.");
    } finally {
      setPending(false);
    }
  }

  if (!token) {
    return <p className="form-error" role="alert">This reset link is missing its token. Request a new one from the sign-in page.</p>;
  }

  if (done) {
    return (
      <div className="login-form">
        <p className="muted">Your password has been reset. Sign in with your new password.</p>
        <button type="button" className="primary-button" onClick={() => router.replace("/login")}><ArrowRight size={18} /> Go to sign in</button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="login-form">
      <label>
        <span>New password</span>
        <input type="password" autoComplete="new-password" required minLength={8} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
      </label>
      <label>
        <span>Confirm new password</span>
        <input type="password" autoComplete="new-password" required minLength={8} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
      </label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="primary-button" disabled={pending}>
        {pending ? <LoaderCircle className="spin" size={18} /> : <ArrowRight size={18} />}
        {pending ? "Saving…" : "Reset password"}
      </button>
    </form>
  );
}

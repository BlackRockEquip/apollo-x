"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, LoaderCircle } from "lucide-react";

type CompanyChoice = { code: string; name: string };

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [companies, setCompanies] = useState<CompanyChoice[]>([]);
  const [companyCode, setCompanyCode] = useState("");
  // 2026-09-22, user request: "Add n forgot password to the login screen."
  // A small in-place mode toggle rather than a separate route — the
  // reset-request form only needs one field (email), so a whole new page
  // would be more chrome than content.
  const [mode, setMode] = useState<"signin" | "forgot" | "forgot-sent">("signin");
  const [resetEmail, setResetEmail] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/v1/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: form.get("email"), password: form.get("password"), companyCode: companyCode || undefined }),
    });
    const body = await response.json();
    if (!response.ok) {
      if (body.error?.code === "COMPANY_REQUIRED") setCompanies(body.companies ?? []);
      setError(body.error?.message ?? "Unable to sign in.");
      setPending(false);
      return;
    }
    router.replace(body.destination ?? "/dashboard");
    router.refresh();
  }

  async function submitForgot(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/v1/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: resetEmail }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? "Unable to send reset link.");
      setMode("forgot-sent");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to send reset link.");
    } finally {
      setPending(false);
    }
  }

  if (mode === "forgot" || mode === "forgot-sent") {
    return (
      <form onSubmit={submitForgot} className="login-form">
        {mode === "forgot-sent" ? (
          <p className="muted">If that email has an account, we've sent a link to reset the password. It's valid for 1 hour.</p>
        ) : (
          <>
            <label>
              <span>Email address</span>
              <input value={resetEmail} onChange={(e) => setResetEmail(e.target.value)} type="email" autoComplete="username" required />
            </label>
            {error && <p className="form-error" role="alert">{error}</p>}
            <button className="primary-button" disabled={pending}>
              {pending ? <LoaderCircle className="spin" size={18} /> : <ArrowRight size={18} />}
              {pending ? "Sending…" : "Send reset link"}
            </button>
          </>
        )}
        <button type="button" className="quiet-button" onClick={() => { setMode("signin"); setError(""); }}>Back to sign in</button>
      </form>
    );
  }

  return (
    <form onSubmit={submit} className="login-form">
      <label>
        <span>Email address</span>
        <input name="email" type="email" autoComplete="username" required />
      </label>
      <label>
        <span>Password</span>
        <input name="password" type="password" autoComplete="current-password" required />
      </label>
      {companies.length > 0 && (
        <label>
          <span>Company</span>
          <select value={companyCode} onChange={(event) => setCompanyCode(event.target.value)} required>
            <option value="">Choose a company</option>
            {companies.map((company) => <option key={company.code} value={company.code}>{company.name}</option>)}
          </select>
        </label>
      )}
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="primary-button" disabled={pending}>
        {pending ? <LoaderCircle className="spin" size={18} /> : <ArrowRight size={18} />}
        {pending ? "Signing in…" : "Sign in"}
      </button>
      <button type="button" className="login-forgot-link" onClick={() => { setMode("forgot"); setError(""); }}>Forgot password?</button>
    </form>
  );
}

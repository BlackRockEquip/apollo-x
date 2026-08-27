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
    </form>
  );
}

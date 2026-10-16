"use client";

import { useEffect, useState } from "react";
import Image from "next/image";

type PublicCompany = { id: string; name: string };

// 2026-09-22, user request: "Add below the words at the bottom a section
// that displays all companies that use the platform, use the
// organizations Logo." "The words at the bottom" is the login-capabilities
// row (Jobs & WIP / Multi-location inventory / PEX lifecycle / Tenant
// isolation) — the last thing in the login page's left-hand marketing
// column — so this renders directly below it, still inside .login-story.
// Fetches from the new public /api/v1/public/companies endpoint (see its
// own comment for what's deliberately exposed) rather than the page
// server component doing it directly, since the login page itself has to
// stay reachable even if this list fails to load — a client-side fetch
// keeps a companies-list hiccup from ever blocking sign-in.
export function PlatformCompaniesStrip() {
  const [companies, setCompanies] = useState<PublicCompany[]>([]);
  const [broken, setBroken] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    fetch("/api/v1/public/companies", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : { companies: [] }))
      .then((body: { companies?: PublicCompany[] }) => { if (!cancelled) setCompanies(body.companies ?? []); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const visible = companies.filter((company) => !broken.has(company.id));
  if (visible.length === 0) return null;

  // 2026-10-16, user request: four logos side by side; with more than four the row becomes a slider that slides
  // to the left on its own (the list is shown twice in a row so it loops without a jump; the copy is hidden from
  // screen readers). With four or fewer the logos just sit still.
  const MAX_STATIC = 4;
  const sliding = visible.length > MAX_STATIC;
  const group = (copy: boolean) => (
    <div className="login-logos-group" aria-hidden={copy || undefined}>
      {visible.map((company) => (
        <Image
          key={`${copy ? "b" : "a"}${company.id}`}
          src={`/api/v1/public/companies/${company.id}/logo`}
          alt={copy ? "" : company.name}
          title={company.name}
          width={120}
          height={40}
          unoptimized
          className="login-company-logo"
          onError={() => setBroken((current) => new Set(current).add(company.id))}
        />
      ))}
    </div>
  );

  return (
    <div className="login-companies-strip">
      <p className="login-companies-label">Trusted by teams at</p>
      <div className={`login-companies-logos${sliding ? " is-sliding" : ""}`}>
        <div className="login-logos-track" style={sliding ? { animationDuration: `${Math.max(12, visible.length * 4)}s` } : undefined}>
          {group(false)}
          {sliding ? group(true) : null}
        </div>
      </div>
    </div>
  );
}

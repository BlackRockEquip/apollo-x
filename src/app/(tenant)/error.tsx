"use client";

import Link from "next/link";

// 2026-10-16: safety net for any company page that fails to load. This app had no error page, so a failing page showed
// a blank screen. Pages that need a switched-off module now redirect before they get here (see requireTenantModulePage
// in lib/auth/page-guard.ts); this catches anything else and gives the user a way back instead of an empty screen.
export default function TenantError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <section className="detail-panel" style={{ maxWidth: 560, margin: "48px auto" }}>
      <header><div><h2>This page could not be shown</h2><p>Something went wrong while opening it. It may have been switched off for your company, or your access may have changed.</p></div></header>
      <div style={{ display: "flex", gap: 8, padding: "0 15px 15px" }}>
        <Link href="/dashboard" className="gold-button">Go to dashboard</Link>
        <button type="button" className="quiet-button" onClick={() => reset()}>Try again</button>
      </div>
    </section>
  );
}

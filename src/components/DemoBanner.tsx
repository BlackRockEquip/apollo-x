"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, Eye } from "lucide-react";
import { DEMO_READ_ONLY_MESSAGE, DEMO_VIEWS } from "@/lib/demo/mode";

// 2026-10-29: public view-only demo (src/lib/demo/mode.ts). Shown at the top of every page when DEMO_MODE=true.
// - says plainly that this is a live demo with sample data and that changes are switched off;
// - "Viewing as" lets a visitor see the system as another role (Manager, Mechanic, ...) via /demo?as=..., landing on that role's start page;
// - "Request a demo" goes to the Flo X contact form (DEMO_CTA_URL);
// - any save the visitor tries is refused by the server; this shows one friendly note instead of each screen's own error.

export function DemoBanner({ viewKey, ctaUrl }: { viewKey: string; ctaUrl: string }) {
  const [notice, setNotice] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const original = window.fetch;
    const wrapped: typeof window.fetch = async (...args) => {
      const response = await original(...args);
      if (response.status === 403 && response.headers.get("x-demo-read-only") === "1") {
        const input = args[0];
        const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
        // Background calls (who-is-in-this-job heartbeat, ad view/click counts) fail quietly.
        if (!/\/(presence|view|click)(\?|$)/.test(url)) {
          setNotice(true);
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => setNotice(false), 4500);
        }
      }
      return response;
    };
    window.fetch = wrapped;
    return () => {
      if (window.fetch === wrapped) window.fetch = original;
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  // 2026-10-29, user report: switching role showed an error page. The switch used to keep the visitor on the same page,
  // but the new role is not always allowed there (e.g. Store controller on Jobs). It now opens the role's own start page.
  function switchView(key: string) {
    window.location.href = `/demo?as=${encodeURIComponent(key)}`;
  }

  return (
    <>
      <div className="demo-banner" role="region" aria-label="Live demo">
        <span className="demo-banner-badge"><span className="demo-banner-dot" aria-hidden="true" />Live demo</span>
        <span className="demo-banner-text">View only, sample data. Saving, uploading and emailing are switched off.</span>
        <label className="demo-banner-view">
          <Eye size={14} aria-hidden="true" />
          <span>Viewing as</span>
          <select value={viewKey} onChange={(event) => switchView(event.target.value)} aria-label="View the demo as">
            {DEMO_VIEWS.map((view) => <option key={view.key} value={view.key}>{view.label}</option>)}
          </select>
        </label>
        <a className="demo-banner-cta" href={ctaUrl} target="_blank" rel="noopener noreferrer">Request a demo <ArrowRight size={14} aria-hidden="true" /></a>
      </div>
      {notice && <div className="demo-toast" role="status" aria-live="polite">{DEMO_READ_ONLY_MESSAGE}</div>}
    </>
  );
}

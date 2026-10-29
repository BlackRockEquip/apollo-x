"use client";

import { useEffect } from "react";
import { setDocTextsInPage } from "@/lib/documents/doc-text";

// 2026-10-21: tells the print helpers (lib/documents/powered-by.ts) whether this
// company has the "Powered by Flo X Integrations" footer switched off.
// 2026-10-29: also carries the company's "Document header text" / "Document footer text"
// (Settings > Company / Branding) so every print window can put them on the page.
export function PoweredByFlag({ hide, headerText, footerText }: { hide: boolean; headerText?: string | null; footerText?: string | null }) {
  useEffect(() => {
    const root = document.documentElement;
    if (hide) root.dataset.hidePoweredBy = "1";
    else delete root.dataset.hidePoweredBy;
    return () => { delete root.dataset.hidePoweredBy; };
  }, [hide]);
  useEffect(() => {
    setDocTextsInPage(headerText, footerText);
    return () => setDocTextsInPage("", "");
  }, [headerText, footerText]);
  return null;
}

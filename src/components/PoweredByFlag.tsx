"use client";

import { useEffect } from "react";

// 2026-10-21: tells the print helpers (lib/documents/powered-by.ts) whether this
// company has the "Powered by Flo X Integrations" footer switched off.
export function PoweredByFlag({ hide }: { hide: boolean }) {
  useEffect(() => {
    const root = document.documentElement;
    if (hide) root.dataset.hidePoweredBy = "1";
    else delete root.dataset.hidePoweredBy;
    return () => { delete root.dataset.hidePoweredBy; };
  }, [hide]);
  return null;
}

"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

// 2026-10-09, user request: "when typing in the search of Job Wip, allow that
// fields filter as you type"; user report straight after: "job wip search bar is
// very slow, is there a way to make it faster".
//
// First version asked the server for a new list on every keystroke (router.replace
// -> re-run the query -> re-render every row), which is what made it slow. Now the
// Jobs page loads its jobs once and this box filters them right here in the
// browser: it broadcasts what is typed to TableColumnFilters (a "tcf:search" window
// event), which hides the rows that don't match — see searchRows there for which
// fields it looks at. Typing is instant, and ?q= in the URL is kept in step (no
// history entry, no reload) so a refresh or a "Back to jobs" link comes back to
// the same search.
//
// serverMode is the fallback for a company with more jobs than the page loads in
// one go (the page then keeps searching on the server, as before): same box, but
// it updates ?q= and lets the server re-run the search, after a longer pause.
export function LiveSearchInput({ tableId, name = "q", placeholder, defaultValue = "", serverMode = false }: { tableId: string; name?: string; placeholder?: string; defaultValue?: string; serverMode?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const [value, setValue] = useState(defaultValue);
  const filterTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const urlTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (filterTimer.current) clearTimeout(filterTimer.current);
    if (urlTimer.current) clearTimeout(urlTimer.current);
  }, []);

  function nextUrl(next: string) {
    const params = new URLSearchParams(window.location.search);
    if (next.trim()) params.set(name, next); else params.delete(name);
    const qs = params.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  }

  function onChange(next: string) {
    setValue(next);
    if (filterTimer.current) clearTimeout(filterTimer.current);
    if (urlTimer.current) clearTimeout(urlTimer.current);
    if (serverMode) {
      urlTimer.current = setTimeout(() => router.replace(nextUrl(next), { scroll: false }), 500);
      return;
    }
    filterTimer.current = setTimeout(() => window.dispatchEvent(new CustomEvent("tcf:search", { detail: { tableId, q: next } })), 60);
    urlTimer.current = setTimeout(() => {
      try { window.history.replaceState(window.history.state, "", nextUrl(next)); } catch { /* best-effort */ }
    }, 500);
  }

  return <input
    type="text"
    name={name}
    value={value}
    autoComplete="off"
    placeholder={placeholder}
    onChange={(e) => onChange(e.target.value)}
    // Enter used to submit the (GET) form and reload the page; filtering is live now, so it just keeps the box focused.
    onKeyDown={(e) => { if (e.key === "Enter" && !serverMode) e.preventDefault(); }}
  />;
}

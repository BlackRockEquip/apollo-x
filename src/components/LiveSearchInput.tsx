"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

// 2026-10-09, user request: "when typing in the search of Job Wip, allow that
// fields filter as you type". The Jobs & WIP search used to need Enter / the
// Apply button. This is the same <input name="q"> inside the same GET form
// (Enter still works), but it also updates the page's ?q= a moment after each
// keystroke (router.replace, so no history entry per letter) and the server
// page re-runs its search — so the search keeps covering every field it always
// did (BRE, linked job, customer, machine, component, reference), not just the
// columns on screen. Other query params (view …) are left alone.
export function LiveSearchInput({ name = "q", placeholder, defaultValue = "", delayMs = 300 }: { name?: string; placeholder?: string; defaultValue?: string; delayMs?: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const [value, setValue] = useState(defaultValue);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  function push(next: string) {
    const params = new URLSearchParams(window.location.search);
    if (next.trim()) params.set(name, next); else params.delete(name);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  return <input
    type="text"
    name={name}
    value={value}
    autoComplete="off"
    placeholder={placeholder}
    onChange={(e) => {
      const next = e.target.value;
      setValue(next);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => push(next), delayMs);
    }}
  />;
}

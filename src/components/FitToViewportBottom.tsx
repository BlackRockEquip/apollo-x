"use client";

import { useEffect } from "react";

// 2026-10-06, user request: "Job WIP table — make it so the table stops at
// the bottom of the screen." The table's scroll box used a fixed
// `max-height: calc(100vh - 330px)` (globals.css) — a guess at how tall
// everything above it is, which stopped being right whenever the toolbar
// above wrapped differently or a row was removed (the filter-chip strip),
// leaving the table ending short of the screen bottom or running past it.
// This measures the real distance from the top of the page to the box and
// caps its height so its bottom edge lands exactly at the bottom of the
// window (minus the page's own bottom padding), re-measuring on resize and
// whenever the content above it changes size. max-height only ever caps the
// box, so a short table stays short.
export function FitToViewportBottom({ selector, bottomGap = 28, minHeight = 220 }: { selector: string; bottomGap?: number; minHeight?: number }) {
  useEffect(() => {
    const el = document.querySelector<HTMLElement>(selector);
    if (!el) return;
    const fit = () => {
      const top = el.getBoundingClientRect().top + window.scrollY;
      const available = Math.max(minHeight, Math.floor(window.innerHeight - top - bottomGap));
      el.style.maxHeight = `${available}px`;
    };
    fit();
    window.addEventListener("resize", fit);
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(fit) : null;
    observer?.observe(document.body);
    if (el.parentElement) observer?.observe(el.parentElement);
    return () => {
      window.removeEventListener("resize", fit);
      observer?.disconnect();
      el.style.maxHeight = "";
    };
  }, [selector, bottomGap, minHeight]);
  return null;
}

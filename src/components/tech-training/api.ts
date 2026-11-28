// Tech Training (2026-11-28): shared client helpers for the training screens.

export class SignedOutError extends Error {
  constructor() { super("You were signed out. Sign in again and repeat the last step."); this.name = "SignedOutError"; }
}

export async function tt<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const response = await fetch(`/api/v1/tech-training/${path}`, {
    method: init?.method ?? "GET",
    cache: "no-store",
    headers: init?.body !== undefined ? { "content-type": "application/json" } : undefined,
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  if (response.redirected && new URL(response.url).pathname === "/login") throw new SignedOutError();
  let body: unknown = null;
  try { body = await response.json(); } catch { /* empty */ }
  if (!response.ok) {
    const message = (body as { error?: { message?: string } } | null)?.error?.message;
    throw new Error(message || "Something went wrong. Please try again.");
  }
  return body as T;
}

export const errText = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback);

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-ZA", { day: "2-digit", month: "short", year: "numeric" });
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${d.toLocaleDateString("en-ZA", { day: "2-digit", month: "short", year: "numeric" })} ${d.toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit", hour12: false })}`;
}

export function fmtTime(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit", hour12: false });
}

export function fmtSeconds(seconds: number | null | undefined): string {
  const s = Math.max(0, Math.round(seconds ?? 0));
  if (!s) return "—";
  if (s < 60) return `${s} s`;
  const min = Math.floor(s / 60);
  const h = Math.floor(min / 60);
  return h ? `${h} h ${min % 60} min` : `${min} min`;
}

export function initials(name: string): string {
  const p = name.trim().split(/\s+/).filter(Boolean);
  return ((p[0]?.[0] ?? "") + (p.length > 1 ? p[p.length - 1][0] : "")).toUpperCase() || "?";
}

export const assetUrl = (id: string) => `/api/v1/tech-training/assets/${encodeURIComponent(id)}`;
export const coverUrl = (courseId: string) => `/api/v1/tech-training/covers/${encodeURIComponent(courseId)}`;

export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error("The file could not be read."));
    r.readAsDataURL(file);
  });
}

export async function readFileAsBase64(file: File): Promise<string> {
  const url = await readFileAsDataUrl(file);
  return url.slice(url.indexOf(",") + 1);
}

export const STATUS_LABEL: Record<string, string> = {
  ASSIGNED: "Assigned", IN_PROGRESS: "In progress", AWAITING_APPROVAL: "Awaiting approval", CERTIFIED: "Certified", ACKNOWLEDGED: "Acknowledged", WITHDRAWN: "Withdrawn",
  PENDING: "Awaiting approval", VALID: "Valid", REJECTED: "Sent back", REVOKED: "Revoked", DRAFT: "Draft", IN_REVIEW: "In review", PUBLISHED: "Published", ARCHIVED: "Archived", SUPERSEDED: "Kept",
  ACTIVE: "Active", INACTIVE: "Inactive", OPEN: "Open", CLOSED: "Closed",
};

export function statusTone(status: string | null | undefined): string {
  switch (status) {
    case "CERTIFIED": case "VALID": case "ACKNOWLEDGED": case "PUBLISHED": case "ACTIVE": case "CLOSED": return "ok";
    case "AWAITING_APPROVAL": case "PENDING": case "IN_REVIEW": case "OPEN": return "wait";
    case "IN_PROGRESS": case "ASSIGNED": return "go";
    case "REJECTED": case "REVOKED": return "bad";
    case "ARCHIVED": return "arc";
    default: return "off";
  }
}

import type { JobFieldKey, PhotoMark, ReportFields, WarrantyValue } from "@/lib/failure-reports/model";

// What the Failure Reports screens get back from /api/v1/failure-reports. Written out here (not imported from the service) so
// the screens never pull server code into the browser.

export type ReportPhoto = { id: string; fileName: string; width: number; height: number; caption: string; marks: PhotoMark[]; src: string };

export type ReportDetail = {
  id: string; jobId: string | null; jobLabel: string; profileId: string | null; fields: ReportFields; warranty: WarrantyValue;
  perPage: number; descHeading: string; replace: string[]; repair: string[]; missing: string[];
  jobValues: Partial<Record<JobFieldKey, string>> | null; photos: ReportPhoto[];
  timesCreated: number; lastCreatedAt: string | null; updatedAt: string; createdAt: string;
};

export type ReportListItem = {
  id: string; jobId: string | null; jobLabel: string; client: string; component: string; make: string; model: string; serial: string;
  reportDate: string; companyName: string; photoCount: number; status: "DRAFT" | "CREATED"; timesCreated: number;
  lastCreatedAt: string | null; updatedAt: string; thumb: string | null;
};

export type ProfileDetails = { address: string; phone: string; email: string; website: string; coreg: string; vat: string; extra: string };
export type Profile = {
  id: string; name: string; legalName: string; logoData: string | null; logoAspect: number; logoDark: boolean; accent: string; dark: string;
  accentText: string | null; headerStyle: "auto" | "light" | "band"; details: ProfileDetails; footer: string; showDetails: boolean;
  isDefault: boolean; active: boolean; updatedAt: string; reportCount?: number;
};

export type JobHit = { id: string; jobNumber: string; client: string; component: string; make: string; model: string; serial: string };

export class SignedOutError extends Error {
  constructor() {
    super("You have been signed out, so this was not saved. Sign in again in a new tab (your typing on this page is kept), then try again.");
    this.name = "SignedOutError";
  }
}

export async function frApi<T>(url: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const response = await fetch(url, {
    method: init?.method ?? "GET",
    cache: "no-store",
    headers: init?.body !== undefined ? { "content-type": "application/json" } : undefined,
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  // 2026-11-26 — live report: "it says uploading but then nothing happens". The session had run out while the report was open;
  // the sign-in check (proxy.ts) sends every signed-out request to /login, the browser follows that silently and gets the login
  // page back as a 200, so the screen never knew the save failed. Now a signed-out answer is an error the screen shows.
  if (response.redirected && new URL(response.url).pathname === "/login") {
    throw new SignedOutError();
  }
  let body: unknown = null;
  try { body = await response.json(); } catch { /* an empty body is fine */ }
  if (response.ok && body === null && !(response.headers.get("content-type") ?? "").includes("json") && response.status !== 204) {
    throw new Error("The server sent back something unexpected. Refresh the page and try again.");
  }
  if (!response.ok) {
    const message = (body as { error?: { message?: string } } | null)?.error?.message;
    throw new Error(message || "Something went wrong. Please try again.");
  }
  return body as T;
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-ZA", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
}

export function profileForBuild(p: Profile) {
  return { name: p.name, legalName: p.legalName, logoData: p.logoData, logoAspect: p.logoAspect, logoDark: p.logoDark, accent: p.accent, dark: p.dark,
    accentText: p.accentText, headerStyle: p.headerStyle, details: p.details, footer: p.footer, showDetails: p.showDetails };
}

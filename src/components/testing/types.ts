import type {
  ReportSummary, TestClutchRow, TestLayoutId, TestParameterRow, TestReadings, TestResultId, TestSpec,
} from "@/lib/testing/spec";

// What the Testing Reports screens get back from /api/v1/testing-reports and /api/v1/testing-templates.
// Written out here (not imported from the service) so the screens never pull server code into the browser.

export type TestStatus = "DRAFT" | "COMPLETED";

export type ReportListItem = {
  id: string; number: number; label: string; status: TestStatus; result: TestResultId | null;
  entered: number; total: number; fail: number;
  jobId: string | null; jobNumber: string; customerName: string; machineModel: string; serialNumber: string;
  testers: string[]; testDate: string; templateName: string; retestOfId: string | null; passedOnComments: boolean; updatedAt: string;
};

export type ReportDetail = {
  id: string; number: number; label: string; status: TestStatus; result: TestResultId | null; summary: ReportSummary;
  spec: TestSpec; readings: TestReadings;
  machineModel: string; serialNumber: string; customerName: string; testDate: string; inputRpm: number | null; testType: string;
  testers: string[]; comments: string; completedAt: string | null; updatedAt: string;
  /** Set when the tester passed an out-of-spec test on the strength of their comments. */
  passedOnComments: { by: string; at: string } | null;
  job: { id: string; jobNumber: string } | null;
  template: { id: string; name: string; revision: number; active: boolean } | null;
  retestOf: { id: string; label: string } | null;
  retests: Array<{ id: string; label: string; status: string; result: string | null }>;
};

export type TemplateItem = {
  id: string; name: string; machineModels: string[]; layout: TestLayoutId; inputRpm: number | null; labelA: string; labelB: string;
  parameters: TestParameterRow[]; clutchRows: TestClutchRow[]; revision: number; active: boolean; updatedAt: string; reportCount?: number;
};

export type JobHit = { id: string; jobNumber: string; machineModel: string; serialNumber: string; customerName: string };

export async function testingApi<T>(url: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const response = await fetch(url, {
    method: init?.method ?? "GET",
    cache: "no-store",
    headers: init?.body !== undefined ? { "content-type": "application/json" } : undefined,
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  let body: unknown = null;
  try { body = await response.json(); } catch { /* an empty body is fine */ }
  if (!response.ok) {
    const message = (body as { error?: { message?: string } } | null)?.error?.message;
    throw new Error(message || "Something went wrong. Please try again.");
  }
  return body as T;
}

export function formatDate(iso: string): string {
  if (!iso) return "";
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-ZA", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
}

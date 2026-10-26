import { beforeEach, describe, expect, it, vi } from "vitest";

// 2026-10-26, user request: activity history export (company admin Settings > Import / Export, and the
// platform administrator's company page). Covers the filters, the permission gates and the workbook contents.
const db = vi.hoisted(() => ({
  company: { findUnique: vi.fn() },
  job: { findMany: vi.fn() },
  jobActivity: { findMany: vi.fn() },
  auditEvent: { findMany: vi.fn(), create: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
const audit = vi.hoisted(() => ({ recordAudit: vi.fn() }));
vi.mock("@/lib/audit/service", () => audit);

import * as XLSX from "xlsx";
import type { RequestContext } from "@/lib/auth/context-types";
import {
  dayRange,
  exportActivityHistory,
  exportCompanyActivityHistoryForPlatform,
  formatExportTimestamp,
  jsonCell,
  redactForExport,
  searchJobsForActivityExport,
} from "@/lib/activity-export/service";

const tenantCtx = (perms: string[] = ["SETTINGS_MANAGE", "AUDIT_VIEW"]) =>
  ({
    companyId: "c1", userId: "u1", displayName: "Admin Person", correlationId: "corr", tenantRole: "COMPANY_ADMIN",
    tenantPermissions: new Set(perms), platformPermissions: new Set(), supportAccessId: null, supportMode: null,
    moduleAccess: new Map([["IMPORT_EXPORT", "FULL"]]),
  }) as unknown as RequestContext;

const platformCtx = (perms: string[] = ["PLATFORM_AUDIT_VIEW"]) =>
  ({
    companyId: null, userId: "p1", displayName: "Platform Person", correlationId: "corr", tenantRole: null,
    tenantPermissions: new Set(), platformPermissions: new Set(perms), supportAccessId: null, supportMode: null,
    moduleAccess: new Map(),
  }) as unknown as RequestContext;

function sheetRows(buffer: Buffer, name: string) {
  const wb = XLSX.read(buffer, { type: "buffer" });
  return { names: wb.SheetNames, rows: wb.Sheets[name] ? XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[name]) : [] };
}

beforeEach(() => {
  vi.clearAllMocks();
  db.company.findUnique.mockResolvedValue({ id: "c1", legalName: "Acme (Pty) Ltd", tradingName: "Acme" });
  db.job.findMany.mockResolvedValue([{ id: "j1", jobNumber: "J00001", draftNumber: "d1" }]);
  db.jobActivity.findMany.mockResolvedValue([
    { id: "a1", type: "STATUS_CHANGED", description: "Status changed", createdAt: new Date("2026-10-01T10:00:00Z"), job: { jobNumber: "J00001", draftNumber: "d1", customer: { name: "Big Mine" } }, actor: { displayName: "Jo" } },
    { id: "a2", type: "NOTE_ADDED", description: "Note added", createdAt: new Date("2026-10-02T10:00:00Z"), job: { jobNumber: null, draftNumber: "d2", customer: { name: "Big Mine" } }, actor: null },
  ]);
  db.auditEvent.findMany.mockResolvedValue([
    { id: "e1", occurredAt: new Date("2026-10-01T10:00:00Z"), actor: { displayName: "Jo" }, source: "UI", module: "JOBS_WIP", entityType: "Job", entityId: "j1", action: "JOB_UPDATED", reason: null, supportAccessId: null, ipAddress: null, beforeData: { a: 1 }, afterData: { a: 2, passwordHash: "x" }, correlationId: "c" },
  ]);
});

describe("helpers", () => {
  it("shows South African time", () => {
    expect(formatExportTimestamp(new Date("2026-10-01T22:30:00Z"))).toBe("2026-10-02 00:30:00");
  });
  it("turns a from/to day into a South African day range, inclusive of the last day", () => {
    const r = dayRange("2026-10-01", "2026-10-02");
    expect(r.gte?.toISOString()).toBe("2026-09-30T22:00:00.000Z");
    expect(r.lt?.toISOString()).toBe("2026-10-02T22:00:00.000Z");
    expect(dayRange()).toEqual({});
    expect(() => dayRange("2026-10-05", "2026-10-01")).toThrow(/on or before/);
  });
  it("hides credential-like fields and caps huge cells", () => {
    expect(redactForExport({ name: "x", nested: { passwordHash: "abc", apiKey: "k" } })).toEqual({ name: "x", nested: { passwordHash: "[hidden]", apiKey: "[hidden]" } });
    expect(jsonCell(null)).toBe("");
    expect(jsonCell({ big: "x".repeat(40000) }).length).toBeLessThan(32100);
  });
});

describe("company export", () => {
  it("job activity only: one activity sheet, no audit query, a Draft label when a job has no number", async () => {
    const r = await exportActivityHistory(tenantCtx(), { includeJobActivity: true, includeAuditLog: false });
    expect(db.auditEvent.findMany).not.toHaveBeenCalled();
    const { names, rows } = sheetRows(r.buffer, "Job activity");
    expect(names).toEqual(["Export info", "Job activity"]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ "Job number": "J00001", Customer: "Big Mine", Activity: "Status changed", User: "Jo", "Date and time": "2026-10-01 12:00:00" });
    expect(rows[1]).toMatchObject({ "Job number": "Draft d2", User: "System" });
    expect(r.fileName).toMatch(/^Acme-job-activity-\d{4}-\d{2}-\d{2}\.xlsx$/);
  });

  it("audit log only, redacting credential-like fields", async () => {
    const r = await exportActivityHistory(tenantCtx(), { includeJobActivity: false, includeAuditLog: true });
    expect(db.jobActivity.findMany).not.toHaveBeenCalled();
    const { names, rows } = sheetRows(r.buffer, "System audit log");
    expect(names).toEqual(["Export info", "System audit log"]);
    expect(rows[0]).toMatchObject({ Record: "J00001", Action: "Job updated" });
    expect(String(rows[0].After)).toContain("[hidden]");
    expect(String(rows[0].After)).not.toContain('"x"');
  });

  it("specific jobs limit both sheets, and only this company's jobs are accepted", async () => {
    await exportActivityHistory(tenantCtx(), { includeJobActivity: true, includeAuditLog: true, jobIds: ["j1", "other-company-job"], from: "2026-10-01", to: "2026-10-31" });
    expect(db.job.findMany.mock.calls[0][0].where).toEqual({ companyId: "c1", id: { in: ["j1", "other-company-job"] } });
    const actWhere = db.jobActivity.findMany.mock.calls[0][0].where;
    expect(actWhere.companyId).toBe("c1");
    expect(actWhere.jobId).toEqual({ in: ["j1"] });
    expect(actWhere.createdAt.gte).toBeInstanceOf(Date);
    const auditWhere = db.auditEvent.findMany.mock.calls[0][0].where;
    expect(auditWhere).toMatchObject({ companyId: "c1", entityType: "Job", entityId: { in: ["j1"] } });
    expect(audit.recordAudit).toHaveBeenCalledTimes(1);
  });

  it("refuses when nothing is chosen, when jobs are not found, and without the right permissions", async () => {
    await expect(exportActivityHistory(tenantCtx(), { includeJobActivity: false, includeAuditLog: false })).rejects.toThrow();
    db.job.findMany.mockResolvedValueOnce([]);
    await expect(exportActivityHistory(tenantCtx(), { includeJobActivity: true, includeAuditLog: false, jobIds: ["zzz"] })).rejects.toThrow(/None of the selected jobs/);
    await expect(exportActivityHistory(tenantCtx(["AUDIT_VIEW"]), { includeJobActivity: true, includeAuditLog: false })).rejects.toThrow();
    await expect(exportActivityHistory(tenantCtx(["SETTINGS_MANAGE"]), { includeJobActivity: false, includeAuditLog: true })).rejects.toThrow();
    expect((await exportActivityHistory(tenantCtx(["SETTINGS_MANAGE"]), { includeJobActivity: true, includeAuditLog: false })).buffer.length).toBeGreaterThan(0);
  });

  it("job picker searches by number, customer or reference; a date range keeps only active jobs", async () => {
    db.job.findMany.mockResolvedValueOnce([{ id: "j1", jobNumber: "J00001", draftNumber: "d1", status: "IN_PROGRESS", customer: { name: "Big Mine" }, _count: { activities: 4 } }]);
    const r = await searchJobsForActivityExport(tenantCtx(), { q: "big", from: "2026-10-01", to: "" });
    expect(r.jobs).toEqual([{ id: "j1", jobNumber: "J00001", customer: "Big Mine", status: "In progress", activityCount: 4 }]);
    const where = db.job.findMany.mock.calls.at(-1)![0].where;
    expect(where.companyId).toBe("c1");
    expect(where.OR).toHaveLength(3);
    expect(where.activities.some.createdAt.gte).toBeInstanceOf(Date);
  });
});

describe("platform export", () => {
  it("gives a platform admin everything for the company and records the download", async () => {
    const r = await exportCompanyActivityHistoryForPlatform(platformCtx(), "c1");
    expect(sheetRows(r.buffer, "Export info").names).toEqual(["Export info", "Job activity", "System audit log"]);
    expect(db.jobActivity.findMany.mock.calls[0][0].where).toEqual({ companyId: "c1" });
    expect(db.auditEvent.findMany.mock.calls[0][0].where).toEqual({ companyId: "c1" });
    expect(db.auditEvent.create.mock.calls[0][0].data).toMatchObject({ companyId: "c1", action: "ACTIVITY_HISTORY_EXPORTED", source: "PLATFORM" });
    expect(r.fileName).toMatch(/^Acme-activity-history-/);
  });
  it("needs the platform audit permission and an existing company", async () => {
    await expect(exportCompanyActivityHistoryForPlatform(platformCtx(["PLATFORM_COMPANIES_VIEW"]), "c1")).rejects.toThrow();
    db.company.findUnique.mockResolvedValueOnce(null);
    await expect(exportCompanyActivityHistoryForPlatform(platformCtx(), "nope")).rejects.toThrow("NOT_FOUND");
  });
});

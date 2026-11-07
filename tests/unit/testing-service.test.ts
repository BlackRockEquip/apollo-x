import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  testSpecTemplate: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
  testReport: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), groupBy: vi.fn() },
  job: { findFirst: vi.fn(), findMany: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@prisma/client", () => ({ Prisma: { JsonNull: "JsonNull", PrismaClientKnownRequestError: class extends Error { code = "P2002"; } } }));
vi.mock("@/lib/audit/service", () => ({ recordAudit: vi.fn() }));

import { AuthorizationError } from "@/lib/auth/guards";
import { DEFAULT_TENANT_PERMISSIONS, TENANT_PERMISSIONS } from "@/lib/auth/permissions";
import { defaultTenantDestination } from "@/lib/auth/page-guard";
import { BUILDS, TILES, initialModuleKeys } from "@/lib/builds/definitions";
import { tenantRoleLabelsFor, tenantRolesFor } from "@/lib/constants";
import { evaluateModuleAccess } from "@/lib/entitlements/policy";
import { BLACK_ROCK_INTERNAL_CODE } from "@/lib/constants";
import { TestingError } from "@/lib/http/errors";
import type { RequestContext } from "@/lib/auth/context-types";
import { STARTER_TEMPLATES } from "@/lib/testing/spec";
import {
  completeTestReport, createTestReport, createTestTemplate, getTestReport, listTestTemplates, retestTestReport, searchJobsForTesting, updateTestReport,
} from "@/lib/testing/service";

type Role = keyof typeof DEFAULT_TENANT_PERMISSIONS;
const ROLES: Role[] = ["COMPANY_ADMIN", "MANAGER", "USER", "STORE_CONTROLLER", "SALES", "FINANCE", "WIP_VIEWER", "TESTING_TECHNICIAN"];

function ctxFor(role: Role, moduleMode: "FULL" | "READ_ONLY" | "DENIED" = "FULL"): RequestContext {
  return {
    companyId: "c1", userId: "u1", displayName: "Michael", correlationId: "x",
    tenantRole: role,
    tenantPermissions: DEFAULT_TENANT_PERMISSIONS[role],
    moduleAccess: new Map([["TESTING_REPORTS", moduleMode]]),
    platformPermissions: new Set(),
    supportAccessId: null, supportMode: null,
  } as unknown as RequestContext;
}

const ID = "cabcdefghijklmnopqrstuv1"; // cuid-shaped
const JOB = "cabcdefghijklmnopqrstuv2";
const TPL = "cabcdefghijklmnopqrstuv3";
const t777 = STARTER_TEMPLATES[0];

function templateRow(over: Record<string, unknown> = {}) {
  return { id: TPL, companyId: "c1", name: t777.name, machineModels: t777.machineModels, layout: t777.layout, inputRpm: 800, labelA: "Forward", labelB: "Reverse", parameters: t777.parameters, clutchRows: t777.clutchRows, revision: 2, active: true, createdAt: new Date(), updatedAt: new Date(), ...over };
}

function reportRow(over: Record<string, unknown> = {}) {
  return {
    id: ID, companyId: "c1", number: 7, jobId: JOB, templateId: TPL,
    spec: { name: t777.name, layout: t777.layout, revision: 2, labelA: "Forward", labelB: "Reverse", parameters: t777.parameters, clutchRows: t777.clutchRows },
    machineModel: "777D", serialNumber: "1FX06830", customerName: "Northern Aggregates", testDate: new Date("2026-11-07T00:00:00Z"), inputRpm: 800, testType: null,
    readings: {}, testers: ["Michael"], comments: null, status: "DRAFT", result: null, resultSummary: null, completedAt: null, retestOfId: null,
    createdAt: new Date(), updatedAt: new Date(),
    job: { id: JOB, jobNumber: "BRE970", draftNumber: null }, template: { id: TPL, name: t777.name, revision: 2, active: true }, retestOf: null, retests: [],
    ...over,
  };
}

// Every reading typed, all in spec.
const FULL_READINGS = {
  params: { "input-flow": { actual: "110" }, "lube-flow": { actual: "1" }, "system-voltage": { actual: "24" } },
  clutches: Object.fromEntries(t777.clutchRows.map((r) => [r.id, { ...(r.a ? { a: { actual: String((r.a as { nominal: number }).nominal) } } : {}), ...(r.b ? { b: { actual: String((r.b as { nominal: number }).nominal) } } : {}) }])),
};

beforeEach(() => { vi.clearAllMocks(); });

describe("who gets Testing Reports", () => {
  it("is granted to Admins, Managers and Testing Technicians, and to nobody else", () => {
    const withAccess = ROLES.filter((r) => DEFAULT_TENANT_PERMISSIONS[r].has("TESTING_VIEW") && DEFAULT_TENANT_PERMISSIONS[r].has("TESTING_EDIT"));
    expect(withAccess.sort()).toEqual(["COMPANY_ADMIN", "MANAGER", "TESTING_TECHNICIAN"]);
    for (const r of ROLES.filter((x) => !withAccess.includes(x))) {
      expect(TENANT_PERMISSIONS.filter((p) => p.startsWith("TESTING_") && DEFAULT_TENANT_PERMISSIONS[r].has(p))).toEqual([]);
    }
  });

  it("keeps changing the spec limits for Admins and Managers", () => {
    expect(DEFAULT_TENANT_PERMISSIONS.COMPANY_ADMIN.has("TESTING_MANAGE")).toBe(true);
    expect(DEFAULT_TENANT_PERMISSIONS.MANAGER.has("TESTING_MANAGE")).toBe(true);
    expect(DEFAULT_TENANT_PERMISSIONS.TESTING_TECHNICIAN.has("TESTING_MANAGE")).toBe(false);
  });

  it("gives a Testing Technician Testing Reports and nothing else", () => {
    expect(Array.from(DEFAULT_TENANT_PERMISSIONS.TESTING_TECHNICIAN).sort()).toEqual(["TESTING_EDIT", "TESTING_VIEW"]);
  });

  it("offers the Testing Technician user type to Workshop companies", () => {
    expect(tenantRolesFor("WORKSHOP")).toContain("TESTING_TECHNICIAN");
    expect(tenantRolesFor("ENGINEERING")).not.toContain("TESTING_TECHNICIAN");
    expect(tenantRoleLabelsFor("WORKSHOP").TESTING_TECHNICIAN).toBe("Testing Technician");
  });

  it("is a Workshop module tile that a new company starts without, and Black Rock has in full", () => {
    expect(BUILDS.WORKSHOP.tiles).toContain("TESTING_REPORTS");
    expect(TILES.TESTING_REPORTS.modules).toEqual(["TESTING_REPORTS"]);
    expect(initialModuleKeys("WORKSHOP")).not.toContain("TESTING_REPORTS");
    expect(evaluateModuleAccess({ companyInternalCode: BLACK_ROCK_INTERNAL_CODE, companyActive: true, module: "TESTING_REPORTS" })).toBe("FULL");
  });

  it("lands a Testing Technician on Testing Reports after login", () => {
    const access = new Map([["TESTING_REPORTS", "FULL"]]) as never;
    expect(defaultTenantDestination(DEFAULT_TENANT_PERMISSIONS.TESTING_TECHNICIAN, access)).toBe("/testing-reports");
    expect(defaultTenantDestination(DEFAULT_TENANT_PERMISSIONS.TESTING_TECHNICIAN, new Map() as never)).toBe("/notifications");
  });
});

describe("access checks in the service", () => {
  it("lets a Testing Technician read templates but not change them", async () => {
    db.testSpecTemplate.findMany.mockResolvedValue([templateRow()]);
    db.testReport.groupBy.mockResolvedValue([]);
    expect((await listTestTemplates(ctxFor("TESTING_TECHNICIAN"))).items).toHaveLength(1);
    await expect(createTestTemplate(ctxFor("TESTING_TECHNICIAN"), STARTER_TEMPLATES[0])).rejects.toBeInstanceOf(AuthorizationError);
    expect(db.testSpecTemplate.create).not.toHaveBeenCalled();
  });

  it("lets a Manager create a template", async () => {
    db.testSpecTemplate.create.mockResolvedValue(templateRow());
    await createTestTemplate(ctxFor("MANAGER"), STARTER_TEMPLATES[0]);
    expect(db.testSpecTemplate.create).toHaveBeenCalledTimes(1);
  });

  it("refuses everyone when the module is off, and blocks writes in licence grace", async () => {
    await expect(listTestTemplates(ctxFor("COMPANY_ADMIN", "DENIED"))).rejects.toBeInstanceOf(AuthorizationError);
    db.testReport.findFirst.mockResolvedValue(reportRow());
    await expect(updateTestReport(ctxFor("COMPANY_ADMIN", "READ_ONLY"), ID, { comments: "x" })).rejects.toBeInstanceOf(AuthorizationError);
  });

  it("refuses a user type with no Testing access", async () => {
    await expect(listTestTemplates(ctxFor("USER"))).rejects.toBeInstanceOf(AuthorizationError);
    await expect(searchJobsForTesting(ctxFor("SALES"), "")).rejects.toBeInstanceOf(AuthorizationError);
  });
});

describe("starting a test", () => {
  it("copies the template and fills the header from the job", async () => {
    db.testSpecTemplate.findFirst.mockResolvedValue(templateRow());
    db.job.findFirst.mockResolvedValue({ id: JOB, machineModel: "777D", componentModel: null, machineSerial: null, componentSerial: "1FX06830", customer: { name: "Northern Aggregates", tradingName: null } });
    db.testReport.findFirst.mockResolvedValueOnce({ number: 231 }).mockResolvedValue(reportRow({ number: 232 }));
    db.testReport.create.mockResolvedValue({ id: ID, number: 232 });
    await createTestReport(ctxFor("TESTING_TECHNICIAN"), { templateId: TPL, jobId: JOB });
    const data = db.testReport.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ companyId: "c1", number: 232, jobId: JOB, templateId: TPL, machineModel: "777D", serialNumber: "1FX06830", inputRpm: 800, testers: ["Michael"] });
    expect(data.spec).toMatchObject({ name: "CAT 777D", revision: 2, labelA: "Forward" });
    expect(data.spec.clutchRows).toHaveLength(9);
  });

  it("will not start from a switched-off template", async () => {
    db.testSpecTemplate.findFirst.mockResolvedValue(templateRow({ active: false }));
    await expect(createTestReport(ctxFor("TESTING_TECHNICIAN"), { templateId: TPL })).rejects.toMatchObject({ code: "TEMPLATE_UNAVAILABLE" });
  });

  it("hides the customer from a Testing Technician and shows it to a Manager", async () => {
    db.testReport.findFirst.mockResolvedValue(reportRow());
    expect((await getTestReport(ctxFor("TESTING_TECHNICIAN"), ID)).customerName).toBe("");
    expect((await getTestReport(ctxFor("MANAGER"), ID)).customerName).toBe("Northern Aggregates");
  });

  it("does not search customer names for a Testing Technician", async () => {
    db.job.findMany.mockResolvedValue([{ id: JOB, jobNumber: "BRE970", draftNumber: null, machineModel: "777D", componentModel: null, machineSerial: null, componentSerial: null, customer: { name: "Secret Co", tradingName: null } }]);
    const result = await searchJobsForTesting(ctxFor("TESTING_TECHNICIAN"), "777");
    expect(JSON.stringify(db.job.findMany.mock.calls[0][0].where)).not.toContain("customer");
    expect(result.items[0]).toMatchObject({ jobNumber: "BRE970", customerName: "" });
  });
});

describe("filling in and completing", () => {
  it("saves readings against the report's own spec and stamps a pass-with-note", async () => {
    db.testReport.findFirst.mockResolvedValue(reportRow());
    db.testReport.update.mockResolvedValue({});
    await updateTestReport(ctxFor("TESTING_TECHNICIAN"), ID, {
      readings: { params: { "input-flow": { actual: "120", override: { reason: "Checked twice on the second gauge" } }, "not-a-row": { actual: "5" } }, clutches: {} },
      testers: ["Mornay", "Michael"],
    });
    const data = db.testReport.update.mock.calls[0][0].data;
    expect(data.testers).toEqual(["Mornay", "Michael"]);
    expect(Object.keys(data.readings.params)).toEqual(["input-flow"]);
    expect(data.readings.params["input-flow"].override).toMatchObject({ reason: "Checked twice on the second gauge", by: "Michael" });
  });

  it("does not let a completed test be edited", async () => {
    db.testReport.findFirst.mockResolvedValue(reportRow({ status: "COMPLETED", result: "PASS" }));
    await expect(updateTestReport(ctxFor("MANAGER"), ID, { comments: "x" })).rejects.toMatchObject({ code: "REPORT_COMPLETED" });
    expect(db.testReport.update).not.toHaveBeenCalled();
  });

  it("will not complete a test with readings missing or no tester", async () => {
    db.testReport.findFirst.mockResolvedValue(reportRow({ testers: [], readings: { params: { "input-flow": { actual: "110" } } } }));
    const error = await completeTestReport(ctxFor("TESTING_TECHNICIAN"), ID).catch((e) => e);
    expect(error).toBeInstanceOf(TestingError);
    expect(error.message).toContain("Add at least one tester.");
    expect(error.message).toContain("still empty");
    expect(db.testReport.update).not.toHaveBeenCalled();
  });

  it("completes a finished test with the result it works out", async () => {
    db.testReport.findFirst.mockResolvedValueOnce(reportRow({ readings: FULL_READINGS })).mockResolvedValue(reportRow({ readings: FULL_READINGS, status: "COMPLETED", result: "PASS" }));
    db.testReport.update.mockResolvedValue({});
    const done = await completeTestReport(ctxFor("TESTING_TECHNICIAN"), ID);
    const data = db.testReport.update.mock.calls[0][0].data;
    expect(data).toMatchObject({ status: "COMPLETED", result: "PASS", completedById: "u1" });
    expect(data.resultSummary).toMatchObject({ fail: 0, overridden: 0 });
    expect(done.result).toBe("PASS");
  });

  it("records a failing reading as a Fail", async () => {
    const readings = JSON.parse(JSON.stringify(FULL_READINGS));
    readings.clutches["6th"].b.actual = "390";
    db.testReport.findFirst.mockResolvedValueOnce(reportRow({ readings })).mockResolvedValue(reportRow({ readings, status: "COMPLETED", result: "FAIL" }));
    db.testReport.update.mockResolvedValue({});
    await completeTestReport(ctxFor("TESTING_TECHNICIAN"), ID);
    expect(db.testReport.update.mock.calls[0][0].data.result).toBe("FAIL");
  });
});

describe("retests", () => {
  it("starts a fresh empty sheet with the same limits, linked to the first", async () => {
    const first = reportRow({ status: "COMPLETED", result: "FAIL", readings: FULL_READINGS });
    db.testReport.findFirst.mockResolvedValueOnce(first).mockResolvedValueOnce({ number: 232 }).mockResolvedValue(reportRow({ number: 233, retestOfId: ID }));
    db.testReport.create.mockResolvedValue({ id: "cabcdefghijklmnopqrstuv9", number: 233 });
    await retestTestReport(ctxFor("TESTING_TECHNICIAN"), ID);
    const data = db.testReport.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ number: 233, retestOfId: ID, readings: {}, testers: ["Michael"] });
    expect(data.spec).toEqual(first.spec);
  });

  it("only retests a completed test", async () => {
    db.testReport.findFirst.mockResolvedValue(reportRow());
    await expect(retestTestReport(ctxFor("TESTING_TECHNICIAN"), ID)).rejects.toMatchObject({ code: "REPORT_NOT_COMPLETED" });
  });
});

describe("job screen and platform admin switch", () => {
  it("shows the Testing tab on a job only when the module is on for the user", async () => {
    const { buildJobTabs, tabFromHash } = await import("@/components/job-screen/job-tabs");
    const base = { showParts: true, showPickSlips: false, showFollowup: false, showOutwork: false, showSpecifications: false, showPex: false, showWarranty: false, showActivity: false, partsCount: 0, pickSlipsCount: 0, followupCount: 0, outworkCount: 0, attachmentsCount: 0 };
    expect(buildJobTabs(base).map((t) => t.key)).not.toContain("testing");
    expect(buildJobTabs({ ...base, showTesting: true }).map((t) => t.key)).toContain("testing");
    expect(tabFromHash("#tab=testing")).toBe("testing");
  });

  it("is a module tile a platform admin can switch on or off per company, and is not a core tile", () => {
    expect(TILES.TESTING_REPORTS.core).toBeFalsy();
    expect(TILES.TESTING_REPORTS.requires ?? []).toEqual([]);
    expect(BUILDS.WORKSHOP.defaultOn ?? []).not.toContain("TESTING_REPORTS");
    expect(BUILDS.ENGINEERING.tiles).not.toContain("TESTING_REPORTS");
  });
});

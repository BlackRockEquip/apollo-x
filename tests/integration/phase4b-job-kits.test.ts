import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ModuleKey, Prisma, PrismaClient } from "@prisma/client";
import type { RequestContext } from "@/lib/auth/context-types";
import { DEFAULT_TENANT_PERMISSIONS } from "@/lib/auth/permissions";
import { AuthorizationError } from "@/lib/auth/guards";
import { createMaster } from "@/lib/master-data/service";
import { createDraftJob, getJobById, registerJob } from "@/lib/jobs/service";
import { addJobKitLine, applyJobKitToJob, createJobKit, getJobKitById, listJobKits, removeJobKitLine, setJobKitActive, updateJobKit, updateJobKitLine } from "@/lib/job-kits/service";

const url = process.env.DATABASE_URL_TEST;
if (!url) throw new Error("DATABASE_URL_TEST is required");
const db = new PrismaClient({ datasources: { db: { url } } });
const suffix = `p4b_${Date.now()}_${Math.random().toString(36).slice(2)}`;

let companyA = "";
let companyB = "";
let userA = "";
let userB = "";
let customerA = "";
let customerB = "";
let partA1 = "";
let partA2 = "";
let partB1 = "";

function ctx(companyId: string, userId: string, permissions = DEFAULT_TENANT_PERMISSIONS.COMPANY_ADMIN, supportMode: "READ_ONLY" | null = null): RequestContext {
  return { userId, displayName: "P4B test", companyId, companyInternalCode: suffix, tenantRole: "COMPANY_ADMIN", tenantPermissions: new Set(permissions), platformPermissions: new Set(), supportAccessId: supportMode ? "support-1" : null, supportMode, moduleAccess: new Map(Object.values(ModuleKey).map((k) => [k, "FULL" as const])), correlationId: suffix };
}

beforeAll(async () => {
  const [a, b] = await Promise.all([
    db.company.create({ data: { internalCode: `KTA_${suffix}`, legalName: "Kits A", settings: { create: {} } } }),
    db.company.create({ data: { internalCode: `KTB_${suffix}`, legalName: "Kits B", settings: { create: {} } } }),
  ]);
  companyA = a.id;
  companyB = b.id;
  const [ua, ub] = await Promise.all([
    db.userIdentity.create({ data: { email: `kta-${suffix}@test.local`, displayName: "User A", passwordHash: "x" } }),
    db.userIdentity.create({ data: { email: `ktb-${suffix}@test.local`, displayName: "User B", passwordHash: "x" } }),
  ]);
  userA = ua.id;
  userB = ub.id;
  await db.companyMembership.createMany({ data: [
    { userId: userA, companyId: companyA, role: "COMPANY_ADMIN", status: "ACTIVE" },
    { userId: userB, companyId: companyB, role: "COMPANY_ADMIN", status: "ACTIVE" },
  ] });
  await db.documentNumberSequence.createMany({ data: [
    { companyId: companyA, type: "JOB", prefix: `KTA${suffix.slice(-2).toUpperCase()}-`, padding: 4, nextValue: BigInt(1), includeFinancialYear: false, financialYearStartMonth: 3, active: true },
    { companyId: companyB, type: "JOB", prefix: `KTB${suffix.slice(-2).toUpperCase()}-`, padding: 4, nextValue: BigInt(1), includeFinancialYear: false, financialYearStartMonth: 3, active: true },
  ] });
  customerA = ((await createMaster(ctx(companyA, userA), "customers", { name: "Kit Customer A", currencyCode: "ZAR" })) as { id: string }).id;
  customerB = ((await createMaster(ctx(companyB, userB), "customers", { name: "Kit Customer B", currencyCode: "ZAR" })) as { id: string }).id;
  partA1 = ((await createMaster(ctx(companyA, userA), "parts", { partNumber: `KTA-${suffix}-1`, description: "Kit Part A1", unitOfMeasure: "EA" })) as { id: string }).id;
  partA2 = ((await createMaster(ctx(companyA, userA), "parts", { partNumber: `KTA-${suffix}-2`, description: "Kit Part A2", unitOfMeasure: "EA" })) as { id: string }).id;
  partB1 = ((await createMaster(ctx(companyB, userB), "parts", { partNumber: `KTB-${suffix}-1`, description: "Kit Part B1", unitOfMeasure: "EA" })) as { id: string }).id;
});

afterAll(async () => {
  await db.$executeRaw`TRUNCATE TABLE "JobPartAllocationMovement", "JobPartAllocation", "JobPartRequirement", "JobActivity", "JobNote", "JobFieldServiceReport", "JobWarranty", "JobComponent", "Job", "JobKitLine", "JobKit" RESTART IDENTITY CASCADE`;
  for (const companyId of [companyA, companyB]) {
    await db.auditEvent.deleteMany({ where: { companyId } });
    await db.documentNumberSequence.deleteMany({ where: { companyId } });
    await db.part.deleteMany({ where: { companyId } });
    await db.customer.deleteMany({ where: { companyId } });
    await db.companySettings.deleteMany({ where: { companyId } });
    await db.companyMembership.deleteMany({ where: { companyId } });
  }
  await db.company.deleteMany({ where: { id: { in: [companyA, companyB] } } });
  await db.userIdentity.deleteMany({ where: { id: { in: [userA, userB] } } });
  await db.$disconnect();
});

describe("Phase 4B Job Kits", () => {
  it("creates, lists, edits, deactivates/reactivates kits and maintains tenant isolation", async () => {
    const kit = await createJobKit(ctx(companyA, userA), { name: `Seal kit ${suffix}`, description: "Std seal kit", machineMake: "CAT", machineModel: "320", componentType: "Pump", lines: [{ partId: partA1, quantityDefault: "2", notes: "Primary seal" }] });
    expect(kit.lines).toHaveLength(1);

    const listed = await listJobKits(ctx(companyA, userA), { q: "Seal", status: "active", page: 1, pageSize: 20 });
    expect(listed.items.some((item) => item.id === kit.id)).toBe(true);

    const isolated = await listJobKits(ctx(companyB, userB), { q: "Seal", status: "all", page: 1, pageSize: 20 });
    expect(isolated.items.some((item) => item.id === kit.id)).toBe(false);

    const edited = await updateJobKit(ctx(companyA, userA), kit.id, { description: "Updated", machineModel: "330" });
    expect(edited.description).toBe("Updated");
    expect(edited.machineModel).toBe("330");

    const inactive = await setJobKitActive(ctx(companyA, userA), kit.id, { active: false });
    expect(inactive.active).toBe(false);

    const activeAgain = await setJobKitActive(ctx(companyA, userA), kit.id, { active: true });
    expect(activeAgain.active).toBe(true);
  });

  it("adds, edits, removes kit lines and rejects cross-tenant or duplicate parts", async () => {
    const kit = await createJobKit(ctx(companyA, userA), { name: `Hyd kit ${suffix}`, lines: [] });
    const withLine = await addJobKitLine(ctx(companyA, userA), kit.id, { partId: partA1, quantityDefault: "1", notes: "First", sortOrder: 0 });
    expect(withLine.lines).toHaveLength(1);

    const updated = await updateJobKitLine(ctx(companyA, userA), kit.id, withLine.lines[0]!.id, { quantityDefault: "3", notes: "Updated", sortOrder: 5 });
    expect(String(updated.lines[0]!.quantityDefault)).toBe("3");
    expect(updated.lines[0]!.notes).toBe("Updated");
    expect(updated.lines[0]!.sortOrder).toBe(5);

    await expect(addJobKitLine(ctx(companyA, userA), kit.id, { partId: partB1, quantityDefault: "1" })).rejects.toThrow("NOT_FOUND");
    await expect(addJobKitLine(ctx(companyA, userA), kit.id, { partId: partA1, quantityDefault: "1" })).rejects.toMatchObject({ code: "P2002" });

    const removed = await removeJobKitLine(ctx(companyA, userA), kit.id, updated.lines[0]!.id);
    expect(removed.lines).toHaveLength(0);
  });

  it("enforces DB-level tenant-qualified lineage constraints", async () => {
    const kit = await createJobKit(ctx(companyA, userA), { name: `DB kit ${suffix}`, lines: [] });
    await expect(db.jobKitLine.create({ data: { companyId: companyA, jobKitId: kit.id, partId: partB1, quantityDefault: new Prisma.Decimal(1) } })).rejects.toMatchObject({ code: "P2003" });
    await expect(db.jobKitLine.create({ data: { companyId: companyB, jobKitId: kit.id, partId: partB1, quantityDefault: new Prisma.Decimal(1) } })).rejects.toMatchObject({ code: "P2003" });
  });

  it("applies a kit to a job, increments existing active requirements, supports repeat application, and writes activity", async () => {
    const kit = await createJobKit(ctx(companyA, userA), { name: `Apply kit ${suffix}`, lines: [{ partId: partA1, quantityDefault: "2", notes: "Seal" }, { partId: partA2, quantityDefault: "4", notes: "Bearing" }] });
    const draft = await createDraftJob(ctx(companyA, userA), { customerId: customerA, type: "STANDARD_REPAIR", component: "Pump" });
    const job = await registerJob(ctx(companyA, userA), draft.id, { initialStatus: "WAITING_FOR_PARTS" });

    const first = await applyJobKitToJob(ctx(companyA, userA), job.id, kit.id);
    expect(first.appliedLines).toHaveLength(2);

    let detail = await getJobById(ctx(companyA, userA), job.id) as { partRequirements: Array<{ partId: string; quantityRequired: unknown; notes?: string | null }> };
    expect(detail.partRequirements).toHaveLength(2);
    expect(String(detail.partRequirements.find((row) => row.partId === partA1)!.quantityRequired)).toBe("2");
    expect(String(detail.partRequirements.find((row) => row.partId === partA2)!.quantityRequired)).toBe("4");

    const second = await applyJobKitToJob(ctx(companyA, userA), job.id, kit.id);
    expect(second.appliedLines.every((line) => line.mode === "INCREMENTED")).toBe(true);

    detail = await getJobById(ctx(companyA, userA), job.id) as { partRequirements: Array<{ partId: string; quantityRequired: unknown; notes?: string | null }> };
    expect(String(detail.partRequirements.find((row) => row.partId === partA1)!.quantityRequired)).toBe("4");
    expect(String(detail.partRequirements.find((row) => row.partId === partA2)!.quantityRequired)).toBe("8");
    expect(String(detail.partRequirements.find((row) => row.partId === partA1)!.notes)).toContain(`Kit ${kit.name}`);

    const activity = await db.jobActivity.findFirst({ where: { companyId: companyA, jobId: job.id, type: "KIT_APPLIED" }, orderBy: { createdAt: "desc" } });
    expect(activity).toBeTruthy();
    expect(String(activity?.description)).toContain(kit.name);
  });

  it("rejects inactive kit application, cross-tenant job/kit application, and rolls back if any line is invalid", async () => {
    const inactiveKit = await createJobKit(ctx(companyA, userA), { name: `Inactive kit ${suffix}`, lines: [{ partId: partA1, quantityDefault: "1" }] });
    await setJobKitActive(ctx(companyA, userA), inactiveKit.id, { active: false });
    const draft = await createDraftJob(ctx(companyA, userA), { customerId: customerA, type: "STANDARD_REPAIR", component: "Motor" });
    const job = await registerJob(ctx(companyA, userA), draft.id, { initialStatus: "WAITING_FOR_PARTS" });
    await expect(applyJobKitToJob(ctx(companyA, userA), job.id, inactiveKit.id)).rejects.toThrow("NOT_FOUND");

    const otherDraft = await createDraftJob(ctx(companyB, userB), { customerId: customerB, type: "STANDARD_REPAIR", component: "Motor" });
    const otherJob = await registerJob(ctx(companyB, userB), otherDraft.id, { initialStatus: "WAITING_FOR_PARTS" });
    const validKit = await createJobKit(ctx(companyA, userA), { name: `Cross kit ${suffix}`, lines: [{ partId: partA1, quantityDefault: "1" }] });
    await expect(applyJobKitToJob(ctx(companyA, userA), otherJob.id, validKit.id)).rejects.toThrow("NOT_FOUND");
    await expect(applyJobKitToJob(ctx(companyB, userB), job.id, validKit.id)).rejects.toThrow("NOT_FOUND");

    const rollbackKit = await createJobKit(ctx(companyA, userA), { name: `Rollback kit ${suffix}`, lines: [{ partId: partA1, quantityDefault: "1" }, { partId: partA2, quantityDefault: "1" }] });
    await db.part.update({ where: { id: partA2 }, data: { active: false } });
    await expect(applyJobKitToJob(ctx(companyA, userA), job.id, rollbackKit.id)).rejects.toThrow("NOT_FOUND");
    const detail = await getJobById(ctx(companyA, userA), job.id) as { partRequirements: Array<{ partId: string }> };
    expect(detail.partRequirements.some((row) => row.partId === partA2)).toBe(false);
    await db.part.update({ where: { id: partA2 }, data: { active: true } });
  });

  it("rejects missing permissions and read-only support mutations", async () => {
    const kit = await createJobKit(ctx(companyA, userA), { name: `Perm kit ${suffix}`, lines: [] });
    const noView = new Set(DEFAULT_TENANT_PERMISSIONS.COMPANY_ADMIN); noView.delete("JOB_KITS_VIEW");
    await expect(listJobKits(ctx(companyA, userA, noView), { q: "", status: "all" })).rejects.toBeInstanceOf(AuthorizationError);

    const noEdit = new Set(DEFAULT_TENANT_PERMISSIONS.COMPANY_ADMIN); noEdit.delete("JOBS_EDIT");
    const draft = await createDraftJob(ctx(companyA, userA), { customerId: customerA, type: "STANDARD_REPAIR", component: "Valve" });
    const job = await registerJob(ctx(companyA, userA), draft.id, { initialStatus: "WAITING_FOR_PARTS" });
    await expect(applyJobKitToJob(ctx(companyA, userA, noEdit), job.id, kit.id)).rejects.toBeInstanceOf(AuthorizationError);

    await expect(createJobKit(ctx(companyA, userA, DEFAULT_TENANT_PERMISSIONS.COMPANY_ADMIN, "READ_ONLY"), { name: `RO kit ${suffix}`, lines: [] })).rejects.toBeInstanceOf(AuthorizationError);
    await expect(applyJobKitToJob(ctx(companyA, userA, DEFAULT_TENANT_PERMISSIONS.COMPANY_ADMIN, "READ_ONLY"), job.id, kit.id)).rejects.toBeInstanceOf(AuthorizationError);
  });

  it("reads a created kit by tenant and blocks cross-tenant access", async () => {
    const kit = await createJobKit(ctx(companyA, userA), { name: `Read kit ${suffix}`, lines: [{ partId: partA1, quantityDefault: "1" }] });
    const same = await getJobKitById(ctx(companyA, userA), kit.id);
    expect(same.id).toBe(kit.id);
    await expect(getJobKitById(ctx(companyB, userB), kit.id)).rejects.toThrow("NOT_FOUND");
  });
});
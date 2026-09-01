import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ModuleKey, PrismaClient } from "@prisma/client";
import type { RequestContext } from "@/lib/auth/context-types";
import { DEFAULT_TENANT_PERMISSIONS } from "@/lib/auth/permissions";
import { AuthorizationError } from "@/lib/auth/guards";
import { createMaster } from "@/lib/master-data/service";
import { receiveStock } from "@/lib/inventory/service";
import { createDraftJob, registerJob, listJobs, getJobById, updateJob, changeJobStatus, closeJob, reopenJob, addJobNote, upsertJobFieldService, upsertJobWarranty, addJobPartRequirement, updateJobPartRequirement, reserveJobRequirementStock, issueJobAllocationStock, returnJobAllocationStock, releaseJobAllocationReservation } from "@/lib/jobs/service";

const url = process.env.DATABASE_URL_TEST;
if (!url) throw new Error("DATABASE_URL_TEST is required");
const db = new PrismaClient({ datasources: { db: { url } } });
const suffix = `p4a_${Date.now()}_${Math.random().toString(36).slice(2)}`;
const prefixA = `BRA${suffix.slice(-2).toUpperCase()}-`;
const prefixB = `BRB${suffix.slice(-2).toUpperCase()}-`;

let companyA = "";
let companyB = "";
let userA = "";
let userB = "";
let customerA = "";
let customerB = "";

function ctx(companyId: string, userId: string, permissions = DEFAULT_TENANT_PERMISSIONS.COMPANY_ADMIN, supportMode: "READ_ONLY" | null = null): RequestContext {
  return {
    userId,
    displayName: "P4A test",
    companyId,
    companyInternalCode: suffix,
    tenantRole: "COMPANY_ADMIN",
    tenantPermissions: new Set(permissions),
    platformPermissions: new Set(),
    supportAccessId: supportMode ? "support-1" : null,
    supportMode,
    moduleAccess: new Map(Object.values(ModuleKey).map((k) => [k, "FULL" as const])),
    correlationId: suffix,
  };
}

beforeAll(async () => {
  const [a, b] = await Promise.all([
    db.company.create({ data: { internalCode: `JA_${suffix}`, legalName: "Jobs A", settings: { create: {} } } }),
    db.company.create({ data: { internalCode: `JB_${suffix}`, legalName: "Jobs B", settings: { create: {} } } }),
  ]);
  companyA = a.id;
  companyB = b.id;

  const [ua, ub] = await Promise.all([
    db.userIdentity.create({ data: { email: `ja-${suffix}@test.local`, displayName: "User A", passwordHash: "x" } }),
    db.userIdentity.create({ data: { email: `jb-${suffix}@test.local`, displayName: "User B", passwordHash: "x" } }),
  ]);
  userA = ua.id;
  userB = ub.id;

  await db.companyMembership.createMany({ data: [
    { userId: userA, companyId: companyA, role: "COMPANY_ADMIN", status: "ACTIVE" },
    { userId: userB, companyId: companyB, role: "COMPANY_ADMIN", status: "ACTIVE" },
  ] });

  await db.documentNumberSequence.createMany({ data: [
    { companyId: companyA, type: "JOB", prefix: prefixA, padding: 4, nextValue: BigInt(1), includeFinancialYear: false, financialYearStartMonth: 3, active: true },
    { companyId: companyB, type: "JOB", prefix: prefixB, padding: 4, nextValue: BigInt(1), includeFinancialYear: false, financialYearStartMonth: 3, active: true },
  ] });

  customerA = ((await createMaster(ctx(companyA, userA), "customers", { name: "Customer A", currencyCode: "ZAR" })) as { id: string }).id;
  customerB = ((await createMaster(ctx(companyB, userB), "customers", { name: "Customer B", currencyCode: "ZAR" })) as { id: string }).id;
});

afterAll(async () => {
  await db.$executeRaw`
    TRUNCATE TABLE "JobPartAllocationMovement", "JobPartAllocation", "JobPartRequirement", "JobActivity", "JobNote", "JobFieldServiceReport", "JobWarranty", "JobComponent", "Job", "StockCountLine", "StockCount", "StockReservation", "StockMovement", "StockBalance" RESTART IDENTITY CASCADE
  `;
  for (const companyId of [companyA, companyB]) {
    await db.part.deleteMany({ where: { companyId } });
    await db.storageLocation.deleteMany({ where: { companyId } });
    await db.documentNumberSequence.deleteMany({ where: { companyId } });
    await db.customer.deleteMany({ where: { companyId } });
    await db.companySettings.deleteMany({ where: { companyId } });
    await db.auditEvent.deleteMany({ where: { companyId } });
  }
  await db.companyMembership.deleteMany({ where: { userId: { in: [userA, userB] } } });
  await db.company.deleteMany({ where: { id: { in: [companyA, companyB] } } });
  await db.userIdentity.deleteMany({ where: { id: { in: [userA, userB] } } });
  await db.$disconnect();
});

describe("Phase 4A jobs core", () => {
  it("creates a draft without allocating a BRE number", async () => {
    const job = await createDraftJob(ctx(companyA, userA), { customerId: customerA, type: "STANDARD_REPAIR", machineModel: "CAT 320", component: "Pump" });
    expect(job.status).toBe("DRAFT");
    expect(job.jobNumber).toBeNull();
    expect(job.draftNumber).toBeTruthy();
  });

  it("registers a draft and allocates an immutable BRE number", async () => {
    const job = await createDraftJob(ctx(companyA, userA), { customerId: customerA, type: "STANDARD_REPAIR" });
    const registered = await registerJob(ctx(companyA, userA), job.id, { initialStatus: "TO_BE_RECEIVED" });
    expect(registered.jobNumber).toBe(`${prefixA}0001`);
    expect(registered.status).toBe("TO_BE_RECEIVED");
    await expect(registerJob(ctx(companyA, userA), job.id, { initialStatus: "TO_BE_RECEIVED" })).rejects.toThrow();
  });

  it("prevents cross-tenant customer and job access", async () => {
    await expect(createDraftJob(ctx(companyA, userA), { customerId: customerB, type: "STANDARD_REPAIR" })).rejects.toThrow("NOT_FOUND");
    const job = await createDraftJob(ctx(companyA, userA), { customerId: customerA, type: "STANDARD_REPAIR" });
    await expect(getJobById(ctx(companyB, userB), job.id)).rejects.toThrow("NOT_FOUND");
    await expect(updateJob(ctx(companyB, userB), job.id, { machineModel: "X" })).rejects.toThrow("NOT_FOUND");
  });

  it("enforces jobs permissions and read-only support context", async () => {
    const perms = new Set(DEFAULT_TENANT_PERMISSIONS.COMPANY_ADMIN); perms.delete("JOBS_CREATE");
    await expect(createDraftJob(ctx(companyA, userA, perms), { customerId: customerA, type: "STANDARD_REPAIR" })).rejects.toThrow(AuthorizationError);
    await expect(createDraftJob(ctx(companyA, userA, DEFAULT_TENANT_PERMISSIONS.COMPANY_ADMIN, "READ_ONLY"), { customerId: customerA, type: "STANDARD_REPAIR" })).rejects.toThrow(AuthorizationError);
  });

  it("lists jobs with WIP/completed filters and sort", async () => {
    const draft = await createDraftJob(ctx(companyA, userA), { customerId: customerA, type: "STANDARD_REPAIR" });
    const reg = await registerJob(ctx(companyA, userA), draft.id, { initialStatus: "ASSEMBLY" });
    await closeJob(ctx(companyA, userA), reg.id, { outcome: "Done", closingNote: "Closed" });
    const wip = await listJobs(ctx(companyA, userA), { view: "wip" });
    expect(wip.items.every((j: { status: string }) => !["DRAFT", "COMPLETE", "CLOSED", "CANCELLED"].includes(j.status))).toBe(true);
    const completed = await listJobs(ctx(companyA, userA), { view: "completed" });
    expect(completed.items.some((j: { status: string }) => j.status === "CLOSED")).toBe(true);
  });

  it("changes status, closes and reopens with activity preserved", async () => {
    const draft = await createDraftJob(ctx(companyA, userA), { customerId: customerA, type: "WARRANTY" });
    const reg = await registerJob(ctx(companyA, userA), draft.id, { initialStatus: "TO_BE_COLLECTED" });
    const changed = await changeJobStatus(ctx(companyA, userA), reg.id, { status: "WAITING_FOR_PARTS" });
    expect(changed.status).toBe("WAITING_FOR_PARTS");
    const closed = await closeJob(ctx(companyA, userA), reg.id, { outcome: "Resolved", closingNote: "All done" });
    expect(closed.status).toBe("CLOSED");
    const reopened = await reopenJob(ctx(companyA, userA), reg.id, { status: "ASSEMBLY" });
    expect(reopened.status).toBe("ASSEMBLY");
    const activityCount = await db.jobActivity.count({ where: { companyId: companyA, jobId: reg.id } });
    expect(activityCount).toBeGreaterThanOrEqual(4);
  });

  it("keeps concurrent registration unique", async () => {
    const one = await createDraftJob(ctx(companyA, userA), { customerId: customerA, type: "STANDARD_REPAIR" });
    const two = await createDraftJob(ctx(companyA, userA), { customerId: customerA, type: "STANDARD_REPAIR" });
    const [a, b] = await Promise.all([
      registerJob(ctx(companyA, userA), one.id, { initialStatus: "TO_BE_RECEIVED" }),
      registerJob(ctx(companyA, userA), two.id, { initialStatus: "TO_BE_RECEIVED" }),
    ]);
    expect(new Set([a.jobNumber, b.jobNumber]).size).toBe(2);
  });

  it("supports notes, part requirements and detailed reads", async () => {
    const draft = await createDraftJob(ctx(companyA, userA), { customerId: customerA, type: "STANDARD_REPAIR", component: "Hydraulic pump", componentSerial: "HP-001" });
    const registered = await registerJob(ctx(companyA, userA), draft.id, { initialStatus: "WAITING_FOR_PARTS" });
    const part = await createMaster(ctx(companyA, userA), "parts", { partNumber: `P-${suffix}-01`, description: "Seal kit", unitOfMeasure: "EA" }) as { id: string };
    const requirement = await addJobPartRequirement(ctx(companyA, userA), registered.id, { partId: part.id, quantityRequired: 2, notes: "Urgent" });
    expect(String(requirement.quantityRequired)).toBe("2");
    await updateJobPartRequirement(ctx(companyA, userA), registered.id, requirement.id, { active: false });
    await addJobNote(ctx(companyA, userA), registered.id, { note: "Customer approved strip inspection." });
    const detail = await getJobById(ctx(companyA, userA), registered.id);
    expect(detail.notes.length).toBeGreaterThanOrEqual(1);
    expect(detail.partRequirements.some((x: { id: string; active: boolean }) => x.id === requirement.id && x.active === false)).toBe(true);
    expect(detail.activities.length).toBeGreaterThanOrEqual(4);
  });

  it("supports field-service and warranty application data only on matching job types", async () => {
    const fieldDraft = await createDraftJob(ctx(companyA, userA), { customerId: customerA, type: "FIELD_SERVICE" });
    const fieldJob = await registerJob(ctx(companyA, userA), fieldDraft.id, { initialStatus: "TO_BE_RECEIVED" });
    const fs = await upsertJobFieldService(ctx(companyA, userA), fieldJob.id, { site: "Mine plant", technician: "Tech A", vehicle: "Bakkie 1", hours: 4.5, report: "Inspected and tested." });
    expect(String(fs.hours)).toBe("4.5");

    const warrantyDraft = await createDraftJob(ctx(companyA, userA), { customerId: customerA, type: "WARRANTY" });
    const warrantyJob = await registerJob(ctx(companyA, userA), warrantyDraft.id, { initialStatus: "TO_BE_RECEIVED" });
    const warranty = await upsertJobWarranty(ctx(companyA, userA), warrantyJob.id, { status: "GRANTED", notes: "Approved by OEM", historicalSourceStatus: "Legacy approved" });
    expect(warranty.status).toBe("GRANTED");

    await expect(upsertJobWarranty(ctx(companyA, userA), fieldJob.id, { status: "PENDING" })).rejects.toThrow();
    await expect(upsertJobFieldService(ctx(companyA, userA), warrantyJob.id, { site: "x" })).rejects.toThrow();
  });

  it("supports reserve, issue, split return idempotency, release and outstanding summaries", async () => {
    const draft = await createDraftJob(ctx(companyA, userA), { customerId: customerA, type: "STANDARD_REPAIR", component: "Motor" });
    const job = await registerJob(ctx(companyA, userA), draft.id, { initialStatus: "WAITING_FOR_PARTS" });
    const part = await createMaster(ctx(companyA, userA), "parts", { partNumber: `JP-${suffix}-01`, description: "Jobs Part", unitOfMeasure: "EA" }) as { id: string };
    const loc = await createMaster(ctx(companyA, userA), "storage-locations", { code: `JPLOC-${suffix}`, name: "Jobs Parts Bin", type: "BIN" }) as { id: string };
    await receiveStock(ctx(companyA, userA), { partId: part.id, locationId: loc.id, quantity: "10" });

    const requirement = await addJobPartRequirement(ctx(companyA, userA), job.id, { partId: part.id, quantityRequired: "6", notes: "Needed for rebuild" });
    const reserve = await reserveJobRequirementStock(ctx(companyA, userA), job.id, requirement.id, { locationId: loc.id, quantity: "6", idempotencyKey: `job-rsv-${suffix}` });
    const issueA = await issueJobAllocationStock(ctx(companyA, userA), job.id, reserve.allocationId, { quantity: "2", idempotencyKey: `job-iss-a-${suffix}` });
    const issueB = await issueJobAllocationStock(ctx(companyA, userA), job.id, reserve.allocationId, { quantity: "3", idempotencyKey: `job-iss-b-${suffix}` });
    expect(issueA.movementId).toBeTruthy();
    expect(issueB.movementId).toBeTruthy();

    const returnKey = `job-ret-${suffix}`;
    const returned = await returnJobAllocationStock(ctx(companyA, userA), job.id, reserve.allocationId, {
      quantity: "3",
      disposition: "REQUIREMENT_REMAINS",
      notes: "Returned for replacement",
      idempotencyKey: returnKey,
    });
    expect(returned.movementIds).toHaveLength(2);

    const replayed = await returnJobAllocationStock(ctx(companyA, userA), job.id, reserve.allocationId, {
      quantity: "3",
      disposition: "REQUIREMENT_REMAINS",
      notes: "Returned for replacement",
      idempotencyKey: returnKey,
    });
    expect(replayed.replayed).toBe(true);
    expect(replayed.movementIds).toEqual(returned.movementIds);

    const release = await releaseJobAllocationReservation(ctx(companyA, userA), job.id, reserve.allocationId, { reason: "Remaining no longer needed" });
    expect(release.movementId).toBeTruthy();

    const detail = await getJobById(ctx(companyA, userA), job.id) as { partRequirements: Array<{ id: string; summary: { grossIssued: unknown; grossReturned: unknown; effectiveFulfilled: unknown; outstanding: unknown }; allocations: Array<{ id: string; summary: { quantityIssued: unknown; quantityReturned: unknown } }> }> };
    const hydrated = detail.partRequirements.find((x) => x.id === requirement.id)!;
    expect(String(hydrated.summary.grossIssued)).toBe("5");
    expect(String(hydrated.summary.grossReturned)).toBe("3");
    expect(String(hydrated.summary.effectiveFulfilled)).toBe("2");
    expect(String(hydrated.summary.outstanding)).toBe("4");
    expect(hydrated.allocations).toHaveLength(1);
    expect(String(hydrated.allocations[0]!.summary.quantityIssued)).toBe("5");
    expect(String(hydrated.allocations[0]!.summary.quantityReturned)).toBe("3");

    const returnLinks = await db.jobPartAllocationMovement.findMany({
      where: { companyId: companyA, allocationId: reserve.allocationId, kind: "RETURN" },
      include: { stockMovement: true },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    expect(returnLinks).toHaveLength(2);
    expect(returnLinks.map((row) => String(row.quantity))).toEqual(["2", "1"]);
    expect(new Set(returnLinks.map((row) => row.stockMovement.reversalOfId)).size).toBe(2);
  });

  it("prevents concurrent allocation-level returns from over-returning the same issued quantity", async () => {
    const draft = await createDraftJob(ctx(companyA, userA), { customerId: customerA, type: "STANDARD_REPAIR", component: "Pump" });
    const job = await registerJob(ctx(companyA, userA), draft.id, { initialStatus: "WAITING_FOR_PARTS" });
    const part = await createMaster(ctx(companyA, userA), "parts", { partNumber: `JP-${suffix}-CC`, description: "Concurrent Return Part", unitOfMeasure: "EA" }) as { id: string };
    const loc = await createMaster(ctx(companyA, userA), "storage-locations", { code: `JPCR-${suffix}`, name: "Concurrent Return Bin", type: "BIN" }) as { id: string };
    await receiveStock(ctx(companyA, userA), { partId: part.id, locationId: loc.id, quantity: "6" });
    const requirement = await addJobPartRequirement(ctx(companyA, userA), job.id, { partId: part.id, quantityRequired: "6" });
    const reserve = await reserveJobRequirementStock(ctx(companyA, userA), job.id, requirement.id, { locationId: loc.id, quantity: "6", idempotencyKey: `job-rsv-cc-${suffix}` });
    await issueJobAllocationStock(ctx(companyA, userA), job.id, reserve.allocationId, { quantity: "6", idempotencyKey: `job-iss-cc-${suffix}` });

    const [one, two] = await Promise.allSettled([
      returnJobAllocationStock(ctx(companyA, userA), job.id, reserve.allocationId, { quantity: "4", disposition: "UNUSED_SURPLUS", idempotencyKey: `job-ret-cc-a-${suffix}` }),
      returnJobAllocationStock(ctx(companyA, userA), job.id, reserve.allocationId, { quantity: "4", disposition: "UNUSED_SURPLUS", idempotencyKey: `job-ret-cc-b-${suffix}` }),
    ]);

    expect([one.status, two.status].filter((x) => x === "fulfilled")).toHaveLength(1);
    expect([one.status, two.status].filter((x) => x === "rejected")).toHaveLength(1);

    const returnLinks = await db.jobPartAllocationMovement.findMany({
      where: { companyId: companyA, allocationId: reserve.allocationId, kind: "RETURN" },
    });
    const totalReturned = returnLinks.reduce((sum, row) => sum + Number(row.quantity), 0);
    expect(totalReturned).toBe(4);
  });
});
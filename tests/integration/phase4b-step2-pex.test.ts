import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ModuleKey, PrismaClient } from "@prisma/client";
import type { RequestContext } from "@/lib/auth/context-types";
import { AuthorizationError } from "@/lib/auth/guards";
import { DEFAULT_TENANT_PERMISSIONS } from "@/lib/auth/permissions";
import { createDraftJob, getJobById, registerJob } from "@/lib/jobs/service";
import { createMaster } from "@/lib/master-data/service";
import {
  cancelPexSupplyLink,
  closePexReturnWithoutCore,
  getPexSupplyLinkBySupplyJobId,
  linkPexSupplyJob,
  listPexStockUnits,
  listPexSupplyLinks,
  quarantinePexStockUnit,
  receivePexReturn,
  relinkPexSupplyChain,
  releasePexStockUnit,
  scrapPexStockUnit,
  transferCompletedRepairToPexStock,
} from "@/lib/pex/service";

const url = process.env.DATABASE_URL_TEST;
if (!url) throw new Error("DATABASE_URL_TEST is required");
const db = new PrismaClient({ datasources: { db: { url } } });
const suffix = `p4b2_${Date.now()}_${Math.random().toString(36).slice(2)}`;

let companyA = "";
let companyB = "";
let userA = "";
let userB = "";
let customerA = "";
let customerB = "";
let pexLocationA = "";

function ctx(companyId: string, userId: string, permissions = DEFAULT_TENANT_PERMISSIONS.COMPANY_ADMIN, supportMode: "READ_ONLY" | null = null, moduleOverrides?: Partial<Record<ModuleKey, "FULL" | "READ_ONLY" | "DENIED">>): RequestContext {
  return {
    userId,
    displayName: "P4B2 test",
    companyId,
    companyInternalCode: suffix,
    tenantRole: "COMPANY_ADMIN",
    tenantPermissions: new Set(permissions),
    platformPermissions: new Set(),
    supportAccessId: supportMode ? "support-1" : null,
    supportMode,
    moduleAccess: new Map(Object.values(ModuleKey).map((k) => [k, moduleOverrides?.[k] ?? "FULL"])),
    correlationId: suffix,
  };
}

async function completedRepair(companyId: string, userId: string, customerId: string, component = "Pump") {
  const draft = await createDraftJob(ctx(companyId, userId), { customerId, type: "STANDARD_REPAIR", component, componentSerial: `${component}-${Math.random().toString(36).slice(2, 8)}` });
  return registerJob(ctx(companyId, userId), draft.id, { initialStatus: "COMPLETE" });
}

beforeAll(async () => {
  const [a, b] = await Promise.all([
    db.company.create({ data: { internalCode: `PXA_${suffix}`, legalName: "PEX A", settings: { create: {} } } }),
    db.company.create({ data: { internalCode: `PXB_${suffix}`, legalName: "PEX B", settings: { create: {} } } }),
  ]);
  companyA = a.id;
  companyB = b.id;
  const [ua, ub] = await Promise.all([
    db.userIdentity.create({ data: { email: `pxa-${suffix}@test.local`, displayName: "User A", passwordHash: "x" } }),
    db.userIdentity.create({ data: { email: `pxb-${suffix}@test.local`, displayName: "User B", passwordHash: "x" } }),
  ]);
  userA = ua.id;
  userB = ub.id;
  await db.companyMembership.createMany({ data: [
    { userId: userA, companyId: companyA, role: "COMPANY_ADMIN", status: "ACTIVE" },
    { userId: userB, companyId: companyB, role: "COMPANY_ADMIN", status: "ACTIVE" },
  ] });
  await db.documentNumberSequence.createMany({ data: [
    { companyId: companyA, type: "JOB", prefix: `PXA-${suffix.slice(-3).toUpperCase()}-`, padding: 4, nextValue: BigInt(1), includeFinancialYear: false, financialYearStartMonth: 3, active: true },
    { companyId: companyA, type: "PEX_JOB", prefix: `PEX-${suffix.slice(-3).toUpperCase()}-`, padding: 4, nextValue: BigInt(1), includeFinancialYear: false, financialYearStartMonth: 3, active: true },
    { companyId: companyB, type: "JOB", prefix: `PXB-${suffix.slice(-3).toUpperCase()}-`, padding: 4, nextValue: BigInt(1), includeFinancialYear: false, financialYearStartMonth: 3, active: true },
    { companyId: companyB, type: "PEX_JOB", prefix: `QXB-${suffix.slice(-3).toUpperCase()}-`, padding: 4, nextValue: BigInt(1), includeFinancialYear: false, financialYearStartMonth: 3, active: true },
  ] });
  customerA = ((await createMaster(ctx(companyA, userA), "customers", { name: "PEX Customer A", currencyCode: "ZAR" })) as { id: string }).id;
  customerB = ((await createMaster(ctx(companyB, userB), "customers", { name: "PEX Customer B", currencyCode: "ZAR" })) as { id: string }).id;
  pexLocationA = ((await createMaster(ctx(companyA, userA), "storage-locations", { code: `PEX-${suffix}`, name: "PEX Holding", type: "PEX_HOLDING" })) as { id: string }).id;
});

afterAll(async () => {
  await db.$executeRawUnsafe(`
    TRUNCATE TABLE "PexSupplyLink", "PexStockUnit", "JobPartAllocationMovement", "JobPartAllocation", "JobPartRequirement", "JobActivity", "JobNote", "JobFieldServiceReport", "JobWarranty", "JobComponent", "Job", "AuditEvent", "DocumentNumberSequence", "StorageLocation", "Customer", "CompanyMembership", "UserSession", "UserIdentity", "CompanySettings", "Company" RESTART IDENTITY CASCADE
  `);
  await db.$disconnect();
});

describe("Phase 4B Step 2 PEX", () => {
  it("transfers a completed Standard Repair component into PEX Stock and blocks wrong source conditions", async () => {
    const job = await completedRepair(companyA, userA, customerA, "Main Pump");
    const detail = await getJobById(ctx(companyA, userA), job.id) as { components: Array<{ id: string }> };
    const transfer = await transferCompletedRepairToPexStock(ctx(companyA, userA), job.id, { jobComponentId: detail.components[0]!.id, storageLocationId: pexLocationA });
    expect(transfer.status).toBe("AVAILABLE");

    const incompleteDraft = await createDraftJob(ctx(companyA, userA), { customerId: customerA, type: "STANDARD_REPAIR", component: "Incomplete" });
    const incompleteDetail = await getJobById(ctx(companyA, userA), incompleteDraft.id) as { components: Array<{ id: string }> };
    await expect(transferCompletedRepairToPexStock(ctx(companyA, userA), incompleteDraft.id, { jobComponentId: incompleteDetail.components[0]!.id })).rejects.toThrow("source repair must be complete");

    const wrongTypeDraft = await createDraftJob(ctx(companyA, userA), { customerId: customerA, type: "PEX_SUPPLY", component: "Wrong Type" });
    const wrongTypeJob = await registerJob(ctx(companyA, userA), wrongTypeDraft.id, { initialStatus: "COMPLETE" });
    const wrongTypeDetail = await getJobById(ctx(companyA, userA), wrongTypeJob.id) as { components: Array<{ id: string }> };
    await expect(transferCompletedRepairToPexStock(ctx(companyA, userA), wrongTypeJob.id, { jobComponentId: wrongTypeDetail.components[0]!.id })).rejects.toThrow("Only completed Standard Repair jobs");
  });

  it("prevents duplicate transfer of the same source component while allowing multiple components from one repair job", async () => {
    const draft = await createDraftJob(ctx(companyA, userA), { customerId: customerA, type: "STANDARD_REPAIR", component: "Primary housing" });
    await db.jobComponent.create({ data: { companyId: companyA, jobId: draft.id, component: "Secondary housing", componentSerial: `S-${suffix}` } });
    const job = await registerJob(ctx(companyA, userA), draft.id, { initialStatus: "COMPLETE" });
    const detail = await getJobById(ctx(companyA, userA), job.id) as { components: Array<{ id: string }> };
    await transferCompletedRepairToPexStock(ctx(companyA, userA), job.id, { jobComponentId: detail.components[0]!.id });
    await expect(transferCompletedRepairToPexStock(ctx(companyA, userA), job.id, { jobComponentId: detail.components[0]!.id })).rejects.toThrow("already been transferred");
    const second = await transferCompletedRepairToPexStock(ctx(companyA, userA), job.id, { jobComponentId: detail.components[1]!.id });
    expect(second.id).toBeTruthy();
  });

  it("enforces tenant isolation for job, component and storage location", async () => {
    const jobA = await completedRepair(companyA, userA, customerA, "Tenant A Unit");
    const detailA = await getJobById(ctx(companyA, userA), jobA.id) as { components: Array<{ id: string }> };
    const jobB = await completedRepair(companyB, userB, customerB, "Tenant B Unit");
    const detailB = await getJobById(ctx(companyB, userB), jobB.id) as { components: Array<{ id: string }> };
    await expect(transferCompletedRepairToPexStock(ctx(companyA, userA), jobB.id, { jobComponentId: detailB.components[0]!.id })).rejects.toThrow("NOT_FOUND");
    await expect(transferCompletedRepairToPexStock(ctx(companyA, userA), jobA.id, { jobComponentId: detailB.components[0]!.id })).rejects.toThrow("NOT_FOUND");
    const otherLocation = ((await createMaster(ctx(companyB, userB), "storage-locations", { code: `PXB-${suffix}`, name: "PEX B", type: "PEX_HOLDING" })) as { id: string }).id;
    await expect(transferCompletedRepairToPexStock(ctx(companyA, userA), jobA.id, { jobComponentId: detailA.components[0]!.id, storageLocationId: otherLocation })).rejects.toThrow("NOT_FOUND");
  });

  it("supports supply, return draft creation, return numbering and concurrency protection", async () => {
    const repair = await completedRepair(companyA, userA, customerA, "Supply Pump");
    const repairDetail = await getJobById(ctx(companyA, userA), repair.id) as { components: Array<{ id: string }> };
    const unit = await transferCompletedRepairToPexStock(ctx(companyA, userA), repair.id, { jobComponentId: repairDetail.components[0]!.id });

    const supplyDraft = await createDraftJob(ctx(companyA, userA), { customerId: customerA, type: "PEX_SUPPLY", component: "Supply Customer Pump" });
    const supply = await registerJob(ctx(companyA, userA), supplyDraft.id, { initialStatus: "TO_BE_RECEIVED" });
    expect(String(supply.jobNumber)).toContain("PEX-");

    const link = await linkPexSupplyJob(ctx(companyA, userA), supply.id, { pexStockUnitId: unit.id });
    expect(link.returnJob.jobNumber).toBeNull();
    expect(link.returnJob.status).toBe("DRAFT");
    expect(link.pexStockUnitId).toBe(unit.id);

    const linked = await getPexSupplyLinkBySupplyJobId(ctx(companyA, userA), supply.id);
    expect(linked.expectedCoreDescription).toBe(unit.component);
    expect(linked.returnStatus).toBe("EXPECTED");

    const returnDraft = await db.job.findFirstOrThrow({ where: { id: link.returnJobId, companyId: companyA } });
    expect(returnDraft.type).toBe("PEX_RETURN");
    expect(returnDraft.status).toBe("DRAFT");
    expect(returnDraft.jobNumber).toBeNull();

    const seqBefore = await db.documentNumberSequence.findFirstOrThrow({ where: { companyId: companyA, type: "PEX_JOB" } });
    expect(Number(seqBefore.nextValue)).toBe(3);

    const returnRegistered = await registerJob(ctx(companyA, userA), link.returnJobId, { initialStatus: "TO_BE_RECEIVED" });
    expect(String(returnRegistered.jobNumber)).toContain("PEX-");
    const seqAfter = await db.documentNumberSequence.findFirstOrThrow({ where: { companyId: companyA, type: "PEX_JOB" } });
    expect(Number(seqAfter.nextValue)).toBe(4);

    const returnActivities = await db.jobActivity.findMany({ where: { companyId: companyA, jobId: link.returnJobId } });
    expect(returnActivities.some((row) => row.type === "JOB_CREATED")).toBe(true);
    expect(returnActivities.some((row) => row.type === "PEX_RETURN_REGISTERED")).toBe(true);

    const repair2 = await completedRepair(companyA, userA, customerA, "Race Pump");
    const repair2Detail = await getJobById(ctx(companyA, userA), repair2.id) as { components: Array<{ id: string }> };
    const raceUnit = await transferCompletedRepairToPexStock(ctx(companyA, userA), repair2.id, { jobComponentId: repair2Detail.components[0]!.id });
    const s1 = await registerJob(ctx(companyA, userA), (await createDraftJob(ctx(companyA, userA), { customerId: customerA, type: "PEX_SUPPLY", component: "Race 1" })).id, { initialStatus: "TO_BE_RECEIVED" });
    const s2 = await registerJob(ctx(companyA, userA), (await createDraftJob(ctx(companyA, userA), { customerId: customerA, type: "PEX_SUPPLY", component: "Race 2" })).id, { initialStatus: "TO_BE_RECEIVED" });
    const [a, b] = await Promise.allSettled([
      linkPexSupplyJob(ctx(companyA, userA), s1.id, { pexStockUnitId: raceUnit.id }),
      linkPexSupplyJob(ctx(companyA, userA), s2.id, { pexStockUnitId: raceUnit.id }),
    ]);
    expect([a.status, b.status].filter((x) => x === "fulfilled")).toHaveLength(1);
    expect([a.status, b.status].filter((x) => x === "rejected")).toHaveLength(1);
  });

  it("handles quarantine, release, scrap, receive return mismatch rules, close without return, cancellation and relinking", async () => {
    const repair = await completedRepair(companyA, userA, customerA, "Workflow Pump");
    const detail = await getJobById(ctx(companyA, userA), repair.id) as { components: Array<{ id: string }> };
    const unit = await transferCompletedRepairToPexStock(ctx(companyA, userA), repair.id, { jobComponentId: detail.components[0]!.id });
    await quarantinePexStockUnit(ctx(companyA, userA), unit.id, { reason: "Inspection" });
    await expect(linkPexSupplyJob(ctx(companyA, userA), (await registerJob(ctx(companyA, userA), (await createDraftJob(ctx(companyA, userA), { customerId: customerA, type: "PEX_SUPPLY", component: "Blocked" })).id, { initialStatus: "TO_BE_RECEIVED" })).id, { pexStockUnitId: unit.id })).rejects.toThrow("Only available PEX stock units");
    await releasePexStockUnit(ctx(companyA, userA), unit.id, { reason: "Passed" });

    const supply = await registerJob(ctx(companyA, userA), (await createDraftJob(ctx(companyA, userA), { customerId: customerA, type: "PEX_SUPPLY", component: "Workflow Supply" })).id, { initialStatus: "TO_BE_RECEIVED" });
    await linkPexSupplyJob(ctx(companyA, userA), supply.id, { pexStockUnitId: unit.id });
    await expect(receivePexReturn(ctx(companyA, userA), supply.id, { returnedCoreDescription: "Different core" })).rejects.toThrow("mismatch reason is required");
    const received = await receivePexReturn(ctx(companyA, userA), supply.id, { returnedCoreDescription: "Different core", returnMismatchReason: "Serial mismatch" });
    expect(received.returnStatus).toBe("RECEIVED");
    expect(received.returnedCoreDescription).toBe("Different core");
    const suppliedUnitAfterReceive = await db.pexStockUnit.findUniqueOrThrow({ where: { id: unit.id } });
    expect(suppliedUnitAfterReceive.status).toBe("SUPPLIED");
    expect(suppliedUnitAfterReceive.currentSupplyJobId).toBeNull();
    expect(suppliedUnitAfterReceive.currentReturnJobId).toBeNull();
    const receivedTracking = await listPexSupplyLinks(ctx(companyA, userA), { status: "RECEIVED", q: "Different core" }) as { items: Array<{ returnStatus: string }> };
    expect(receivedTracking.items.some((row) => row.returnStatus === "RECEIVED")).toBe(true);

    const newRepair = await completedRepair(companyA, userA, customerA, "No Return Pump");
    const newDetail = await getJobById(ctx(companyA, userA), newRepair.id) as { components: Array<{ id: string }> };
    const noReturnUnit = await transferCompletedRepairToPexStock(ctx(companyA, userA), newRepair.id, { jobComponentId: newDetail.components[0]!.id });
    const noReturnSupply = await registerJob(ctx(companyA, userA), (await createDraftJob(ctx(companyA, userA), { customerId: customerA, type: "PEX_SUPPLY", component: "No Return" })).id, { initialStatus: "TO_BE_RECEIVED" });
    await linkPexSupplyJob(ctx(companyA, userA), noReturnSupply.id, { pexStockUnitId: noReturnUnit.id });
    await expect(closePexReturnWithoutCore(ctx(companyA, userA), noReturnSupply.id, { closedWithoutReturnReason: "" })).rejects.toThrow();
    const closed = await closePexReturnWithoutCore(ctx(companyA, userA), noReturnSupply.id, { closedWithoutReturnReason: "Customer retained core" });
    expect(closed.returnStatus).toBe("CLOSED_WITHOUT_RETURN");
    const closedTracking = await listPexSupplyLinks(ctx(companyA, userA), { status: "CLOSED_WITHOUT_RETURN", q: "No Return" }) as { items: Array<{ returnStatus: string }> };
    expect(closedTracking.items.some((row) => row.returnStatus === "CLOSED_WITHOUT_RETURN")).toBe(true);

    const cancelRepair = await completedRepair(companyA, userA, customerA, "Cancel Pump");
    const cancelDetail = await getJobById(ctx(companyA, userA), cancelRepair.id) as { components: Array<{ id: string }> };
    const cancelUnit = await transferCompletedRepairToPexStock(ctx(companyA, userA), cancelRepair.id, { jobComponentId: cancelDetail.components[0]!.id });
    const cancelSupply = await registerJob(ctx(companyA, userA), (await createDraftJob(ctx(companyA, userA), { customerId: customerA, type: "PEX_SUPPLY", component: "Cancel Supply" })).id, { initialStatus: "TO_BE_RECEIVED" });
    await linkPexSupplyJob(ctx(companyA, userA), cancelSupply.id, { pexStockUnitId: cancelUnit.id });
    await cancelPexSupplyLink(ctx(companyA, userA), cancelSupply.id, { reason: "Customer cancelled" });
    const refreshed = await listPexStockUnits(ctx(companyA, userA), { status: "AVAILABLE", q: "Cancel Pump" }) as { items: Array<{ id: string; status: string }> };
    expect(refreshed.items.some((row) => row.id === cancelUnit.id && row.status === "AVAILABLE")).toBe(true);
    const cancelActivities = await db.jobActivity.findMany({ where: { companyId: companyA, jobId: cancelSupply.id } });
    expect(cancelActivities.some((row) => row.type === "PEX_SUPPLY_CANCELLED")).toBe(true);

    const relinkRepairA = await completedRepair(companyA, userA, customerA, "Relink A" );
    const relinkRepairB = await completedRepair(companyA, userA, customerA, "Relink B" );
    const relinkDetailA = await getJobById(ctx(companyA, userA), relinkRepairA.id) as { components: Array<{ id: string }> };
    const relinkDetailB = await getJobById(ctx(companyA, userA), relinkRepairB.id) as { components: Array<{ id: string }> };
    const relinkUnitA = await transferCompletedRepairToPexStock(ctx(companyA, userA), relinkRepairA.id, { jobComponentId: relinkDetailA.components[0]!.id });
    const relinkUnitB = await transferCompletedRepairToPexStock(ctx(companyA, userA), relinkRepairB.id, { jobComponentId: relinkDetailB.components[0]!.id });
    const relinkSupply = await registerJob(ctx(companyA, userA), (await createDraftJob(ctx(companyA, userA), { customerId: customerA, type: "PEX_SUPPLY", component: "Relink Supply" })).id, { initialStatus: "TO_BE_RECEIVED" });
    await linkPexSupplyJob(ctx(companyA, userA), relinkSupply.id, { pexStockUnitId: relinkUnitA.id });
    await expect(relinkPexSupplyChain(ctx(companyA, userA), relinkSupply.id, { pexStockUnitId: relinkUnitB.id })).rejects.toThrow();
    const fixed = await relinkPexSupplyChain(ctx(companyA, userA), relinkSupply.id, { pexStockUnitId: relinkUnitB.id, reason: "Original serial picked incorrectly" });
    expect(fixed.pexStockUnitId).toBe(relinkUnitB.id);
    const relinkActivities = await db.jobActivity.findMany({ where: { companyId: companyA, jobId: relinkSupply.id } });
    expect(relinkActivities.some((row) => row.type === "PEX_RETURN_RELINKED")).toBe(true);

    const scrapRepair = await completedRepair(companyA, userA, customerA, "Scrap Pump");
    const scrapDetail = await getJobById(ctx(companyA, userA), scrapRepair.id) as { components: Array<{ id: string }> };
    const scrapUnit = await transferCompletedRepairToPexStock(ctx(companyA, userA), scrapRepair.id, { jobComponentId: scrapDetail.components[0]!.id });
    await scrapPexStockUnit(ctx(companyA, userA), scrapUnit.id, { reason: "Unserviceable" });
    await expect(linkPexSupplyJob(ctx(companyA, userA), (await registerJob(ctx(companyA, userA), (await createDraftJob(ctx(companyA, userA), { customerId: customerA, type: "PEX_SUPPLY", component: "Scrap blocked" })).id, { initialStatus: "TO_BE_RECEIVED" })).id, { pexStockUnitId: scrapUnit.id })).rejects.toThrow("Only available PEX stock units");
  });

  it("enforces permissions, module entitlements and read-only support mutation blocking", async () => {
    const repair = await completedRepair(companyA, userA, customerA, "Secured Pump");
    const detail = await getJobById(ctx(companyA, userA), repair.id) as { components: Array<{ id: string }> };
    const noTransfer = new Set(DEFAULT_TENANT_PERMISSIONS.COMPANY_ADMIN); noTransfer.delete("PEX_STOCK_TRANSFER_IN");
    await expect(transferCompletedRepairToPexStock(ctx(companyA, userA, noTransfer), repair.id, { jobComponentId: detail.components[0]!.id })).rejects.toBeInstanceOf(AuthorizationError);
    await expect(transferCompletedRepairToPexStock(ctx(companyA, userA, DEFAULT_TENANT_PERMISSIONS.COMPANY_ADMIN, "READ_ONLY"), repair.id, { jobComponentId: detail.components[0]!.id })).rejects.toBeInstanceOf(AuthorizationError);
    await expect(listPexStockUnits(ctx(companyA, userA, DEFAULT_TENANT_PERMISSIONS.COMPANY_ADMIN, null, { PEX_STOCK: "DENIED" }), { status: "ALL" })).rejects.toBeInstanceOf(AuthorizationError);
    await expect(listPexSupplyLinks(ctx(companyA, userA, DEFAULT_TENANT_PERMISSIONS.COMPANY_ADMIN, null, { PEX_TRACKING: "DENIED" }), { status: "ALL" })).rejects.toBeInstanceOf(AuthorizationError);
  });

  it("reports tracking states accurately across expected, received and closed chains", async () => {
    const expectedRepair = await completedRepair(companyA, userA, customerA, "Expected Pump");
    const expectedDetail = await getJobById(ctx(companyA, userA), expectedRepair.id) as { components: Array<{ id: string }> };
    const expectedUnit = await transferCompletedRepairToPexStock(ctx(companyA, userA), expectedRepair.id, { jobComponentId: expectedDetail.components[0]!.id });
    const expectedSupply = await registerJob(ctx(companyA, userA), (await createDraftJob(ctx(companyA, userA), { customerId: customerA, type: "PEX_SUPPLY", component: "Expected Supply" })).id, { initialStatus: "TO_BE_RECEIVED" });
    await linkPexSupplyJob(ctx(companyA, userA), expectedSupply.id, { pexStockUnitId: expectedUnit.id });

    const receivedRepair = await completedRepair(companyA, userA, customerA, "Received Pump 2");
    const receivedDetail = await getJobById(ctx(companyA, userA), receivedRepair.id) as { components: Array<{ id: string }> };
    const receivedUnit = await transferCompletedRepairToPexStock(ctx(companyA, userA), receivedRepair.id, { jobComponentId: receivedDetail.components[0]!.id });
    const receivedSupply = await registerJob(ctx(companyA, userA), (await createDraftJob(ctx(companyA, userA), { customerId: customerA, type: "PEX_SUPPLY", component: "Received Supply 2" })).id, { initialStatus: "TO_BE_RECEIVED" });
    await linkPexSupplyJob(ctx(companyA, userA), receivedSupply.id, { pexStockUnitId: receivedUnit.id });
    await receivePexReturn(ctx(companyA, userA), receivedSupply.id, { returnedCoreDescription: "Received core", returnedCorePartNumber: "RC-1", returnedCoreSerial: "RCS-1", returnMismatchReason: "Alternate returned core recorded" });

    const closedRepair = await completedRepair(companyA, userA, customerA, "Closed Pump 2");
    const closedDetail = await getJobById(ctx(companyA, userA), closedRepair.id) as { components: Array<{ id: string }> };
    const closedUnit = await transferCompletedRepairToPexStock(ctx(companyA, userA), closedRepair.id, { jobComponentId: closedDetail.components[0]!.id });
    const closedSupply = await registerJob(ctx(companyA, userA), (await createDraftJob(ctx(companyA, userA), { customerId: customerA, type: "PEX_SUPPLY", component: "Closed Supply 2" })).id, { initialStatus: "TO_BE_RECEIVED" });
    await linkPexSupplyJob(ctx(companyA, userA), closedSupply.id, { pexStockUnitId: closedUnit.id });
    await closePexReturnWithoutCore(ctx(companyA, userA), closedSupply.id, { closedWithoutReturnReason: "No recoverable core" });

    const expectedRows = await listPexSupplyLinks(ctx(companyA, userA), { status: "EXPECTED", q: "Expected Pump" }) as { items: Array<{ returnStatus: string }> };
    const outstandingRows = await listPexSupplyLinks(ctx(companyA, userA), { status: "OUTSTANDING", q: "Expected Pump" }) as { items: Array<{ returnStatus: string }> };
    const receivedRows = await listPexSupplyLinks(ctx(companyA, userA), { status: "RECEIVED", q: "Received core" }) as { items: Array<{ returnStatus: string }> };
    const closedRows = await listPexSupplyLinks(ctx(companyA, userA), { status: "CLOSED_WITHOUT_RETURN", q: "" }) as { items: Array<{ returnStatus: string }> };

    expect(expectedRows.items.length).toBeGreaterThanOrEqual(1);
    expect(outstandingRows.items.length).toBeGreaterThanOrEqual(1);
    expect(receivedRows.items.length).toBeGreaterThanOrEqual(1);
    expect(closedRows.items.length).toBeGreaterThanOrEqual(1);
    expect(expectedRows.items.every((row) => row.returnStatus === "EXPECTED")).toBe(true);
    expect(outstandingRows.items.every((row) => row.returnStatus === "EXPECTED")).toBe(true);
    expect(receivedRows.items.every((row) => row.returnStatus === "RECEIVED")).toBe(true);
    expect(closedRows.items.every((row) => row.returnStatus === "CLOSED_WITHOUT_RETURN")).toBe(true);
  });
});
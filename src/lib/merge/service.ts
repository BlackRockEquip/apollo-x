import type { RequestContext } from "@/lib/auth/context-types";
import { requireModule, requireTenantPermission } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";
import { recordAudit } from "@/lib/audit/service";
import { mergeInput } from "@/lib/merge/validation";

// Merge Customer / Merge Supplier — new 2026-09-14, at the user's request
// ("Create merge client/supplier buttons on respective page"). The user's
// explicit choice of behavior (asked directly, not assumed): reassign
// EVERY related record — jobs, contacts, addresses, brands, outwork, RFQs,
// PEX history, whatever else points at the losing record — onto the
// surviving one, then deactivate (never delete) the loser, so historical
// references (audit trail, old job snapshots) still resolve. The survivor
// is picked by the user at merge time, not inferred.
//
// Each merge runs as one transaction. Places with a real DB uniqueness
// constraint that a straight `updateMany` could collide with (e.g. two
// suppliers both already linked to the same manufacturer brand, or both
// already having an RFQ request on the same job) are resolved by keeping
// the survivor's existing row and dropping the loser's duplicate, rather
// than letting the transaction fail outright.

function notFound(): never {
  throw new Error("NOT_FOUND");
}

function mergedNotes(existing: string | null, survivorName: string) {
  const stamp = `[Merged into ${survivorName} on ${new Date().toLocaleDateString("en-ZA")}]`;
  return existing ? `${stamp}\n${existing}` : stamp;
}

export async function mergeSuppliers(ctx: RequestContext, raw: unknown) {
  requireModule(ctx, "SUPPLIERS", "WRITE");
  requireTenantPermission(ctx, "SUPPLIERS_EDIT");
  const companyId = ctx.companyId!;
  const input = mergeInput.parse(raw);
  const [surviving, losing] = await Promise.all([
    prisma.supplier.findFirst({ where: { id: input.survivingId, companyId } }),
    prisma.supplier.findFirst({ where: { id: input.losingId, companyId } }),
  ]);
  if (!surviving || !losing) notFound();

  const summary = await prisma.$transaction(async (tx) => {
    await tx.supplierContact.updateMany({ where: { companyId, supplierId: losing.id }, data: { supplierId: surviving.id } });
    await tx.supplierAddress.updateMany({ where: { companyId, supplierId: losing.id }, data: { supplierId: surviving.id } });

    // SupplierManufacturer — @@unique([companyId, supplierId, manufacturerId]).
    // A brand already linked to the survivor can't also be re-pointed there
    // from the loser — drop the loser's duplicate row instead of colliding.
    const [survivorBrands, losingBrands] = await Promise.all([
      tx.supplierManufacturer.findMany({ where: { companyId, supplierId: surviving.id }, select: { manufacturerId: true } }),
      tx.supplierManufacturer.findMany({ where: { companyId, supplierId: losing.id } }),
    ]);
    const survivorBrandIds = new Set(survivorBrands.map((b) => b.manufacturerId));
    for (const brand of losingBrands) {
      if (survivorBrandIds.has(brand.manufacturerId)) await tx.supplierManufacturer.delete({ where: { id: brand.id } });
      else await tx.supplierManufacturer.update({ where: { id: brand.id }, data: { supplierId: surviving.id } });
    }

    await tx.outworkItem.updateMany({ where: { companyId, supplierId: losing.id }, data: { supplierId: surviving.id } });
    await tx.jobPartLine.updateMany({ where: { companyId, orderedFromSupplierId: losing.id }, data: { orderedFromSupplierId: surviving.id } });

    // JobRfqRequest — @@unique([jobId, supplierId]). If the survivor already
    // has an RFQ request on the same job as the loser, that job already has
    // an active request against the surviving supplier — keep it and drop
    // the loser's duplicate rather than colliding.
    const [survivorRfqJobs, losingRfqs] = await Promise.all([
      tx.jobRfqRequest.findMany({ where: { companyId, supplierId: surviving.id }, select: { jobId: true } }),
      tx.jobRfqRequest.findMany({ where: { companyId, supplierId: losing.id } }),
    ]);
    const survivorRfqJobIds = new Set(survivorRfqJobs.map((r) => r.jobId));
    for (const rfq of losingRfqs) {
      if (survivorRfqJobIds.has(rfq.jobId)) await tx.jobRfqRequest.delete({ where: { id: rfq.id } });
      else await tx.jobRfqRequest.update({ where: { id: rfq.id }, data: { supplierId: surviving.id } });
    }

    await tx.generalRfqRequest.updateMany({ where: { companyId, supplierId: losing.id }, data: { supplierId: surviving.id } });

    await tx.supplier.update({ where: { id: losing.id }, data: { active: false, notes: mergedNotes(losing.notes, surviving.name) } });

    return { survivingId: surviving.id, losingId: losing.id, survivorName: surviving.name, losingName: losing.name };
  });

  await recordAudit(ctx, { source: "UI", module: "SUPPLIERS", entityType: "Supplier", entityId: surviving.id, action: "MERGE", afterData: summary });
  return { ok: true, ...summary };
}

export async function mergeCustomers(ctx: RequestContext, raw: unknown) {
  requireModule(ctx, "CUSTOMERS", "WRITE");
  requireTenantPermission(ctx, "CUSTOMERS_EDIT");
  const companyId = ctx.companyId!;
  const input = mergeInput.parse(raw);
  const [surviving, losing] = await Promise.all([
    prisma.customer.findFirst({ where: { id: input.survivingId, companyId } }),
    prisma.customer.findFirst({ where: { id: input.losingId, companyId } }),
  ]);
  if (!surviving || !losing) notFound();

  const summary = await prisma.$transaction(async (tx) => {
    // CustomerBranch — @@unique([companyId, customerId, code]). A null code
    // never collides (Postgres treats each NULL as distinct); a real code
    // that the survivor already uses gets a short suffix instead of being
    // dropped, since a branch carries its own contacts/addresses that would
    // otherwise need re-pointing too.
    const [survivorBranchCodes, losingBranches] = await Promise.all([
      tx.customerBranch.findMany({ where: { companyId, customerId: surviving.id }, select: { code: true } }),
      tx.customerBranch.findMany({ where: { companyId, customerId: losing.id } }),
    ]);
    const takenCodes = new Set(survivorBranchCodes.map((b) => b.code).filter((c): c is string => !!c));
    for (const branch of losingBranches) {
      const code = branch.code && takenCodes.has(branch.code) ? `${branch.code}-${branch.id.slice(-4)}` : branch.code;
      await tx.customerBranch.update({ where: { id: branch.id }, data: { customerId: surviving.id, code } });
      if (code) takenCodes.add(code);
    }

    await tx.customerContact.updateMany({ where: { companyId, customerId: losing.id }, data: { customerId: surviving.id } });
    await tx.customerAddress.updateMany({ where: { companyId, customerId: losing.id }, data: { customerId: surviving.id } });
    await tx.job.updateMany({ where: { companyId, customerId: losing.id }, data: { customerId: surviving.id } });
    await tx.pexRecord.updateMany({ where: { companyId, customerId: losing.id }, data: { customerId: surviving.id } });

    await tx.customer.update({ where: { id: losing.id }, data: { active: false, notes: mergedNotes(losing.notes, surviving.name) } });

    return { survivingId: surviving.id, losingId: losing.id, survivorName: surviving.name, losingName: losing.name };
  });

  await recordAudit(ctx, { source: "UI", module: "CUSTOMERS", entityType: "Customer", entityId: surviving.id, action: "MERGE", afterData: summary });
  return { ok: true, ...summary };
}

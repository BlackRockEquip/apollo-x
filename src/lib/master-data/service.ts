import { Prisma, type ModuleKey } from "@prisma/client";
import type { RequestContext } from "@/lib/auth/context-types";
import type { TenantPermission } from "@/lib/auth/permissions";
import { requireModule, requireTenantPermission } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";
import { customerCreateInput, customerInput, inlineAddressInput, inlineContactInput, listQuery, locationInput, manufacturerInput, normalized, partInput, sequenceInput, serviceInput, supplierCreateInput, supplierInput, taxInput, termInput } from "./validation";
import { z } from "zod";

export type MasterKind = "customers" | "suppliers" | "parts" | "manufacturers" | "storage-locations" | "services" | "tax-codes" | "commercial-terms" | "numbering";
const policy: Record<MasterKind, { module: ModuleKey; view: TenantPermission; create: TenantPermission; edit: TenantPermission }> = {
  customers: { module: "CUSTOMERS", view: "CUSTOMERS_VIEW", create: "CUSTOMERS_CREATE", edit: "CUSTOMERS_EDIT" },
  suppliers: { module: "SUPPLIERS", view: "SUPPLIERS_VIEW", create: "SUPPLIERS_CREATE", edit: "SUPPLIERS_EDIT" },
  parts: { module: "INVENTORY", view: "PARTS_VIEW", create: "PARTS_CREATE", edit: "PARTS_EDIT" },
  manufacturers: { module: "INVENTORY", view: "MANUFACTURERS_VIEW", create: "MANUFACTURERS_CREATE", edit: "MANUFACTURERS_EDIT" },
  "storage-locations": { module: "STORAGE", view: "STORAGE_LOCATIONS_VIEW", create: "STORAGE_LOCATIONS_CREATE", edit: "STORAGE_LOCATIONS_EDIT" },
  services: { module: "QUOTES", view: "SERVICES_VIEW", create: "SERVICES_CREATE", edit: "SERVICES_EDIT" },
  "tax-codes": { module: "INVOICES", view: "TAX_CODES_VIEW", create: "TAX_CODES_CREATE", edit: "TAX_CODES_EDIT" },
  "commercial-terms": { module: "QUOTES", view: "COMMERCIAL_TERMS_VIEW", create: "COMMERCIAL_TERMS_CREATE", edit: "COMMERCIAL_TERMS_EDIT" },
  numbering: { module: "QUOTES", view: "NUMBERING_VIEW", create: "NUMBERING_EDIT", edit: "NUMBERING_EDIT" },
};
const schemas = { customers: customerInput, suppliers: supplierInput, parts: partInput, manufacturers: manufacturerInput, "storage-locations": locationInput, services: serviceInput, "tax-codes": taxInput, "commercial-terms": termInput, numbering: sequenceInput } as const;
function authorize(ctx: RequestContext, kind: MasterKind, intent: "READ" | "WRITE", action: "view" | "create" | "edit") { requireModule(ctx, policy[kind].module, intent); requireTenantPermission(ctx, policy[kind][action]); return ctx.companyId!; }
function statusWhere(status: string) { return status === "all" ? {} : { active: status === "active" }; }
type ContactLike = { firstName?: string | null; lastName?: string | null; isPrimary?: boolean | null; active?: boolean | null };
function contactLabel(contacts: unknown) {
  const list = Array.isArray(contacts) ? (contacts as ContactLike[]) : [];
  const chosen = list.find((c) => c.isPrimary && c.active !== false) || list[0];
  if (!chosen) return null;
  return [chosen.firstName, chosen.lastName].filter(Boolean).join(" ") || null;
}
function audit(ctx: RequestContext, kind: string, entityId: string, action: string, beforeData: unknown, afterData: unknown) {
  return { companyId: ctx.companyId, actorId: ctx.userId, supportAccessId: ctx.supportAccessId, source: "API" as const, module: "MASTER_DATA", entityType: kind, entityId, action, beforeData: beforeData as Prisma.InputJsonValue | undefined, afterData: afterData as Prisma.InputJsonValue | undefined, correlationId: ctx.correlationId };
}

export async function listMaster(ctx: RequestContext, kind: MasterKind, raw: unknown) {
  const companyId = authorize(ctx, kind, "READ", "view"); const q = listQuery.parse(raw); const skip = (q.page - 1) * q.pageSize;
  const contains = { contains: q.q, mode: "insensitive" as const };
  switch (kind) {
    case "customers": { const where: Prisma.CustomerWhereInput = { companyId, ...statusWhere(q.status), ...(q.q && { OR: [{ name: contains }, { tradingName: contains }, { accountCode: contains }, { vatNumber: contains }, { mainTelephone: contains }, { mainEmail: contains }, { branches:{some:{companyId,OR:[{name:contains},{code:contains},{mainTelephone:contains},{mainEmail:contains}]}} }, { contacts: { some: { companyId, OR: [{ firstName: contains }, { lastName: contains }, { email: contains }, { telephone: contains }, {mobile:contains}] } } }] }) }; const [rows,total] = await prisma.$transaction([prisma.customer.findMany({ where, include: { contacts: { select: { firstName:true, lastName:true, isPrimary:true, active:true } }, _count: { select: { branches:true, contacts:true, addresses:true } }, paymentTerm: { select:{label:true} } }, orderBy:{name:"asc"}, skip, take:q.pageSize }), prisma.customer.count({where})]); return {items:rows.map(row=>({...row,primaryContactName:contactLabel(row.contacts)})),total,page:q.page,pageSize:q.pageSize}; }
    case "suppliers": { const where: Prisma.SupplierWhereInput = { companyId, ...statusWhere(q.status), ...(q.q && { OR:[{name:contains},{accountCode:contains},{vatNumber:contains},{mainTelephone:contains},{mainEmail:contains},{contacts:{some:{companyId,OR:[{firstName:contains},{lastName:contains},{email:contains},{telephone:contains},{mobile:contains}]}}},{manufacturers:{some:{companyId,manufacturer:{name:contains}}}}] }) }; const [rows,total]=await prisma.$transaction([prisma.supplier.findMany({where,include:{contacts:{select:{firstName:true,lastName:true,isPrimary:true,active:true}},_count:{select:{contacts:true,addresses:true}},manufacturers:{include:{manufacturer:{select:{id:true,name:true}}}}},orderBy:{name:"asc"},skip,take:q.pageSize}),prisma.supplier.count({where})]); return {items:rows.map(row=>({...row,primaryContactName:contactLabel(row.contacts),brandNames:(row.manufacturers||[]).map((entry)=>entry.manufacturer?.name).filter((n): n is string=>Boolean(n)).join(", ")||null})),total,page:q.page,pageSize:q.pageSize}; }
    case "parts": { const where: Prisma.PartWhereInput={companyId,operationalStatus:"OPERATIONAL",...statusWhere(q.status),...(q.q&&{OR:[{partNumber:contains},{description:contains},{manufacturerPartNumber:contains},{category:contains}]})}; const [items,total]=await prisma.$transaction([prisma.part.findMany({where,include:{manufacturer:{select:{name:true}},taxCode:{select:{code:true,rate:true}},binLocation:{select:{id:true,code:true,name:true}}},orderBy:{partNumber:"asc"},skip,take:q.pageSize}),prisma.part.count({where})]); return {items,total,page:q.page,pageSize:q.pageSize}; }
    case "manufacturers": { const where: Prisma.ManufacturerWhereInput={companyId,...statusWhere(q.status),...(q.q&&{OR:[{name:contains},{code:contains},{description:contains}]})}; const [items,total]=await prisma.$transaction([prisma.manufacturer.findMany({where,include:{_count:{select:{parts:true,suppliers:true}}},orderBy:{name:"asc"},skip,take:q.pageSize}),prisma.manufacturer.count({where})]); return {items,total,page:q.page,pageSize:q.pageSize}; }
    case "storage-locations": { const where: Prisma.StorageLocationWhereInput={companyId,...statusWhere(q.status),...(q.q&&{OR:[{code:contains},{name:contains},{description:contains}]})}; const [items,total]=await prisma.$transaction([prisma.storageLocation.findMany({where,include:{parent:{select:{id:true,code:true,name:true}},_count:{select:{children:true}}},orderBy:[{sortOrder:"asc"},{code:"asc"}],skip,take:q.pageSize}),prisma.storageLocation.count({where})]); return {items,total,page:q.page,pageSize:q.pageSize}; }
    case "services": { const where: Prisma.ServiceItemWhereInput={companyId,...statusWhere(q.status),...(q.q&&{OR:[{code:contains},{description:contains},{category:contains}]})}; const [items,total]=await prisma.$transaction([prisma.serviceItem.findMany({where,include:{taxCode:{select:{code:true,rate:true}}},orderBy:{code:"asc"},skip,take:q.pageSize}),prisma.serviceItem.count({where})]); return {items,total,page:q.page,pageSize:q.pageSize}; }
    case "tax-codes": { const where: Prisma.TaxCodeWhereInput={companyId,...statusWhere(q.status),...(q.q&&{OR:[{code:contains},{description:contains}]})}; const [items,total]=await prisma.$transaction([prisma.taxCode.findMany({where,orderBy:[{code:"asc"},{effectiveFrom:"desc"}],skip,take:q.pageSize}),prisma.taxCode.count({where})]); return {items,total,page:q.page,pageSize:q.pageSize}; }
    case "commercial-terms": { const where: Prisma.CommercialTermWhereInput={companyId,...statusWhere(q.status),...(q.q&&{OR:[{code:contains},{label:contains},{termsText:contains}]})}; const [items,total]=await prisma.$transaction([prisma.commercialTerm.findMany({where,orderBy:[{type:"asc"},{label:"asc"}],skip,take:q.pageSize}),prisma.commercialTerm.count({where})]); return {items,total,page:q.page,pageSize:q.pageSize}; }
    case "numbering": { const where: Prisma.DocumentNumberSequenceWhereInput={companyId,...statusWhere(q.status)}; const [items,total]=await prisma.$transaction([prisma.documentNumberSequence.findMany({where,orderBy:{type:"asc"},skip,take:q.pageSize}),prisma.documentNumberSequence.count({where})]); return {items:items.map(i=>({...i,nextValue:i.nextValue.toString()})),total,page:q.page,pageSize:q.pageSize}; }
  }
}

// Persists the optional inline billing address + contact rows a
// customer/supplier can be created with (see customerCreateInput /
// supplierCreateInput in validation.ts) — mirrors ModApp's NewClientForm /
// AddSupplierModal, one step instead of "create, then add contacts"
// afterward. Blank rows are dropped: no line1 means no address row, no
// firstName means that contact row is skipped, matching ModApp's own
// "rows left with no name are ignored" convention. Only the first row
// explicitly marked isPrimary wins, in case more than one was ticked.
// Emits the same per-child audit event shape createChild (child-service.ts)
// uses when adding a contact/address after the fact, so both paths show up
// identically on the party's Activity tab.
async function createInlinePartyChildren(tx: Prisma.TransactionClient, ctx: RequestContext, companyId: string, parent: "customer" | "supplier", parentId: string, address: z.infer<typeof inlineAddressInput> | undefined, contacts: Array<z.infer<typeof inlineContactInput>>) {
  if (address?.line1) {
    const addressFields = { type: address.type, line1: address.line1, line2: address.line2 || null, city: address.city || null, province: address.province || null, postalCode: address.postalCode || null, countryCode: address.countryCode, isPrimary: true };
    const createdAddress = parent === "customer"
      ? await tx.customerAddress.create({ data: { ...addressFields, companyId, customerId: parentId } })
      : await tx.supplierAddress.create({ data: { ...addressFields, companyId, supplierId: parentId } });
    await tx.auditEvent.create({ data: audit(ctx, `${parent}.addresses`, createdAddress.id, "CREATE", null, { parentId, ...createdAddress }) });
  }
  let primarySet = false;
  for (const contact of contacts) {
    if (!contact.firstName.trim()) continue;
    const isPrimary = contact.isPrimary && !primarySet;
    if (isPrimary) primarySet = true;
    const contactFields = { firstName: contact.firstName, lastName: contact.lastName || null, position: contact.position || null, telephone: contact.telephone || null, mobile: contact.mobile || null, email: contact.email || null, isPrimary };
    const createdContact = parent === "customer"
      ? await tx.customerContact.create({ data: { ...contactFields, companyId, customerId: parentId } })
      : await tx.supplierContact.create({ data: { ...contactFields, canReceiveRfq: contact.canReceiveRfq, companyId, supplierId: parentId } });
    await tx.auditEvent.create({ data: audit(ctx, `${parent}.contacts`, createdContact.id, "CREATE", null, { parentId, ...createdContact }) });
  }
}

export async function createMaster(ctx: RequestContext, kind: MasterKind, raw: unknown) {
  const companyId=authorize(ctx,kind,"WRITE","create"); const input=raw;
  return prisma.$transaction(async tx => {
    let created: Record<string, unknown> & {id:string};
    switch(kind) {
      case "customers": { const v=customerCreateInput.parse(input); const {address,contacts,...data}=v; created=await tx.customer.create({data:{...data,companyId,mainEmail:data.mainEmail||null,nameNormalized:normalized(data.name)!,accountCodeNormalized:normalized(data.accountCode),creditLimit:data.creditLimit==null?null:new Prisma.Decimal(data.creditLimit)}}); await createInlinePartyChildren(tx,ctx,companyId,"customer",created.id,address,contacts); break; }
      case "suppliers": { const v=supplierCreateInput.parse(input); const {manufacturerIds,address,contacts,...data}=v; created=await tx.supplier.create({data:{...data,companyId,mainEmail:data.mainEmail||null,nameNormalized:normalized(data.name)!,accountCodeNormalized:normalized(data.accountCode),manufacturers:{create:manufacturerIds.map(manufacturerId=>({companyId,manufacturerId}))}}}); await createInlinePartyChildren(tx,ctx,companyId,"supplier",created.id,address,contacts); break; }
      case "manufacturers": { const v=manufacturerInput.parse(input); created=await tx.manufacturer.create({data:{...v,companyId,nameNormalized:normalized(v.name)!,codeNormalized:normalized(v.code)}}); break; }
      case "parts": { const v=partInput.parse(input); created=await tx.part.create({data:{...v,companyId,partNumberNormalized:normalized(v.partNumber)!,defaultPurchaseCost:v.defaultPurchaseCost==null?null:new Prisma.Decimal(v.defaultPurchaseCost),defaultSellingPrice:v.defaultSellingPrice==null?null:new Prisma.Decimal(v.defaultSellingPrice),reorderMinimum:v.reorderMinimum==null?null:new Prisma.Decimal(v.reorderMinimum),reorderMaximum:v.reorderMaximum==null?null:new Prisma.Decimal(v.reorderMaximum),reorderQuantity:v.reorderQuantity==null?null:new Prisma.Decimal(v.reorderQuantity)}}); break; }
      case "storage-locations": { const v=locationInput.parse(input); if(v.parentId&&!await tx.storageLocation.findFirst({where:{id:v.parentId,companyId}})) throw new Error("PARENT_NOT_FOUND"); created=await tx.storageLocation.create({data:{...v,companyId,codeNormalized:normalized(v.code)!}}); break; }
      case "services": { const v=serviceInput.parse(input); created=await tx.serviceItem.create({data:{...v,companyId,codeNormalized:normalized(v.code)!,defaultCost:v.defaultCost==null?null:new Prisma.Decimal(v.defaultCost),defaultSellingPrice:v.defaultSellingPrice==null?null:new Prisma.Decimal(v.defaultSellingPrice)}}); break; }
      case "tax-codes": { const v=taxInput.parse(input); created=await tx.taxCode.create({data:{...v,companyId,codeNormalized:normalized(v.code)!,rate:new Prisma.Decimal(v.rate)}}); break; }
      case "commercial-terms": { const v=termInput.parse(input); created=await tx.commercialTerm.create({data:{...v,companyId,codeNormalized:normalized(v.code)!}}); break; }
      case "numbering": { const v=sequenceInput.parse(input); created=await tx.documentNumberSequence.create({data:{...v,companyId}}) as unknown as Record<string,unknown>&{id:string}; break; }
    }
    await tx.auditEvent.create({data:audit(ctx,kind,created.id,"CREATE",undefined,JSON.parse(JSON.stringify(created,(_,x)=>typeof x==="bigint"?x.toString():x)))}); return created;
  });
}

export async function updateMaster(ctx: RequestContext, kind: MasterKind, id: string, raw: unknown) {
  const companyId=authorize(ctx,kind,"WRITE","edit");
  return prisma.$transaction(async tx=>{
    const delegate = kind === "customers" ? tx.customer : kind === "suppliers" ? tx.supplier : kind === "parts" ? tx.part : kind === "manufacturers" ? tx.manufacturer : kind === "storage-locations" ? tx.storageLocation : kind === "services" ? tx.serviceItem : kind === "tax-codes" ? tx.taxCode : kind === "commercial-terms" ? tx.commercialTerm : tx.documentNumberSequence;
    const before=await (delegate as never as {findFirst(a:unknown):Promise<Record<string,unknown>|null>}).findFirst({where:{id,companyId}}); if(!before) throw new Error("NOT_FOUND");
    const input=schemas[kind].parse({...before,...(raw as Record<string,unknown>)});
    const data: Record<string,unknown>={...input};
    if("name" in data) data.nameNormalized=normalized(data.name as string); if("accountCode" in data) data.accountCodeNormalized=normalized(data.accountCode as string); if("code" in data) data.codeNormalized=normalized(data.code as string); if("partNumber" in data) data.partNumberNormalized=normalized(data.partNumber as string);
    for(const k of ["creditLimit","defaultPurchaseCost","defaultSellingPrice","reorderMinimum","reorderMaximum","reorderQuantity","defaultCost","rate"]) if(data[k]!=null) data[k]=new Prisma.Decimal(data[k] as string);
    delete data.manufacturerIds;
    const updated=await (delegate as never as {update(a:unknown):Promise<Record<string,unknown>&{id:string}>}).update({where:{id},data});
    // 2026-09-14 — bug fix found while wiring up the "Brands supplied" field
    // on the New Supplier form: this used to check `"manufacturerIds" in
    // input` — `input` is the *parsed* zod output, and supplierInput
    // defaults manufacturerIds to `[]` (schema: `.default([])`), so that key
    // is ALWAYS present on the parsed object regardless of whether the
    // caller's request actually included it. Every ordinary supplier edit
    // (e.g. just changing a phone number) was therefore silently wiping the
    // supplier's entire brand list on every save, since the merge fell back
    // to the empty default. Fixed by checking the caller's own raw payload
    // instead — brands are only touched when the request actually named
    // that field (which only the New Supplier form's create-only submit and
    // any future explicit "edit brands" caller would do).
    // The `&&"manufacturerIds" in input` clause (added alongside this
    // 2026-09-14 type fix) is redundant at runtime — every suppliers-schema
    // parse always has the key, per the .default([]) note above — but it's
    // what lets tsc narrow `input`'s type (a union across every MasterKind's
    // schema output, most of which have no such field) down to the branch
    // that does, so `input.manufacturerIds` below type-checks without an
    // unsafe cast standing in for it.
    if(kind==="suppliers"&&"manufacturerIds" in (raw as Record<string,unknown>)&&"manufacturerIds" in input){ await tx.supplierManufacturer.deleteMany({where:{companyId,supplierId:id}}); await tx.supplierManufacturer.createMany({data:input.manufacturerIds.map(manufacturerId=>({companyId,supplierId:id,manufacturerId})),skipDuplicates:true}); }
    await tx.auditEvent.create({data:audit(ctx,kind,id,"UPDATE",JSON.parse(JSON.stringify(before,(_,x)=>typeof x==="bigint"?x.toString():x)),JSON.parse(JSON.stringify(updated,(_,x)=>typeof x==="bigint"?x.toString():x)))}); return updated;
  });
}

function authorizeDeletePart(ctx: RequestContext) {
  requireModule(ctx, "INVENTORY", "WRITE");
  requireTenantPermission(ctx, "PARTS_DEACTIVATE");
  return ctx.companyId!;
}

// A Postgres FK constraint in Restrict mode (StockBalance/StockMovement/
// StockReservation/StockCountLine/JobKitLine/JobPartLine.partId all use
// onDelete: Restrict) blocks the delete outright rather than cascading —
// Prisma normally surfaces that as P2003 ("Foreign key constraint failed"),
// but the message check is kept as a fallback in case a differently-shaped
// error reaches here from a Prisma/driver version this wasn't tested
// against.
function isForeignKeyRestrictError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const code = (error as { code?: string }).code;
  if (code === "P2003" || code === "P2014") return true;
  const message = (error as { message?: string }).message;
  return typeof message === "string" && /foreign key constraint/i.test(message);
}

// 2026-09-10 — "delete a part" added to the merged Stock Levels page (per
// user request: hard delete, auto-fallback). Many parts can't actually be
// removed once they have stock/job history — job lines, stock movements,
// kit lines, stock counts, and reservations all reference partId with
// onDelete: Restrict specifically to protect that history. Rather than
// surfacing a raw FK error and forcing the user to go figure out why,
// attempt the real delete first and, only if the database blocks it for
// that reason, fall back to marking the part a historical reference
// (operationalStatus: HISTORICAL_REFERENCE, active: false) — the exact
// status the "parts" listMaster query already filters out, and Stock
// Levels' own listing does the same (see listInventoryPositions). The
// caller is told which of the two actually happened so the UI can report
// it accurately instead of always claiming "deleted".
export async function deletePart(ctx: RequestContext, id: string) {
  const companyId = authorizeDeletePart(ctx);
  const before = await prisma.part.findFirst({ where: { id, companyId } });
  if (!before) throw new Error("NOT_FOUND");
  const beforeJson = JSON.parse(JSON.stringify(before, (_, x) => (typeof x === "bigint" ? x.toString() : x)));
  try {
    await prisma.$transaction(async (tx) => {
      await tx.part.delete({ where: { id } });
      await tx.auditEvent.create({ data: audit(ctx, "parts", id, "DELETE", beforeJson, undefined) });
    });
    return { outcome: "deleted" as const, id };
  } catch (error) {
    if (!isForeignKeyRestrictError(error)) throw error;
    const updated = await prisma.$transaction(async (tx) => {
      const part = await tx.part.update({ where: { id }, data: { active: false, operationalStatus: "HISTORICAL_REFERENCE" } });
      await tx.auditEvent.create({ data: audit(ctx, "parts", id, "UPDATE", beforeJson, JSON.parse(JSON.stringify(part, (_, x) => (typeof x === "bigint" ? x.toString() : x)))) });
      return part;
    });
    return { outcome: "deactivated" as const, id, part: updated };
  }
}

// Bulk counterpart of deletePart for the "Delete all" button — every
// still-operational part in the tenant gets the same hard-delete-then-
// fallback treatment, one at a time (each part's delete/fallback is its
// own transaction, same as a single deletePart call), and the totals are
// reported back so the UI can say "12 deleted, 5 kept as historical
// reference" rather than a single opaque success message.
export async function deleteAllParts(ctx: RequestContext) {
  const companyId = authorizeDeletePart(ctx);
  const parts = await prisma.part.findMany({ where: { companyId, operationalStatus: "OPERATIONAL" }, select: { id: true } });
  let deleted = 0;
  let deactivated = 0;
  for (const p of parts) {
    const result = await deletePart(ctx, p.id);
    if (result.outcome === "deleted") deleted++;
    else deactivated++;
  }
  return { total: parts.length, deleted, deactivated };
}

type SoftDeletableKind = "manufacturers" | "storage-locations";
const SOFT_DELETE_POLICY: Record<SoftDeletableKind, { module: ModuleKey; permission: TenantPermission }> = {
  manufacturers: { module: "INVENTORY", permission: "MANUFACTURERS_DEACTIVATE" },
  "storage-locations": { module: "STORAGE", permission: "STORAGE_LOCATIONS_DEACTIVATE" },
};
function authorizeDeleteMaster(ctx: RequestContext, kind: SoftDeletableKind) {
  const rule = SOFT_DELETE_POLICY[kind];
  requireModule(ctx, rule.module, "WRITE");
  requireTenantPermission(ctx, rule.permission);
  return ctx.companyId!;
}

// 2026-09-10 — per-row delete buttons for Manufacturers and Storage
// Locations (per the user's request). Same hard-delete-with-automatic-
// fallback shape as deletePart above (see its comment for the general
// rationale) — attempt a real delete first, and only if the database
// blocks it with a FK restrict error, fall back to marking the record
// inactive instead of surfacing a raw constraint error. Neither model has
// a dedicated "historical reference" status the way Part does, so the
// fallback reuses the existing `active` flag both configs already expose
// as a checkbox field and as the Active/Inactive status pill/filter on
// every MasterDataWorkspace list — a deactivated record simply drops out
// of the default "Active" filter instead of disappearing outright.
// Manufacturer has no Restrict-onDelete pointing at it (Part.manufacturerId
// is SetNull, SupplierManufacturer.manufacturerId is Cascade), so a hard
// delete there should normally just succeed outright; Storage Location is
// Restrict-referenced from its own children (parentId), StockBalance,
// StockMovement (from/to) and StockReservation/StockCount, so a location
// with any stock/movement history or child locations will fall back to
// deactivation.
export async function deleteMasterRecord(ctx: RequestContext, kind: SoftDeletableKind, id: string) {
  const companyId = authorizeDeleteMaster(ctx, kind);
  const delegate = kind === "manufacturers" ? prisma.manufacturer : prisma.storageLocation;
  const before = await (delegate as never as { findFirst(a: unknown): Promise<Record<string, unknown> | null> }).findFirst({ where: { id, companyId } });
  if (!before) throw new Error("NOT_FOUND");
  const beforeJson = JSON.parse(JSON.stringify(before, (_, x) => (typeof x === "bigint" ? x.toString() : x)));
  try {
    await prisma.$transaction(async (tx) => {
      const txDelegate = kind === "manufacturers" ? tx.manufacturer : tx.storageLocation;
      await (txDelegate as never as { delete(a: unknown): Promise<unknown> }).delete({ where: { id } });
      await tx.auditEvent.create({ data: audit(ctx, kind, id, "DELETE", beforeJson, undefined) });
    });
    return { outcome: "deleted" as const, id };
  } catch (error) {
    if (!isForeignKeyRestrictError(error)) throw error;
    const updated = await prisma.$transaction(async (tx) => {
      const txDelegate = kind === "manufacturers" ? tx.manufacturer : tx.storageLocation;
      const record = await (txDelegate as never as { update(a: unknown): Promise<Record<string, unknown>> }).update({ where: { id }, data: { active: false } });
      await tx.auditEvent.create({ data: audit(ctx, kind, id, "UPDATE", beforeJson, JSON.parse(JSON.stringify(record, (_, x) => (typeof x === "bigint" ? x.toString() : x)))) });
      return record;
    });
    return { outcome: "deactivated" as const, id, record: updated };
  }
}

export async function allocateDocumentNumber(ctx: RequestContext, type: string, now=new Date()) {
  authorize(ctx,"numbering","WRITE","edit");
  return prisma.$transaction(async tx=>allocateDocumentNumberTx(tx, ctx, type, now));
}

export async function allocateDocumentNumberTx(tx: Prisma.TransactionClient, ctx: RequestContext, type: string, now=new Date()) {
  const companyId=ctx.companyId!;
  // Looped rather than a single shot: the "next value" this counter hands
  // out can already be taken on the Job side (a historical import, manual
  // seeding/testing, or a sequence someone reset under Settings >
  // Numbering) — and since this call and the row it's for normally run in
  // one shared transaction, a failed create rolls the "spent" value back
  // too, so simply retrying the same failed call from the caller would
  // hand back this exact doomed number forever (every later row would
  // fail the same way, not just this one). Checked centrally here, once,
  // for every caller, rather than in each of them — a fresh UPDATE inside
  // this same open transaction correctly sees its own prior writes, so
  // looping past a clash actually advances the counter for good once a
  // free value is found and the transaction commits. Bounded so a
  // genuinely broken sequence still fails loudly instead of hanging.
  for (let attempt = 0; attempt < 100; attempt++) {
    const rows=await tx.$queryRaw<Array<{id:string;prefix:string;padding:number;includeFinancialYear:boolean;financialYearStartMonth:number;allocated:bigint}>>`UPDATE "DocumentNumberSequence" SET "nextValue"="nextValue"+1,"updatedAt"=NOW() WHERE "companyId"=${companyId} AND "type"=CAST(${type} AS "DocumentSequenceType") AND active=true RETURNING id,prefix,padding,"includeFinancialYear","financialYearStartMonth","nextValue"-1 AS allocated`;
    if(rows.length!==1) throw new Error("SEQUENCE_NOT_FOUND");
    const r=rows[0];
    const year=now.getUTCMonth()+1>=r.financialYearStartMonth?now.getUTCFullYear()+1:now.getUTCFullYear();
    const number=`${r.prefix}${r.includeFinancialYear?`${year}/`:""}${r.allocated.toString().padStart(r.padding,"0")}`;
    // "JOB"/"PEX_JOB" are the only sequence types a real row's own unique
    // field (Job.jobNumber) can be checked against today — a future
    // document type (quotes, invoices, ...) with its own numbered model
    // would need the same treatment added here once it exists.
    if ((type === "JOB" || type === "PEX_JOB") && await tx.job.findUnique({ where: { jobNumber: number }, select: { id: true } })) continue;
    await tx.auditEvent.create({data:audit(ctx,"numbering",r.id,"ALLOCATE",undefined,{type,number})});
    return number;
  }
  throw new Error(`Couldn't allocate a free number for "${type}" after 100 attempts — check Settings > Numbering for this sequence.`);
}

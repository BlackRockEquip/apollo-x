import { Prisma, type ModuleKey } from "@prisma/client";
import type { RequestContext } from "@/lib/auth/context-types";
import type { TenantPermission } from "@/lib/auth/permissions";
import { requireModule, requireTenantPermission } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";
import { customerInput, listQuery, locationInput, manufacturerInput, normalized, partInput, sequenceInput, serviceInput, supplierInput, taxInput, termInput } from "./validation";

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
function audit(ctx: RequestContext, kind: string, entityId: string, action: string, beforeData: unknown, afterData: unknown) {
  return { companyId: ctx.companyId, actorId: ctx.userId, supportAccessId: ctx.supportAccessId, source: "API" as const, module: "MASTER_DATA", entityType: kind, entityId, action, beforeData: beforeData as Prisma.InputJsonValue | undefined, afterData: afterData as Prisma.InputJsonValue | undefined, correlationId: ctx.correlationId };
}

export async function listMaster(ctx: RequestContext, kind: MasterKind, raw: unknown) {
  const companyId = authorize(ctx, kind, "READ", "view"); const q = listQuery.parse(raw); const skip = (q.page - 1) * q.pageSize;
  const contains = { contains: q.q, mode: "insensitive" as const };
  switch (kind) {
    case "customers": { const where: Prisma.CustomerWhereInput = { companyId, ...statusWhere(q.status), ...(q.q && { OR: [{ name: contains }, { tradingName: contains }, { accountCode: contains }, { vatNumber: contains }, { mainTelephone: contains }, { mainEmail: contains }, { branches:{some:{companyId,OR:[{name:contains},{code:contains},{mainTelephone:contains},{mainEmail:contains}]}} }, { contacts: { some: { companyId, OR: [{ firstName: contains }, { lastName: contains }, { email: contains }, { telephone: contains }, {mobile:contains}] } } }] }) }; const [items,total] = await prisma.$transaction([prisma.customer.findMany({ where, include: { _count: { select: { branches:true, contacts:true, addresses:true } }, paymentTerm: { select:{label:true} } }, orderBy:{name:"asc"}, skip, take:q.pageSize }), prisma.customer.count({where})]); return {items,total,page:q.page,pageSize:q.pageSize}; }
    case "suppliers": { const where: Prisma.SupplierWhereInput = { companyId, ...statusWhere(q.status), ...(q.q && { OR:[{name:contains},{accountCode:contains},{vatNumber:contains},{mainTelephone:contains},{mainEmail:contains},{contacts:{some:{companyId,OR:[{firstName:contains},{lastName:contains},{email:contains},{telephone:contains},{mobile:contains}]}}},{manufacturers:{some:{companyId,manufacturer:{name:contains}}}}] }) }; const [items,total]=await prisma.$transaction([prisma.supplier.findMany({where,include:{_count:{select:{contacts:true,addresses:true}},manufacturers:{include:{manufacturer:{select:{id:true,name:true}}}}},orderBy:{name:"asc"},skip,take:q.pageSize}),prisma.supplier.count({where})]); return {items,total,page:q.page,pageSize:q.pageSize}; }
    case "parts": { const where: Prisma.PartWhereInput={companyId,...statusWhere(q.status),...(q.q&&{OR:[{partNumber:contains},{description:contains},{manufacturerPartNumber:contains},{category:contains}]})}; const [items,total]=await prisma.$transaction([prisma.part.findMany({where,include:{manufacturer:{select:{name:true}},taxCode:{select:{code:true,rate:true}}},orderBy:{partNumber:"asc"},skip,take:q.pageSize}),prisma.part.count({where})]); return {items,total,page:q.page,pageSize:q.pageSize}; }
    case "manufacturers": { const where: Prisma.ManufacturerWhereInput={companyId,...statusWhere(q.status),...(q.q&&{OR:[{name:contains},{code:contains},{description:contains}]})}; const [items,total]=await prisma.$transaction([prisma.manufacturer.findMany({where,include:{_count:{select:{parts:true,suppliers:true}}},orderBy:{name:"asc"},skip,take:q.pageSize}),prisma.manufacturer.count({where})]); return {items,total,page:q.page,pageSize:q.pageSize}; }
    case "storage-locations": { const where: Prisma.StorageLocationWhereInput={companyId,...statusWhere(q.status),...(q.q&&{OR:[{code:contains},{name:contains},{description:contains}]})}; const [items,total]=await prisma.$transaction([prisma.storageLocation.findMany({where,include:{parent:{select:{id:true,code:true,name:true}},_count:{select:{children:true}}},orderBy:[{sortOrder:"asc"},{code:"asc"}],skip,take:q.pageSize}),prisma.storageLocation.count({where})]); return {items,total,page:q.page,pageSize:q.pageSize}; }
    case "services": { const where: Prisma.ServiceItemWhereInput={companyId,...statusWhere(q.status),...(q.q&&{OR:[{code:contains},{description:contains},{category:contains}]})}; const [items,total]=await prisma.$transaction([prisma.serviceItem.findMany({where,include:{taxCode:{select:{code:true,rate:true}}},orderBy:{code:"asc"},skip,take:q.pageSize}),prisma.serviceItem.count({where})]); return {items,total,page:q.page,pageSize:q.pageSize}; }
    case "tax-codes": { const where: Prisma.TaxCodeWhereInput={companyId,...statusWhere(q.status),...(q.q&&{OR:[{code:contains},{description:contains}]})}; const [items,total]=await prisma.$transaction([prisma.taxCode.findMany({where,orderBy:[{code:"asc"},{effectiveFrom:"desc"}],skip,take:q.pageSize}),prisma.taxCode.count({where})]); return {items,total,page:q.page,pageSize:q.pageSize}; }
    case "commercial-terms": { const where: Prisma.CommercialTermWhereInput={companyId,...statusWhere(q.status),...(q.q&&{OR:[{code:contains},{label:contains},{termsText:contains}]})}; const [items,total]=await prisma.$transaction([prisma.commercialTerm.findMany({where,orderBy:[{type:"asc"},{label:"asc"}],skip,take:q.pageSize}),prisma.commercialTerm.count({where})]); return {items,total,page:q.page,pageSize:q.pageSize}; }
    case "numbering": { const where: Prisma.DocumentNumberSequenceWhereInput={companyId,...statusWhere(q.status)}; const [items,total]=await prisma.$transaction([prisma.documentNumberSequence.findMany({where,orderBy:{type:"asc"},skip,take:q.pageSize}),prisma.documentNumberSequence.count({where})]); return {items:items.map(i=>({...i,nextValue:i.nextValue.toString()})),total,page:q.page,pageSize:q.pageSize}; }
  }
}

export async function createMaster(ctx: RequestContext, kind: MasterKind, raw: unknown) {
  const companyId=authorize(ctx,kind,"WRITE","create"); const input=raw;
  return prisma.$transaction(async tx => {
    let created: Record<string, unknown> & {id:string};
    switch(kind) {
      case "customers": { const v=customerInput.parse(input); created=await tx.customer.create({data:{...v,companyId,mainEmail:v.mainEmail||null,nameNormalized:normalized(v.name)!,accountCodeNormalized:normalized(v.accountCode),creditLimit:v.creditLimit==null?null:new Prisma.Decimal(v.creditLimit)}}); break; }
      case "suppliers": { const v=supplierInput.parse(input); const {manufacturerIds,...data}=v; created=await tx.supplier.create({data:{...data,companyId,mainEmail:data.mainEmail||null,nameNormalized:normalized(data.name)!,accountCodeNormalized:normalized(data.accountCode),manufacturers:{create:manufacturerIds.map(manufacturerId=>({companyId,manufacturerId}))}}}); break; }
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
    if(kind==="suppliers"&&"manufacturerIds" in input){ await tx.supplierManufacturer.deleteMany({where:{companyId,supplierId:id}}); await tx.supplierManufacturer.createMany({data:(input.manufacturerIds as string[]).map(manufacturerId=>({companyId,supplierId:id,manufacturerId})),skipDuplicates:true}); }
    await tx.auditEvent.create({data:audit(ctx,kind,id,"UPDATE",JSON.parse(JSON.stringify(before,(_,x)=>typeof x==="bigint"?x.toString():x)),JSON.parse(JSON.stringify(updated,(_,x)=>typeof x==="bigint"?x.toString():x)))}); return updated;
  });
}

export async function allocateDocumentNumber(ctx: RequestContext, type: string, now=new Date()) {
  authorize(ctx,"numbering","WRITE","edit"); const companyId=ctx.companyId!;
  return prisma.$transaction(async tx=>{ const rows=await tx.$queryRaw<Array<{id:string;prefix:string;padding:number;includeFinancialYear:boolean;financialYearStartMonth:number;allocated:bigint}>>`UPDATE "DocumentNumberSequence" SET "nextValue"="nextValue"+1,"updatedAt"=NOW() WHERE "companyId"=${companyId} AND "type"=CAST(${type} AS "DocumentSequenceType") AND active=true RETURNING id,prefix,padding,"includeFinancialYear","financialYearStartMonth","nextValue"-1 AS allocated`; if(rows.length!==1) throw new Error("SEQUENCE_NOT_FOUND"); const r=rows[0]; const year=now.getUTCMonth()+1>=r.financialYearStartMonth?now.getUTCFullYear()+1:now.getUTCFullYear(); const number=`${r.prefix}${r.includeFinancialYear?`${year}/`:""}${r.allocated.toString().padStart(r.padding,"0")}`; await tx.auditEvent.create({data:audit(ctx,"numbering",r.id,"ALLOCATE",undefined,{type,number})}); return number; });
}

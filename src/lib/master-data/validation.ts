import { z } from "zod";

const optionalText = z.string().trim().max(500).optional().nullable();
const optionalCode = z.string().trim().max(50).optional().nullable();
const money = z.union([z.string().regex(/^\d+(\.\d{1,4})?$/), z.number().nonnegative()]).optional().nullable();

export const customerInput = z.object({
  name: z.string().trim().min(2).max(200), tradingName: optionalText, accountCode: optionalCode,
  registrationNumber: optionalText, vatNumber: optionalText, mainTelephone: optionalText,
  mainEmail: z.string().trim().email().optional().nullable().or(z.literal("")), website: optionalText,
  notes: z.string().trim().max(5000).optional().nullable(), paymentTermId: z.string().cuid().optional().nullable(),
  defaultTaxCodeId: z.string().cuid().optional().nullable(), currencyCode: z.string().trim().length(3).default("ZAR"),
  creditLimit: money, accountOnHold: z.boolean().default(false), active: z.boolean().default(true),
});

export const supplierInput = z.object({
  name: z.string().trim().min(2).max(200), accountCode: optionalCode, registrationNumber: optionalText,
  vatNumber: optionalText, mainTelephone: optionalText, mainEmail: z.string().trim().email().optional().nullable().or(z.literal("")),
  website: optionalText, notes: z.string().trim().max(5000).optional().nullable(),
  paymentTermId: z.string().cuid().optional().nullable(), currencyCode: z.string().trim().length(3).default("ZAR"),
  active: z.boolean().default(true), manufacturerIds: z.array(z.string().cuid()).default([]),
});

export const contactInput = z.object({
  firstName: z.string().trim().min(1).max(100), lastName: optionalText, position: optionalText,
  telephone: optionalText, mobile: optionalText, email: z.string().trim().email().optional().nullable().or(z.literal("")),
  isPrimary: z.boolean().default(false), active: z.boolean().default(true), branchId: z.string().cuid().optional().nullable(),
});

// Inline address + contacts accepted only on CREATE (see customerCreateInput
// / supplierCreateInput below), mirroring ModApp's NewClientForm /
// AddSupplierModal — one billing-style address plus a repeatable contacts
// list, entered in the same step as the account itself instead of a
// separate "create, then add contacts" flow. Deliberately NOT part of
// customerInput/supplierInput above: those are also used by updateMaster
// for plain PATCH edits, and Customer/Supplier have no scalar `address` or
// `contacts` columns — spreading these into a Prisma update `data` object
// would error. Address/contact edits after creation go through the
// existing per-child endpoints (child-service.ts), already exposed on each
// party's detail page.
//
// firstName/line1 are optional here (unlike contactSchema/addressSchema in
// child-service.ts, where they're required) because an inline row can be
// left blank — createMaster only persists a contact once it has a
// firstName, and the address block only once it has a line1, same "blank
// rows are ignored" rule ModApp's forms use.
export const inlineContactInput = z.object({
  firstName: z.string().trim().max(100).optional().default(""), lastName: optionalText, position: optionalText,
  telephone: optionalText, mobile: optionalText, email: z.string().trim().email().optional().nullable().or(z.literal("")),
  isPrimary: z.boolean().default(false),
  // Supplier-only in practice (see the schema comment in child-service.ts)
  // — harmless no-op on a customer contact, dropped before that write.
  canReceiveRfq: z.boolean().default(false),
});
export const inlineAddressInput = z.object({
  type: z.enum(["BILLING", "DELIVERY", "PHYSICAL", "POSTAL"]).default("BILLING"),
  line1: z.string().trim().max(200).optional().default(""), line2: optionalText,
  city: optionalText, province: optionalText, postalCode: z.string().trim().max(20).optional().nullable(),
  countryCode: z.string().trim().length(2).default("ZA"),
});
export const customerCreateInput = customerInput.extend({
  address: inlineAddressInput.optional(),
  contacts: z.array(inlineContactInput).max(20).optional().default([]),
});
export const supplierCreateInput = supplierInput.extend({
  address: inlineAddressInput.optional(),
  contacts: z.array(inlineContactInput).max(20).optional().default([]),
});

export const manufacturerInput = z.object({ name: z.string().trim().min(2).max(150), code: optionalCode, description: optionalText, active: z.boolean().default(true) });
export const partInput = z.object({
  partNumber: z.string().trim().min(1).max(150), description: z.string().trim().min(2).max(500), manufacturerId: z.string().cuid().optional().nullable(),
  manufacturerPartNumber: optionalText, category: optionalText, unitOfMeasure: z.string().trim().min(1).max(20).default("EA"), notes: z.string().trim().max(5000).optional().nullable(),
  defaultPurchaseCost: money, defaultSellingPrice: money, taxCodeId: z.string().cuid().optional().nullable(),
  // 2026-09-10 — default bin/storage location, added alongside the Parts
  // Catalog -> Stock Levels merge. Optional: a part can be left with no bin
  // assigned, assigned an existing StorageLocation, or (client-side) point
  // at one just created inline.
  binLocationId: z.string().cuid().optional().nullable(),
  reorderMinimum: money, reorderMaximum: money, reorderQuantity: money, active: z.boolean().default(true),
});
export const locationInput = z.object({ code: z.string().trim().min(1).max(50), name: z.string().trim().min(1).max(150), type: z.enum(["STORES","SHELF","BIN","WORKSHOP","PEX_HOLDING","QUARANTINE","RECEIVING","OTHER"]), description: optionalText, parentId: z.string().cuid().optional().nullable(), sortOrder: z.number().int().min(0).max(100000).default(0), active: z.boolean().default(true) });
export const serviceInput = z.object({ code: z.string().trim().min(1).max(50), description: z.string().trim().min(2).max(500), category: optionalText, unitOfMeasure: z.string().trim().min(1).max(20).default("HOUR"), defaultCost: money, defaultSellingPrice: money, taxCodeId: z.string().cuid().optional().nullable(), active: z.boolean().default(true) });
export const taxInput = z.object({ code: z.string().trim().min(1).max(30), description: z.string().trim().min(2).max(200), rate: z.union([z.string(), z.number()]).transform(String).refine((v) => /^\d+(\.\d{1,6})?$/.test(v) && Number(v) <= 1, "Rate must be between 0 and 1."), type: z.enum(["STANDARD","ZERO_RATED","EXEMPT","NON_TAXABLE"]), effectiveFrom: z.coerce.date(), effectiveTo: z.coerce.date().optional().nullable(), active: z.boolean().default(true) }).refine((v) => !v.effectiveTo || v.effectiveTo >= v.effectiveFrom, { message: "End date must follow the effective date.", path: ["effectiveTo"] });
export const termInput = z.object({ type: z.enum(["PAYMENT","QUOTE_VALIDITY","DELIVERY","STANDARD_TEXT"]), code: z.string().trim().min(1).max(30), label: z.string().trim().min(1).max(150), days: z.number().int().min(0).max(3650).optional().nullable(), termsText: z.string().trim().max(10000).optional().nullable(), active: z.boolean().default(true) });
export const sequenceInput = z.object({ type: z.enum(["JOB","PEX_JOB","QUOTE","SALES_ORDER","INVOICE","PAYMENT_RECEIPT","PROCUREMENT_RFQ"]), prefix: z.string().trim().max(20), padding: z.number().int().min(1).max(12), nextValue: z.union([z.string(), z.number().int().positive()]).transform(BigInt), includeFinancialYear: z.boolean().default(false), financialYearStartMonth: z.number().int().min(1).max(12).default(3), active: z.boolean().default(true) });

export const listQuery = z.object({ q: z.string().trim().max(100).default(""), status: z.enum(["all","active","inactive"]).default("active"), page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(25) });
export function normalized(value: string | null | undefined) { return value?.trim().toLocaleUpperCase("en-ZA") || null; }

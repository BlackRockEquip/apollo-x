import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { Prisma, JobStatus, JobType, JobActivityType, AddressType, StorageLocationType, TenantRole } from "@prisma/client";
// Legacy one-time import note:
// This historical importer depends on SheetJS/xlsx tooling, which is intentionally
// not part of the normal runtime dependency tree once the migration has been
// completed. Reinstall the legacy spreadsheet tooling separately before running
// this script again.
import * as XLSX from "xlsx";
import { prisma } from "../src/lib/prisma";
import { BLACK_ROCK_INTERNAL_CODE } from "../src/lib/constants";
import { hashPassword } from "../src/lib/security/passwords";

const ROOT = path.resolve(__dirname, "..");
const LEGACY_ROOT = path.resolve(ROOT, "..", "APOLLO-X-OLD-DEV-REBUILd");
const LEGACY_VENDOR_CSV = path.join(LEGACY_ROOT, "Backend", "data", "vendor-master-import.csv");
const LEGACY_WIP_XLSX = path.join(LEGACY_ROOT, "Backend", "data", "WIP - Workshop.xlsx");

const IMPORT_TAG = "legacy-black-rock-history-v1";
const SYSTEM_EMAIL = "blackrock-importer@example.test";
const SYSTEM_PASSWORD = "BlackRockImporterOnly!2026";

function text(value: unknown) {
  const result = String(value ?? "").trim();
  return result || null;
}

function normalized(value: string) {
  return value.trim().toUpperCase().replace(/\s+/g, " ");
}

function hash(value: string) {
  return crypto.createHash("sha1").update(value).digest("hex");
}

function dateOnly(value: unknown): Date | null {
  if (!value) return null;
  let date: Date | null = null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) date = value;
  else if (typeof value === "number" && Number.isFinite(value)) date = new Date(Date.UTC(1899, 11, 30) + value * 86400000);
  else {
    const parsed = new Date(String(value));
    if (!Number.isNaN(parsed.getTime())) date = parsed;
  }
  if (!date || Number.isNaN(date.getTime())) return null;
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function mapStatus(value: unknown): JobStatus {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return "TO_BE_RECEIVED";
  if (raw.includes("to be collected") || raw === "to collect" || raw.includes("collect from client") || raw.includes("onsite") || raw.includes("on site")) return "TO_BE_COLLECTED";
  if (raw.includes("to come in") || raw.includes("to be received") || raw.includes("to receive") || raw.includes("not received")) return "TO_BE_RECEIVED";
  if (raw.includes("strip")) return "STRIPPING";
  if (raw.includes("await go-ahead") || raw.includes("await go ahead") || raw.includes("awair go-ahead") || raw.includes("awair go ahead") || raw.includes("quoted") || raw.includes("await approval")) return "AWAITING_GO_AHEAD";
  if (raw.includes("quote") || raw.includes("to quote")) return "QUOTE_IN_PROGRESS";
  if (raw.includes("await parts") || raw.includes("await part") || raw.includes("waiting for parts") || raw.includes("waiting parts") || raw.includes("problem")) return "WAITING_FOR_PARTS";
  if (raw.includes("assembl") || raw.includes("build")) return "ASSEMBLY";
  if (raw.includes("test")) return "TESTING";
  if (raw.includes("deliver") || raw.includes("dispatch") || raw.includes("collected") || raw.includes("client collected")) return "TO_BE_DELIVERED";
  if (raw.includes("complete") || raw.includes("done") || raw.includes("invoiced") || raw.includes("delivered") || raw.includes("closed") || raw.includes("unrepaired return") || raw.includes("refund")) return "COMPLETE";
  return "TO_BE_RECEIVED";
}

function mapType(component: string | null, comments: string | null, warrantyClaim: string | null): JobType {
  const blob = `${component ?? ""} ${comments ?? ""}`.toLowerCase();
  if ((warrantyClaim ?? "").toUpperCase() === "Y" || blob.includes("warranty")) return "WARRANTY";
  if (blob.includes("field -") || blob.includes("onsite") || blob.includes("on site") || blob.includes("faultfinding -") || blob.includes("field service")) return "FIELD_SERVICE";
  if (blob.includes("service exchange") || blob.includes("await core")) return "PEX_SUPPLY";
  if (blob.includes("parts supply") || blob.includes("outright")) return "OUTRIGHT_SALE";
  if (blob.includes("partial")) return "PARTIAL_REPAIR";
  return "STANDARD_REPAIR";
}

function parseCsvLine(line: string) {
  const out: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      out.push(current);
      current = "";
    } else current += ch;
  }
  out.push(current);
  return out;
}

function parseCsv(content: string) {
  const lines = content.replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean);
  const headers = parseCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const cols = parseCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, cols[index] ?? ""]));
  });
}

function valueFrom(row: Record<string, unknown>, names: string[]) {
  const entries = Object.entries(row);
  for (const [key, value] of entries) {
    const normalizedKey = key.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
    if (names.includes(normalizedKey)) return value;
  }
  return null;
}

type LegacyJobRow = {
  sourceJobNumber: string;
  sheetName: string;
  rowNumber: number;
  sourceRowKey: string;
  warrantyClaim: string | null;
  warrantyDecision: string | null;
  dateReceived: Date | null;
  customerName: string | null;
  machineMake: string | null;
  machineModel: string | null;
  component: string | null;
  customerReference: string | null;
  linkedJobOrProject: string | null;
  poNumber: string | null;
  originalStatus: string | null;
  reportNumber: string | null;
  serialNumber: string | null;
  quoteNumber: string | null;
  quoteDate: Date | null;
  invoiceNumber: string | null;
  invoiceDate: Date | null;
  completedDate: Date | null;
  deliveryNoteNumber: string | null;
  technician: string | null;
  buildTechnician: string | null;
  salesRep: string | null;
  repairType: string | null;
  comments: string | null;
  sourceColumns: Record<string, string | null>;
  legacyType: JobType;
  mappedStatus: JobStatus;
};

function readLegacyJobs(): LegacyJobRow[] {
  const workbook = XLSX.readFile(LEGACY_WIP_XLSX, { cellDates: true });
  const rows: LegacyJobRow[] = [];
  for (const sheetName of workbook.SheetNames) {
    if (!sheetName.toLowerCase().startsWith("jobs")) continue;
    const sheet = workbook.Sheets[sheetName];
    const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null, raw: true });
    json.forEach((row, index) => {
      const sourceJobNumber = text(valueFrom(row, ["job", "job_", "job_number", "job__"])) ?? text(row["JOB #"]);
      if (!sourceJobNumber || !/^BRE\d+(?:[A-Z]|-\d+)?$/i.test(sourceJobNumber)) return;
      const comments = text(valueFrom(row, ["comments"]));
      const component = text(valueFrom(row, ["component"]));
      const warrantyClaim = text(valueFrom(row, ["warranty_claim"]));
      const sourceColumns = Object.fromEntries(Object.entries(row).map(([key, value]) => [String(key).trim(), text(value)]));
      rows.push({
        sourceJobNumber: sourceJobNumber.toUpperCase(),
        sheetName,
        rowNumber: index + 2,
        sourceRowKey: `${IMPORT_TAG}:${sheetName}:${index + 2}:${sourceJobNumber.toUpperCase()}`,
        warrantyClaim,
        warrantyDecision: text(valueFrom(row, ["warranty_granted_decline", "warranty_granted_declined"])),
        dateReceived: dateOnly(valueFrom(row, ["date_in"])),
        customerName: text(valueFrom(row, ["client"])),
        machineMake: text(valueFrom(row, ["make"])),
        machineModel: text(valueFrom(row, ["model"])),
        component,
        customerReference: text(valueFrom(row, ["customer_reference"])),
        linkedJobOrProject: text(valueFrom(row, ["linked_job_project", "linked_job"])),
        poNumber: text(valueFrom(row, ["po"])) ?? text(valueFrom(row, ["po_status"])),
        originalStatus: text(valueFrom(row, ["status"])),
        reportNumber: text(valueFrom(row, ["report_number"])),
        serialNumber: text(valueFrom(row, ["serial_number"])),
        quoteNumber: text(valueFrom(row, ["quote"])),
        quoteDate: dateOnly(valueFrom(row, ["quote_date"])),
        invoiceNumber: text(valueFrom(row, ["invoice"])),
        invoiceDate: dateOnly(valueFrom(row, ["invoice_date"])),
        completedDate: dateOnly(valueFrom(row, ["completed_date"])),
        deliveryNoteNumber: text(valueFrom(row, ["del_note_number"])),
        technician: text(valueFrom(row, ["mechanic_strip", "technician"])),
        buildTechnician: text(valueFrom(row, ["mechanic_assemble"])),
        salesRep: text(valueFrom(row, ["sales_rep"])),
        repairType: text(valueFrom(row, ["repair_type"])),
        comments,
        sourceColumns,
        legacyType: mapType(component, comments, warrantyClaim),
        mappedStatus: mapStatus(valueFrom(row, ["status"])),
      });
    });
  }
  return rows;
}

async function ensureImporterUser(companyId: string) {
  const email = SYSTEM_EMAIL;
  const user = await prisma.userIdentity.upsert({
    where: { email },
    update: { active: true },
    create: { email, displayName: "Black Rock Historical Importer", passwordHash: await hashPassword(SYSTEM_PASSWORD) },
  });
  await prisma.companyMembership.upsert({
    where: { userId_companyId: { userId: user.id, companyId } },
    update: { status: "ACTIVE", role: TenantRole.COMPANY_ADMIN },
    create: { userId: user.id, companyId, status: "ACTIVE", role: TenantRole.COMPANY_ADMIN },
  });
  return user;
}

async function ensureStorageLocation(companyId: string) {
  return prisma.storageLocation.upsert({
    where: { companyId_codeNormalized: { companyId, codeNormalized: normalized("LEGACY-HOLDING") } },
    update: { active: true },
    create: { companyId, code: "LEGACY-HOLDING", codeNormalized: normalized("LEGACY-HOLDING"), name: "Legacy Holding", type: StorageLocationType.OTHER },
  });
}

async function ensureSupplier(companyId: string, row: Record<string, string>) {
  const name = text(row["Company Name"]) ?? text(row["Display Name"]) ?? text(row["Contact Name"]);
  if (!name) return null;
  const supplier = await prisma.supplier.upsert({
    where: { companyId_accountCodeNormalized: { companyId, accountCodeNormalized: normalized(`LEGACY-SUP-${row["Contact ID"] || name}`) } },
    update: {
      name,
      mainTelephone: text(row["Phone"]),
      mainEmail: text(row["EmailID"]),
      notes: [text(row["Notes"]), text(row["Source"]), row["Contact ID"] ? `Legacy contact id: ${row["Contact ID"]}` : null].filter(Boolean).join(" | ") || null,
      active: (text(row["Status"]) ?? "Active").toLowerCase() === "active",
    },
    create: {
      companyId,
      name,
      nameNormalized: normalized(name),
      accountCode: `LEGACY-SUP-${row["Contact ID"] || hash(name).slice(0, 8)}`,
      accountCodeNormalized: normalized(`LEGACY-SUP-${row["Contact ID"] || hash(name).slice(0, 8)}`),
      mainTelephone: text(row["Phone"]),
      mainEmail: text(row["EmailID"]),
      website: text(row["Website"]),
      vatNumber: text(row["Tax Registration Number"]),
      registrationNumber: text(row["CF.Company Reg:"]),
      notes: [text(row["Notes"]), text(row["Source"]), row["Contact ID"] ? `Legacy contact id: ${row["Contact ID"]}` : null].filter(Boolean).join(" | ") || null,
      active: (text(row["Status"]) ?? "Active").toLowerCase() === "active",
      currencyCode: text(row["Currency Code"]) ?? "ZAR",
    },
  });

  const contactName = text(row["Billing Attention"]) ?? text(row["Shipping Attention"]) ?? ([text(row["First Name"]), text(row["Last Name"])].filter(Boolean).join(" ") || null);
  if (contactName) {
    const [firstName, ...rest] = contactName.split(/\s+/);
    const existingContact = await prisma.supplierContact.findFirst({ where: { companyId, supplierId: supplier.id, isPrimary: true } });
    if (existingContact) {
      await prisma.supplierContact.update({ where: { id: existingContact.id }, data: { firstName, lastName: rest.join(" ") || null, telephone: text(row["Phone"]), mobile: text(row["MobilePhone"]), email: text(row["EmailID"]), isPrimary: true, active: true } });
    } else {
      await prisma.supplierContact.create({ data: { companyId, supplierId: supplier.id, firstName, lastName: rest.join(" ") || null, telephone: text(row["Phone"]), mobile: text(row["MobilePhone"]), email: text(row["EmailID"]), isPrimary: true } });
    }
  }

  const billingAddress = [text(row["Billing Address"]), text(row["Billing Street2"]), text(row["Billing City"]), text(row["Billing State"]), text(row["BillingCode"]), text(row["Billing Country"])].filter(Boolean);
  if (billingAddress.length > 0) {
    const line1 = billingAddress.slice(0, 2).join(", ");
    const existingAddress = await prisma.supplierAddress.findFirst({ where: { companyId, supplierId: supplier.id, type: AddressType.BILLING, isPrimary: true } });
    if (existingAddress) {
      await prisma.supplierAddress.update({ where: { id: existingAddress.id }, data: { line1, line2: null, city: text(row["Billing City"]), province: text(row["Billing State"]), postalCode: text(row["Billing Code"]), countryCode: "ZA", type: AddressType.BILLING, isPrimary: true, active: true } });
    } else {
      await prisma.supplierAddress.create({ data: { companyId, supplierId: supplier.id, type: AddressType.BILLING, line1, city: text(row["Billing City"]), province: text(row["Billing State"]), postalCode: text(row["Billing Code"]), countryCode: "ZA", isPrimary: true } });
    }
  }
  return supplier;
}

async function ensureCustomer(companyId: string, name: string | null) {
  if (!name) return null;
  const nameNormalized = normalized(name);
  const existing = await prisma.customer.findFirst({ where: { companyId, nameNormalized } });
  if (existing) {
    return prisma.customer.update({ where: { id: existing.id }, data: { name, active: true } });
  }
  return prisma.customer.create({
    data: {
      companyId,
      name,
      nameNormalized,
      accountCode: `LEGACY-CUST-${hash(name).slice(0, 10)}`,
      accountCodeNormalized: normalized(`LEGACY-CUST-${hash(name).slice(0, 10)}`),
      active: true,
      notes: "Imported from legacy Black Rock WIP workbook.",
    },
  });
}

function buildLegacyDescription(row: LegacyJobRow) {
  return [row.component, row.machineMake, row.machineModel, row.repairType ? `Repair type: ${row.repairType}` : null].filter(Boolean).join(" | ") || null;
}

function buildLegacyRelationshipNotes(row: LegacyJobRow) {
  return [
    row.linkedJobOrProject ? `Linked Job / Project: ${row.linkedJobOrProject}` : null,
    row.salesRep ? `Sales Rep: ${row.salesRep}` : null,
    row.warrantyClaim ? `Warranty Claim: ${row.warrantyClaim}` : null,
    row.warrantyDecision ? `Warranty Granted / Declined: ${row.warrantyDecision}` : null,
    row.originalStatus ? `Legacy original status: ${row.originalStatus}` : null,
  ].filter(Boolean).join("\n") || null;
}

async function importPartsFromJobs(tx: Prisma.TransactionClient, companyId: string, locationId: string, rows: LegacyJobRow[]) {
  const keyed = new Map<string, { description: string; manufacturer: string | null; remarks: string[] }>();
  for (const row of rows) {
    const matches = (row.comments ?? "").match(/\b\d{2,4}[A-Z]?[- ]\d{2,4}[A-Z0-9-]*\b/g);
    if (!matches) continue;
    for (const raw of matches) {
      const partNumber = raw.replace(/\s+/g, "").toUpperCase();
      if (!keyed.has(partNumber)) keyed.set(partNumber, { description: `Legacy referenced part from ${row.sourceJobNumber}`, manufacturer: row.machineMake, remarks: [] });
      keyed.get(partNumber)!.remarks.push(row.sourceJobNumber);
    }
  }
  let count = 0;
  for (const [partNumber, value] of keyed) {
    const manufacturer = value.manufacturer ? await tx.manufacturer.upsert({
      where: { companyId_nameNormalized: { companyId, nameNormalized: normalized(value.manufacturer) } },
      update: { active: true },
      create: { companyId, name: value.manufacturer, nameNormalized: normalized(value.manufacturer) },
    }) : null;
    const part = await tx.part.upsert({
      where: { companyId_partNumberNormalized: { companyId, partNumberNormalized: normalized(partNumber) } },
      update: { active: true },
      create: {
        companyId,
        partNumber,
        partNumberNormalized: normalized(partNumber),
        description: value.description,
        manufacturerId: manufacturer?.id ?? null,
        notes: `Legacy inferred part reference. Seen on jobs: ${Array.from(new Set(value.remarks)).slice(0, 20).join(", ")}`,
      },
    });
    await tx.stockBalance.upsert({
      where: { companyId_partId_locationId: { companyId, partId: part.id, locationId } },
      update: {},
      create: { companyId, partId: part.id, locationId, quantityOnHand: new Prisma.Decimal(0), quantityReserved: new Prisma.Decimal(0) },
    });
    count += 1;
  }
  return count;
}

async function main() {
  if (!fs.existsSync(LEGACY_VENDOR_CSV) || !fs.existsSync(LEGACY_WIP_XLSX)) throw new Error("Legacy artifacts not found.");

  const company = await prisma.company.findUnique({ where: { internalCode: BLACK_ROCK_INTERNAL_CODE } });
  if (!company) throw new Error("BLACK_ROCK_EQUIPMENT company not found. Run seed first.");

  const importer = await ensureImporterUser(company.id);
  const legacyLocation = await ensureStorageLocation(company.id);

  const supplierRows = parseCsv(fs.readFileSync(LEGACY_VENDOR_CSV, "utf8"));
  let suppliersImported = 0;
  for (const row of supplierRows) {
    const name = text(row["Company Name"] ?? row["Display Name"] ?? row["Contact Name"]);
    if (!name) continue;
    await ensureSupplier(company.id, row as Record<string, string>);
    suppliersImported += 1;
  }

  const jobRows = readLegacyJobs();
  const importerOwnedExisting = await prisma.jobActivity.findMany({
    where: { metadata: { path: ["importTag"], equals: IMPORT_TAG } },
    select: { id: true, jobId: true, metadata: true },
  });

  let customersCreated = 0;
  let jobsCreated = 0;
  let notesCreated = 0;
  const seenCustomers = new Set<string>();
  const importerOwnedBySourceRowKey = new Map<string, { activityId: string; jobId: string }>();
  importerOwnedExisting.forEach((activity) => {
    const metadata = activity.metadata as Prisma.JsonObject | null;
    const sourceRowKey = typeof metadata?.sourceRowKey === "string"
      ? metadata.sourceRowKey
      : (typeof metadata?.sheetName === "string" && typeof metadata?.rowNumber === "number" && typeof metadata?.sourceJobNumber === "string"
        ? `${IMPORT_TAG}:${metadata.sheetName}:${metadata.rowNumber}:${metadata.sourceJobNumber}`
        : null);
    if (sourceRowKey) importerOwnedBySourceRowKey.set(sourceRowKey, { activityId: activity.id, jobId: activity.jobId });
  });

  for (const row of jobRows) {
    await prisma.$transaction(async (tx) => {
      const customer = await ensureCustomer(company.id, row.customerName);
      if (customer && !seenCustomers.has(customer.id)) {
        seenCustomers.add(customer.id);
        customersCreated += 1;
      }

      const naturalKey = row.sourceRowKey;
      const importerOwned = importerOwnedBySourceRowKey.get(naturalKey);
      const existingByUniqueJobNumber = await tx.job.findUnique({ where: { jobNumber: row.sourceJobNumber } });
      const existing = importerOwned
        ? await tx.job.findUnique({ where: { id: importerOwned.jobId } })
        : existingByUniqueJobNumber ?? await tx.job.findFirst({ where: { companyId: company.id, draftNumber: `LEGACY-${row.sourceJobNumber}-${String(row.rowNumber).padStart(4, "0")}` } });
      const descriptionLines = [
        buildLegacyDescription(row),
        row.quoteNumber ? `Legacy quote: ${row.quoteNumber}` : null,
        row.invoiceNumber ? `Legacy invoice: ${row.invoiceNumber}` : null,
        row.deliveryNoteNumber ? `Legacy delivery note: ${row.deliveryNoteNumber}` : null,
        row.reportNumber ? `Legacy report: ${row.reportNumber}` : null,
        row.originalStatus ? `Legacy original status: ${row.originalStatus}` : null,
      ].filter(Boolean);
      const description = descriptionLines.join("\n") || `Imported historical job ${row.sourceJobNumber}.`;

      let job = existing;
      if (!job) {
        job = await tx.job.create({
          data: {
            companyId: company.id,
            customerId: customer?.id ?? importerCustomer.id,
            draftNumber: `LEGACY-${row.sourceJobNumber}-${String(row.rowNumber).padStart(4, "0")}`,
            jobNumber: row.sourceJobNumber,
            status: row.mappedStatus,
            type: row.legacyType,
            customerReference: row.customerReference,
            customerPo: row.poNumber,
            dateReceived: row.dateReceived,
            machineModel: row.machineModel,
            machineSerial: null,
            component: row.component,
            componentType: row.repairType ?? row.component,
            componentSerial: row.serialNumber,
            description,
            relationshipNotes: [naturalKey, buildLegacyRelationshipNotes(row), `Imported from legacy workbook ${row.sheetName} row ${row.rowNumber}. PEX canonical mapping intentionally not inferred from legacy spreadsheet.`].filter(Boolean).join("\n"),
            closingOutcome: row.mappedStatus === "COMPLETE" ? "Imported legacy completion" : null,
            closingNote: row.completedDate ? `Legacy completed date: ${row.completedDate.toISOString().slice(0, 10)}` : null,
            closedAt: row.completedDate,
            createdById: importer.id,
            updatedById: importer.id,
          },
        });
        jobsCreated += 1;
      } else {
        job = await tx.job.update({
          where: { id: job.id },
          data: {
            jobNumber: row.sourceJobNumber,
            draftNumber: `LEGACY-${row.sourceJobNumber}-${String(row.rowNumber).padStart(4, "0")}`,
            customerId: customer?.id ?? importerCustomer.id,
            status: row.mappedStatus,
            type: row.legacyType,
            customerReference: row.customerReference,
            customerPo: row.poNumber,
            dateReceived: row.dateReceived,
            machineModel: row.machineModel,
            machineSerial: null,
            component: row.component,
            componentType: row.repairType ?? row.component,
            componentSerial: row.serialNumber,
            description,
            relationshipNotes: [naturalKey, buildLegacyRelationshipNotes(row), `Imported from legacy workbook ${row.sheetName} row ${row.rowNumber}. PEX canonical mapping intentionally not inferred from legacy spreadsheet.`].filter(Boolean).join("\n"),
            closingOutcome: row.mappedStatus === "COMPLETE" ? "Imported legacy completion" : null,
            closingNote: row.completedDate ? `Legacy completed date: ${row.completedDate.toISOString().slice(0, 10)}` : null,
            closedAt: row.completedDate,
            updatedById: importer.id,
          },
        });
      }

      if (row.component || row.serialNumber) {
        const existingComponent = await tx.jobComponent.findFirst({ where: { companyId: company.id, jobId: job.id } });
        if (existingComponent) {
          await tx.jobComponent.update({ where: { id: existingComponent.id }, data: { component: row.component ?? "Unspecified legacy component", componentType: row.legacyType === "PEX_SUPPLY" ? "LEGACY_PEX_CONTEXT" : row.repairType ?? null, componentSerial: row.serialNumber, componentPartNumber: null } });
        } else {
          await tx.jobComponent.create({ data: { companyId: company.id, jobId: job.id, component: row.component ?? "Unspecified legacy component", componentType: row.legacyType === "PEX_SUPPLY" ? "LEGACY_PEX_CONTEXT" : row.repairType ?? null, componentSerial: row.serialNumber, componentPartNumber: null } });
        }
      }

      const noteText = [
        `Legacy source workbook: ${row.sheetName} row ${row.rowNumber}`,
        `Legacy source row key: ${row.sourceRowKey}`,
        `Original job identifier: ${row.sourceJobNumber}`,
        row.customerName ? `Legacy client/customer: ${row.customerName}` : null,
        row.linkedJobOrProject ? `Linked Job / Project: ${row.linkedJobOrProject}` : null,
        row.originalStatus ? `Original status: ${row.originalStatus}` : null,
        row.technician ? `Legacy technician: ${row.technician}` : null,
        row.buildTechnician ? `Legacy assemble technician: ${row.buildTechnician}` : null,
        row.salesRep ? `Legacy sales rep: ${row.salesRep}` : null,
        row.repairType ? `Legacy repair type: ${row.repairType}` : null,
        row.warrantyDecision ? `Warranty granted / declined: ${row.warrantyDecision}` : null,
        row.quoteDate ? `Quote date: ${row.quoteDate.toISOString().slice(0, 10)}` : null,
        row.invoiceDate ? `Invoice date: ${row.invoiceDate.toISOString().slice(0, 10)}` : null,
        row.completedDate ? `Completed date: ${row.completedDate.toISOString().slice(0, 10)}` : null,
        `PEX legacy handling: ${row.legacyType === "PEX_SUPPLY" ? "Legacy PEX context preserved only; no canonical PexStockUnit/PexSupplyLink inferred." : "No canonical PEX inference required."}`,
        row.comments,
      ].filter(Boolean).join("\n");

      const noteKey = `${job.id}:${hash(noteText)}`;
      const existingNote = await tx.jobNote.findFirst({ where: { companyId: company.id, jobId: job.id, note: { contains: `Legacy source workbook: ${row.sheetName} row ${row.rowNumber}` } } });
      if (!existingNote) {
        await tx.jobNote.create({ data: { companyId: company.id, jobId: job.id, note: noteText, createdById: importer.id } });
        notesCreated += 1;
      }
      const existingActivity = importerOwned?.activityId
        ? await tx.jobActivity.findUnique({ where: { id: importerOwned.activityId } })
        : await tx.jobActivity.findFirst({ where: { companyId: company.id, jobId: job.id, type: JobActivityType.JOB_CREATED } });
      if (!existingActivity) {
        await tx.jobActivity.create({ data: { companyId: company.id, jobId: job.id, type: JobActivityType.JOB_CREATED, description: `Imported legacy Black Rock job ${row.sourceJobNumber} from ${row.sheetName} row ${row.rowNumber}.`, metadata: { importTag: IMPORT_TAG, sourceRowKey: row.sourceRowKey, sourceJobNumber: row.sourceJobNumber, sheetName: row.sheetName, rowNumber: row.rowNumber, legacyClient: row.customerName, legacyLinkedJobOrProject: row.linkedJobOrProject, legacyColumns: row.sourceColumns, mappingClassifications: { customers: "SAFE_DIRECT", jobs: "SAFE_TRANSFORM", components: "SAFE_TRANSFORM", notes: "SAFE_TRANSFORM", pex: row.legacyType === "PEX_SUPPLY" ? "LEGACY_HISTORY_ONLY" : "SAFE_TRANSFORM" } }, actorId: importer.id } });
      } else {
        await tx.jobActivity.update({ where: { id: existingActivity.id }, data: { description: `Imported legacy Black Rock job ${row.sourceJobNumber} from ${row.sheetName} row ${row.rowNumber}.`, metadata: { importTag: IMPORT_TAG, sourceRowKey: row.sourceRowKey, sourceJobNumber: row.sourceJobNumber, sheetName: row.sheetName, rowNumber: row.rowNumber, legacyClient: row.customerName, legacyLinkedJobOrProject: row.linkedJobOrProject, legacyColumns: row.sourceColumns, mappingClassifications: { customers: "SAFE_DIRECT", jobs: "SAFE_TRANSFORM", components: "SAFE_TRANSFORM", notes: "SAFE_TRANSFORM", pex: row.legacyType === "PEX_SUPPLY" ? "LEGACY_HISTORY_ONLY" : "SAFE_TRANSFORM" } }, actorId: importer.id } });
      }
      void noteKey;
    });
  }

  const inferredParts = await prisma.$transaction((tx) => importPartsFromJobs(tx, company.id, legacyLocation.id, jobRows));
  const summary = { customersCreated, jobsCreated, notesCreated, inferredParts };

  const counts = {
    suppliers: await prisma.supplier.count({ where: { companyId: company.id } }),
    customers: await prisma.customer.count({ where: { companyId: company.id } }),
    jobs: await prisma.job.count({ where: { companyId: company.id } }),
    notes: await prisma.jobNote.count({ where: { companyId: company.id } }),
    activities: await prisma.jobActivity.count({ where: { companyId: company.id } }),
    parts: await prisma.part.count({ where: { companyId: company.id } }),
  };

  console.log(JSON.stringify({
    importTag: IMPORT_TAG,
    evidence: {
      legacyDatabaseDumpPresent: false,
      legacyVendorCsvPresent: true,
      legacyWipWorkbookPresent: true,
      importedBlackRockRows: jobRows.length,
    },
    imported: { suppliersProcessed: suppliersImported, ...summary },
    totals: counts,
    mapping: {
      customers: "SAFE_DIRECT",
      suppliers: "SAFE_DIRECT",
      manufacturers_brands: "SAFE_TRANSFORM",
      parts: "SAFE_TRANSFORM",
      storage_locations: "SAFE_TRANSFORM",
      inventory_quantities_state: "AMBIGUOUS_DO_NOT_IMPORT",
      jobs: "SAFE_TRANSFORM",
      wip_status: "SAFE_TRANSFORM",
      components: "SAFE_TRANSFORM",
      notes: "SAFE_TRANSFORM",
      activities_history: "SAFE_TRANSFORM",
      job_parts: "AMBIGUOUS_DO_NOT_IMPORT",
      job_kits: "AMBIGUOUS_DO_NOT_IMPORT",
      pex: "LEGACY_HISTORY_ONLY",
    },
  }, null, 2));
}

main().finally(async () => {
  await prisma.$disconnect();
});
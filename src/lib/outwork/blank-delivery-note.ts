import { z } from "zod";
import type { RequestContext } from "@/lib/auth/context-types";
import { requireModule, requireTenantPermission } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";
import { StockError } from "@/lib/http/errors";
import { renderDocumentPdf } from "@/lib/documents/pdf";
import { buildBlankDeliveryNoteSpec, type BlankDeliveryNoteParty } from "@/lib/documents/job-specs";
import { getDocumentTitlesForCompany } from "@/lib/documents/titles-service";
import { getCompanyLetterhead } from "@/lib/master-data/company-settings-service";
import { sanitizeSegment } from "@/lib/attachments/blob-store";

// 2026-10-22, user request: Outwork page > "Blank Delivery Note": pick a customer or supplier, type the job number and the PO
// reference, list what is being delivered, add notes - and get a delivery note PDF with the signature fields. Nothing is
// stored: the PDF is handed back to the browser to print or save. The job number and PO reference are typed in by the user
// (the PO reference is deliberately NOT looked up from any job).
export const blankDeliveryNoteInput = z.object({
  partyKind: z.enum(["CUSTOMER", "SUPPLIER"]),
  partyId: z.string().trim().min(1).max(60),
  jobNumber: z.string().trim().min(1, "Enter the job number.").max(60),
  poReference: z.string().trim().min(1, "Enter the PO reference.").max(100),
  deliveryDate: z.string().trim().max(10).optional(),
  items: z.array(z.object({ description: z.string().trim().max(500), quantity: z.string().trim().max(20) })).max(60),
  notes: z.string().max(5000).optional(),
});

const ADDRESS_SELECT = { where: { active: true }, orderBy: [{ isPrimary: "desc" as const }, { createdAt: "asc" as const }], take: 1, select: { line1: true, line2: true, city: true, province: true, postalCode: true } };
function addressLines(address: { line1: string; line2: string | null; city: string | null; province: string | null; postalCode: string | null } | undefined) {
  if (!address) return [];
  // Street lines on their own, then "City, Province, Postal code" on one line.
  const area = [address.city, address.province, address.postalCode].filter((v): v is string => Boolean(v && v.trim())).join(", ");
  return [address.line1, address.line2, area].filter((v): v is string => Boolean(v && v.trim()));
}

export async function renderBlankDeliveryNote(ctx: RequestContext, raw: unknown) {
  const input = blankDeliveryNoteInput.parse(raw);
  requireModule(ctx, "OUTWORK", "READ");
  requireTenantPermission(ctx, "JOBS_VIEW");
  requireTenantPermission(ctx, input.partyKind === "CUSTOMER" ? "CUSTOMERS_VIEW" : "SUPPLIERS_VIEW");
  const companyId = ctx.companyId!;

  let party: BlankDeliveryNoteParty | null = null;
  if (input.partyKind === "CUSTOMER") {
    const row = await prisma.customer.findFirst({ where: { id: input.partyId, companyId }, select: { name: true, tradingName: true, vatNumber: true, mainTelephone: true, addresses: ADDRESS_SELECT } });
    if (row) party = { kind: "CUSTOMER", name: row.name, tradingName: row.tradingName, addressLines: addressLines(row.addresses[0]), vatNumber: row.vatNumber, telephone: row.mainTelephone };
  } else {
    const row = await prisma.supplier.findFirst({ where: { id: input.partyId, companyId }, select: { name: true, vatNumber: true, mainTelephone: true, addresses: ADDRESS_SELECT } });
    if (row) party = { kind: "SUPPLIER", name: row.name, addressLines: addressLines(row.addresses[0]), vatNumber: row.vatNumber, telephone: row.mainTelephone };
  }
  if (!party) throw new Error("NOT_FOUND");
  if (!input.items.some((item) => item.description || item.quantity)) throw new StockError("NO_ITEMS", "Add at least one item to deliver.");

  const titles = await getDocumentTitlesForCompany(companyId);
  const title = titles.JOB_DELIVERY_NOTE;
  const date = input.deliveryDate && !Number.isNaN(new Date(input.deliveryDate).getTime()) ? input.deliveryDate : new Date().toISOString().slice(0, 10);
  const spec = buildBlankDeliveryNoteSpec({ title, party, jobNumber: input.jobNumber, poReference: input.poReference, deliveryDate: date, items: input.items, notes: input.notes });
  const letterhead = await getCompanyLetterhead(ctx);
  const pdf = await renderDocumentPdf(spec, letterhead);
  const fileName = `${sanitizeSegment(`${input.jobNumber} - ${title} - ${party.name}`)}.pdf`;
  return { fileName, mimeType: "application/pdf", contentBase64: Buffer.from(pdf).toString("base64") };
}

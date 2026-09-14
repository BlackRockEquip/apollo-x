import { z } from "zod";

const optionalText = z.string().trim().max(2000).optional().nullable();

// fileName/mimeType/contentBase64 travel together or not at all — reused
// (as a shape, not a schema instance — zod objects aren't composable via
// spread when a .refine() is layered on afterwards) by every input below
// that accepts an optional outbound attachment. Added 2026-09-14 at the
// user's request ("add attachment to RFQ field ... an attachment can be
// sent with"). This is the file attached when a request is SENT OUT to a
// supplier (a drawing, spec sheet or photo) — distinct from
// rfqQuoteRecordInput below, which is the supplier's quote file coming
// back in the other direction.
const attachmentFields = {
  attachmentFileName: z.string().trim().min(1).max(160).optional().nullable(),
  attachmentMimeType: z.string().trim().min(3).max(120).optional().nullable(),
  attachmentContentBase64: z.string().min(4).optional().nullable(),
};
function requireAttachmentFieldsTogether(v: { attachmentFileName?: string | null; attachmentMimeType?: string | null; attachmentContentBase64?: string | null }) {
  return (v.attachmentFileName && v.attachmentMimeType && v.attachmentContentBase64) || (!v.attachmentFileName && !v.attachmentMimeType && !v.attachmentContentBase64);
}
const attachmentRefineOptions = { message: "attachmentFileName, attachmentMimeType and attachmentContentBase64 must all be provided together, or all left out." };

export const rfqRequestInput = z
  .object({
    supplierId: z.string().cuid(),
    // Defaults on — matches ModApp's default behavior (Send RFQ email now,
    // uncheck for a supplier who doesn't take email RFQs). False routes
    // through the SKIPPED path in requestRfqFromSupplier with no send
    // attempt at all.
    sendEmail: z.boolean().default(true),
    ...attachmentFields,
  })
  .refine(requireAttachmentFieldsTogether, attachmentRefineOptions);

// New-supplier form on the RFQ panel — creates a real Supplier record
// (companyId comes from the request context, not the client) and then
// requests a quote from it in one step, mirroring ModApp's
// addSupplierAndSendRfq/addSupplierWithoutSendingRfq.
export const rfqNewSupplierRequestInput = z
  .object({
    supplierName: z.string().trim().min(2).max(200),
    supplierEmail: z.string().trim().email().optional().nullable().or(z.literal("")),
    sendEmail: z.boolean().default(true),
    ...attachmentFields,
  })
  .refine(requireAttachmentFieldsTogether, attachmentRefineOptions);

export const rfqResendInput = z.object({}).optional();

// fileName/mimeType/contentBase64 travel together or not at all — a quote
// can be recorded with notes only (e.g. pricing that came in by phone),
// same as ModApp's RfqStatus.SKIPPED suppliers still getting priced.
export const rfqQuoteRecordInput = z
  .object({
    fileName: z.string().trim().min(1).max(160).optional().nullable(),
    mimeType: z.string().trim().min(3).max(120).optional().nullable(),
    contentBase64: z.string().min(4).optional().nullable(),
    notes: optionalText,
  })
  .refine(
    (v) => (v.fileName && v.mimeType && v.contentBase64) || (!v.fileName && !v.mimeType && !v.contentBase64),
    { message: "fileName, mimeType and contentBase64 must all be provided together, or all left out." },
  );

export const rfqQuoteLineInput = z.object({
  partLineId: z.string().cuid(),
  unitPrice: z.coerce.number().nonnegative().optional().nullable(),
  available: z.boolean().default(true),
  notes: optionalText,
});

export const rfqQuoteLinesSaveInput = z.object({
  lines: z.array(rfqQuoteLineInput).min(1),
});

export const rfqPreferredInput = z.object({
  partLineId: z.string().cuid(),
  rfqQuoteId: z.string().cuid(),
});

// General RFQs — added 2026-09-14 for the Suppliers screen's RFQ tab "Add
// RFQ" button, for the case where the user doesn't pick a job (see
// GeneralRfqRequest in schema.prisma). When the button is used WITH a job
// selected the existing job-linked path (rfqRequestInput above, via
// requestRfqFromSupplier) is used instead — this input is only for the
// job-less case.
export const generalRfqCreateInput = z
  .object({
    supplierId: z.string().cuid(),
    partsDescription: z.string().trim().min(2).max(2000),
    quantityOutstanding: z.coerce.number().int().nonnegative().optional().nullable(),
    status: z.enum(["SENT", "RECEIVED", "SKIPPED"]).default("SENT"),
    notes: optionalText,
    ...attachmentFields,
  })
  .refine(requireAttachmentFieldsTogether, attachmentRefineOptions);

export const generalRfqUpdateInput = z.object({
  partsDescription: z.string().trim().min(2).max(2000).optional(),
  quantityOutstanding: z.coerce.number().int().nonnegative().optional().nullable(),
  status: z.enum(["SENT", "RECEIVED", "SKIPPED"]).optional(),
  notes: optionalText,
});

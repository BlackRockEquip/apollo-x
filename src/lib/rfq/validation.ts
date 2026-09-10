import { z } from "zod";

const optionalText = z.string().trim().max(2000).optional().nullable();

export const rfqRequestInput = z.object({
  supplierId: z.string().cuid(),
  // Defaults on — matches ModApp's default behavior (Send RFQ email now,
  // uncheck for a supplier who doesn't take email RFQs). False routes
  // through the SKIPPED path in requestRfqFromSupplier with no send
  // attempt at all.
  sendEmail: z.boolean().default(true),
});

// New-supplier form on the RFQ panel — creates a real Supplier record
// (companyId comes from the request context, not the client) and then
// requests a quote from it in one step, mirroring ModApp's
// addSupplierAndSendRfq/addSupplierWithoutSendingRfq.
export const rfqNewSupplierRequestInput = z.object({
  supplierName: z.string().trim().min(2).max(200),
  supplierEmail: z.string().trim().email().optional().nullable().or(z.literal("")),
  sendEmail: z.boolean().default(true),
});

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

import { z } from "zod";

// 2026-11-25 — Commissions: what the screens may send. Money is ex VAT, in the company currency; dates are "YYYY-MM-DD".

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date like 2026-11-25").refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)), "That is not a real date");
const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Use a month like 2026-11");
const amount = z.coerce.number().finite().min(-1_000_000_000).max(1_000_000_000);
const positive = z.coerce.number().finite().min(0).max(1_000_000_000);
const optionalText = (max: number) => z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? null : v), z.string().trim().max(max).nullable().optional());
// A rate is sent as a percentage (15 = 15%) and stored as a fraction (0.15).
const ratePercent = z.coerce.number().finite().min(0).max(100);

export const commissionLineInput = z.object({
  salesRepresentativeId: z.string().min(1),
  jobId: z.string().min(1).nullable().optional(),
  jobReference: z.string().trim().min(1, "Enter the job number").max(80),
  description: optionalText(500),
  fuelCharge: positive.default(0),
  otherExpenses: positive.default(0),
  otherExpensesNote: optionalText(300),
  rateOverridePercent: ratePercent.nullable().optional(),
  noCommission: z.boolean().optional().default(false),
  notes: optionalText(2000),
  invoices: z.array(z.object({
    invoiceNumber: z.string().trim().min(1, "Enter the invoice number").max(80),
    invoicedOn: isoDate,
    amountExVat: amount,
    clientPaidOn: isoDate.nullable().optional(),
  })).min(1, "Add at least one invoice").max(40),
  costs: z.array(z.object({
    description: optionalText(200),
    amount,
  })).max(100).default([]),
});
export type CommissionLineInput = z.infer<typeof commissionLineInput>;

export const repSettingInput = z.object({
  ratePercent,
  monthlyTarget: positive,
});

export const fuelInput = z.object({
  salesRepresentativeId: z.string().min(1),
  month,
  // null or 0 clears the month.
  amount: positive.nullable(),
});

export const payoutInput = z.object({
  salesRepresentativeId: z.string().min(1),
  month,
  amount: z.coerce.number().finite().gt(0, "Enter the amount paid").max(1_000_000_000),
  paidOn: isoDate,
  note: optionalText(300),
});

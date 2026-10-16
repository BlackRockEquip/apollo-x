import type { DocumentSequenceType, Prisma, PrismaClient } from "@prisma/client";

// 2026-10-16, user request: "Document numbering not allowing me to add new
// sequence (i think it will be better to already include default values)".
// Every company now starts with one sequence per document type, so there is
// nothing to add by hand - an admin just edits the prefix / next number.
// New companies get them on creation; for any company that is missing one
// (older companies, or one that was deleted) the Document numbering tab and
// the number allocator create the missing ones on first use.
export const DEFAULT_SEQUENCES: Array<{ type: DocumentSequenceType; prefix: string; padding: number; label: string }> = [
  { type: "JOB", prefix: "J", padding: 5, label: "Job" },
  { type: "PEX_JOB", prefix: "PEX", padding: 5, label: "PEX Job" },
  { type: "QUOTE", prefix: "Q", padding: 5, label: "Quote" },
  { type: "SALES_ORDER", prefix: "SO", padding: 5, label: "Sales Order" },
  { type: "INVOICE", prefix: "INV", padding: 5, label: "Invoice" },
  { type: "PAYMENT_RECEIPT", prefix: "PR", padding: 5, label: "Payment Receipt" },
  { type: "PROCUREMENT_RFQ", prefix: "RFQ", padding: 5, label: "Procurement Request" },
];

type Db = Prisma.TransactionClient | PrismaClient;

/** Creates any of the default sequences the company does not have yet. Never touches an existing one. Returns how many were created. */
export async function ensureDefaultSequences(db: Db, companyId: string, onlyTypes?: DocumentSequenceType[]): Promise<number> {
  const wanted = DEFAULT_SEQUENCES.filter((d) => !onlyTypes || onlyTypes.includes(d.type));
  const existing = await db.documentNumberSequence.findMany({ where: { companyId }, select: { type: true } });
  const have = new Set(existing.map((row) => row.type));
  const missing = wanted.filter((d) => !have.has(d.type));
  if (missing.length === 0) return 0;
  const created = await db.documentNumberSequence.createMany({
    data: missing.map((d) => ({ companyId, type: d.type, prefix: d.prefix, padding: d.padding, nextValue: BigInt(1), active: true })),
    skipDuplicates: true,
  });
  return created.count;
}

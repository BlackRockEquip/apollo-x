import { prisma } from "@/lib/prisma";
import { buildJobFieldValues, formatEmailDate } from "@/lib/email-template-fields";

// Where the values for the Settings > Templates fields come from when an email is actually sent (the field list itself, the sample
// values and the wording live in email-template-fields.ts, which the Templates page shares).
//
// 2026-10-30, user request: "add more field labels, e.g. component, model, serial" + "supplier order number".

// Every job column an email field can read. Kept in one place so the RFQ and the follow-up email load the same job.
const JOB_EMAIL_SELECT = {
  jobNumber: true,
  draftNumber: true,
  type: true,
  status: true,
  customerReference: true,
  customerPo: true,
  dateReceived: true,
  etaDate: true,
  machineMake: true,
  machineModel: true,
  machineSerial: true,
  plantNumber: true,
  machineHours: true,
  component: true,
  componentModel: true,
  componentSerial: true,
  componentPartNumber: true,
  componentType: true,
  quoteNumber: true,
  salesOrderNumber: true,
  purchaseOrderNumber: true,
  invoiceNumber: true,
  customer: { select: { name: true } },
  salesRepresentative: { select: { name: true } },
  stripMechanic: { select: { name: true } },
  buildMechanic: { select: { name: true } },
} as const;

// The job, machine, component and commercial fields of one job, ready for renderTemplate. Falls back to the bare job number when the
// job cannot be found (the email still goes out).
export async function loadJobEmailVars(companyId: string, jobId: string, fallback?: { jobNumber: string | null; draftNumber: string }): Promise<Record<string, string>> {
  const [job, company] = await Promise.all([
    prisma.job.findFirst({ where: { id: jobId, companyId }, select: JOB_EMAIL_SELECT }),
    prisma.company.findUnique({ where: { id: companyId }, select: { industryBuild: true } }),
  ]);
  if (!job) return buildJobFieldValues({ jobNumber: fallback?.jobNumber ?? null, draftNumber: fallback?.draftNumber ?? "", type: "", status: "" });
  return buildJobFieldValues(job, company?.industryBuild);
}

// You & your company: the company name, the person sending, the company phone and today's date.
export async function loadCompanyEmailVars(companyId: string, senderName?: string | null): Promise<Record<string, string>> {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { legalName: true, tradingName: true, settings: { select: { mainTelephone: true } } },
  });
  return {
    company: (company?.tradingName || company?.legalName || "").trim(),
    senderName: (senderName ?? "").trim(),
    companyPhone: (company?.settings?.mainTelephone ?? "").trim(),
    date: formatEmailDate(new Date()),
  };
}

// {{supplierContact}}: the first name of the supplier's contact - the one marked primary first, otherwise the oldest.
export function supplierContactFirstName(contacts: ReadonlyArray<{ firstName: string; isPrimary?: boolean }> | undefined | null): string {
  if (!contacts?.length) return "";
  const contact = contacts.find((c) => c.isPrimary && c.firstName.trim()) ?? contacts.find((c) => c.firstName.trim());
  return contact?.firstName.trim() ?? "";
}

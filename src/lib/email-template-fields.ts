// Settings > Templates: the default wording of every email, the fields ({{placeholders}}) each email can use, example values for the
// live preview, and the pure helpers that fill them in. Kept free of server-only imports so the Templates page (browser) and the
// code that sends the emails (server) read exactly the same lists.
//
// 2026-10-30, user request: "add more field labels, e.g. component, model, serial" + "supplier order number" + "add each default
// wording" - the Templates page now lists the fields in groups, and every field listed here is filled in when the email is sent
// (see lib/email-template-vars.ts for where each value comes from).

import { jobStatusLabelsFor, jobTypeLabelsFor } from "@/lib/jobs/ui";

export const DEFAULT_RFQ_SUBJECT = "Request for quote — Job {{jobNumber}}";
export const DEFAULT_RFQ_BODY = [
  "Hi {{supplierName}},",
  "",
  "Could you please quote on the following parts for job {{jobNumber}} ({{machine}})?",
  "",
  "{{partsList}}",
  "",
  "Please reply with pricing and availability at your earliest convenience.",
].join("\n");

export const DEFAULT_FOLLOWUP_SUBJECT = "Follow-up — outstanding parts for Job {{jobNumber}}";
export const DEFAULT_FOLLOWUP_BODY = [
  "Hi {{supplierName}},",
  "",
  "Following up on the parts still outstanding for job {{jobNumber}}:",
  "",
  "{{partsList}}",
  "",
  "Please could you let us know an updated ETA for these?",
].join("\n");

// The email sent by the Email button on the Jobs & WIP table (the table view attached as a PDF).
export const DEFAULT_WIP_SUBJECT = "{{title}} - {{company}} - {{date}}";
export const DEFAULT_WIP_BODY = [
  "Hi,",
  "",
  "Please find attached the {{title}} list ({{count}}).",
  "",
  "{{filters}}",
].join("\n");

export const DEFAULT_SIGNATURE = "Thank you.";

export type EmailTemplateKey = "rfq" | "followup" | "wip" | "signature";
export const EMAIL_TEMPLATE_KEYS: EmailTemplateKey[] = ["rfq", "followup", "wip", "signature"];

// The wording a template starts with (the signature has no subject).
export const EMAIL_TEMPLATE_DEFAULTS: Record<EmailTemplateKey, { subject: string; body: string }> = {
  rfq: { subject: DEFAULT_RFQ_SUBJECT, body: DEFAULT_RFQ_BODY },
  followup: { subject: DEFAULT_FOLLOWUP_SUBJECT, body: DEFAULT_FOLLOWUP_BODY },
  wip: { subject: DEFAULT_WIP_SUBJECT, body: DEFAULT_WIP_BODY },
  signature: { subject: "", body: DEFAULT_SIGNATURE },
};

export type EmailFieldGroupKey = "supplier" | "job" | "machine" | "component" | "commercial" | "list" | "company";
export type EmailField = { key: string; hint: string; sample: string };
export type EmailFieldGroup = { key: EmailFieldGroupKey; label: string; fields: EmailField[] };

export const EMAIL_FIELD_GROUPS: Record<EmailFieldGroupKey, EmailFieldGroup> = {
  supplier: {
    key: "supplier", label: "Supplier & parts",
    fields: [
      { key: "supplierName", hint: "supplier", sample: "Barloworld Equipment" },
      { key: "supplierContact", hint: "contact's first name", sample: "Ruan" },
      { key: "supplierOrderNumber", hint: "our order # to them", sample: "PO-1190" },
      { key: "partsList", hint: "parts, one per line", sample: "4695312 — Liner, cylinder (qty 6)\n5P0597 — Clamp, hose (qty 4)\n2132410 — Gasket (qty 1)" },
      { key: "partsCount", hint: "e.g. 3 parts", sample: "3 parts" },
    ],
  },
  job: {
    key: "job", label: "Job",
    fields: [
      { key: "jobNumber", hint: "job #", sample: "BRE1146" },
      { key: "jobType", hint: "e.g. Standard repair", sample: "Standard repair" },
      { key: "jobStatus", hint: "current status", sample: "Await outwork" },
      { key: "customerName", hint: "customer", sample: "Black Rock Equipment" },
      { key: "customerReference", hint: "their reference", sample: "BR-4471" },
      { key: "customerPo", hint: "their PO", sample: "PO-90871" },
      { key: "dateIn", hint: "date received", sample: "13 Oct 2026" },
      { key: "etaDate", hint: "ETA", sample: "6 Nov 2026" },
      { key: "salesRep", hint: "sales rep", sample: "Pieter Naude" },
      { key: "machinist", hint: "machinist", sample: "Andre Botha" },
    ],
  },
  machine: {
    key: "machine", label: "Machine",
    fields: [
      { key: "machine", hint: "make and model", sample: "Caterpillar 3406E" },
      { key: "machineMake", hint: "make", sample: "Caterpillar" },
      { key: "machineModel", hint: "model", sample: "3406E" },
      { key: "machineSerial", hint: "serial", sample: "7SK01234" },
      { key: "plantNumber", hint: "plant #", sample: "PL-0231" },
      { key: "machineHours", hint: "hours", sample: "12480" },
    ],
  },
  component: {
    key: "component", label: "Component",
    fields: [
      { key: "component", hint: "component", sample: "Cylinder head" },
      { key: "componentModel", hint: "model", sample: "CH-3406" },
      { key: "componentSerial", hint: "serial", sample: "CH-88213" },
      { key: "componentPartNumber", hint: "part #", sample: "4W0004" },
      { key: "componentType", hint: "type", sample: "Engine" },
    ],
  },
  commercial: {
    key: "commercial", label: "Commercial",
    fields: [
      { key: "quoteNumber", hint: "quote #", sample: "Q-20418" },
      { key: "salesOrderNumber", hint: "sales order #", sample: "SO-7731" },
      { key: "purchaseOrderNumber", hint: "PO #", sample: "PO-90871" },
      { key: "invoiceNumber", hint: "invoice #", sample: "INV-5520" },
    ],
  },
  list: {
    key: "list", label: "This list",
    fields: [
      { key: "title", hint: "list name", sample: "Jobs & WIP" },
      { key: "count", hint: "e.g. 12 jobs", sample: "12 jobs" },
      { key: "filters", hint: "the table's filters", sample: "Status: Await outwork · Type: Standard repair" },
    ],
  },
  company: {
    key: "company", label: "You & your company",
    fields: [
      { key: "company", hint: "company", sample: "Hi-Gear Engineering (Pty) Ltd" },
      { key: "senderName", hint: "your name", sample: "Mornay Rossouw" },
      { key: "companyPhone", hint: "company phone", sample: "011 555 0142" },
      { key: "date", hint: "today", sample: "2026/10/30" },
    ],
  },
};

// Which groups of fields each template can use. The signature is added to every email, so it only gets the "you" fields.
export const EMAIL_TEMPLATE_GROUPS: Record<EmailTemplateKey, EmailFieldGroupKey[]> = {
  rfq: ["supplier", "job", "machine", "component", "commercial", "company"],
  followup: ["supplier", "job", "machine", "component", "commercial", "company"],
  wip: ["list", "company"],
  signature: ["company"],
};

export function templateFieldKeys(template: EmailTemplateKey): string[] {
  return EMAIL_TEMPLATE_GROUPS[template].flatMap((group) => EMAIL_FIELD_GROUPS[group].fields.map((field) => field.key));
}

export function emailSampleValues(): Record<string, string> {
  const values: Record<string, string> = {};
  for (const group of Object.values(EMAIL_FIELD_GROUPS)) for (const field of group.fields) values[field.key] = field.sample;
  return values;
}

// ---------------------------------------------------------------------------------------------------------------------------
// Reading a template
// ---------------------------------------------------------------------------------------------------------------------------

const FIELD_PATTERN = /\{\{\s*(\w+)\s*\}\}/g;

// {{fields}} that the given template cannot fill in (a typo, or a field of another email) - they would be sent as blanks.
export function unknownFields(template: EmailTemplateKey, ...texts: string[]): string[] {
  const allowed = new Set(templateFieldKeys(template));
  const found = new Set<string>();
  for (const text of texts) for (const match of text.matchAll(FIELD_PATTERN)) if (!allowed.has(match[1])) found.add(match[1]);
  return [...found];
}

export type PreviewPart = { text: string; field?: string };

// The template split into plain text and filled-in fields, for the live preview (the fields are highlighted).
export function previewParts(text: string, values: Record<string, string>): PreviewPart[] {
  const parts: PreviewPart[] = [];
  let last = 0;
  for (const match of text.matchAll(FIELD_PATTERN)) {
    const index = match.index ?? 0;
    if (index > last) parts.push({ text: text.slice(last, index) });
    parts.push({ text: values[match[1]] ?? "", field: match[1] });
    last = index + match[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last) });
  return parts;
}

const normalizeText = (value: string) => value.replace(/\r\n/g, "\n").trim();

// A template that is exactly the default wording (or blank) is stored as "not customised", so a later improvement to a default
// reaches every company that never changed it.
export function isDefaultWording(template: EmailTemplateKey, subject: string, body: string): boolean {
  const defaults = EMAIL_TEMPLATE_DEFAULTS[template];
  const sameSubject = !normalizeText(subject) || normalizeText(subject) === defaults.subject;
  const sameBody = !normalizeText(body) || normalizeText(body) === defaults.body;
  return sameSubject && sameBody;
}

// What is saved for one half of a template: nothing when it is blank or the default wording, otherwise the text.
export function storedWording(template: EmailTemplateKey, part: "subject" | "body", value: string): string | null {
  const text = normalizeText(value);
  if (!text || text === EMAIL_TEMPLATE_DEFAULTS[template][part]) return null;
  return text;
}

// ---------------------------------------------------------------------------------------------------------------------------
// CC addresses
// ---------------------------------------------------------------------------------------------------------------------------

export const MAX_CC_ADDRESSES = 10;
const EMAIL_ADDRESS = /^[^\s@,;<>()]+@[^\s@,;<>()]+\.[^\s@,;<>()]+$/;

// "a@x.co.za; B@x.co.za, a@x.co.za" -> valid ["a@x.co.za", "b@x.co.za"] (lower case, each once, in order), invalid [anything that is not an address].
export function parseCcList(raw: string | null | undefined): { valid: string[]; invalid: string[] } {
  const valid: string[] = [];
  const invalid: string[] = [];
  for (const part of (raw ?? "").split(/[\s,;]+/)) {
    const address = part.trim();
    if (!address) continue;
    if (!EMAIL_ADDRESS.test(address) || address.length > 254) { if (!invalid.includes(address)) invalid.push(address); continue; }
    const lower = address.toLowerCase();
    if (!valid.includes(lower)) valid.push(lower);
  }
  return { valid, invalid };
}

// Why a CC box cannot be saved, or "" when it is fine.
export function ccProblem(raw: string | null | undefined): string {
  const { valid, invalid } = parseCcList(raw);
  if (invalid.length > 0) return `${invalid.slice(0, 3).join(", ")} ${invalid.length === 1 ? "is not a valid email address" : "are not valid email addresses"}.`;
  if (valid.length > MAX_CC_ADDRESSES) return `Copy at most ${MAX_CC_ADDRESSES} addresses.`;
  return "";
}

// What is saved for a CC box: the tidy list, or nothing.
export function storedCc(raw: string | null | undefined): string | null {
  const { valid } = parseCcList(raw);
  return valid.length > 0 ? valid.join(", ") : null;
}

// The CC to send: the saved list without anybody who is already on the To line (they would get the email twice).
export function ccForSend(cc: string | null | undefined, to: string): string | undefined {
  const already = new Set(parseCcList(to).valid);
  const list = parseCcList(cc).valid.filter((address) => !already.has(address));
  return list.length > 0 ? list.join(", ") : undefined;
}

// ---------------------------------------------------------------------------------------------------------------------------
// Filling in a job's fields
// ---------------------------------------------------------------------------------------------------------------------------

export function formatEmailDate(value: Date | string | null | undefined): string {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Africa/Johannesburg" });
}

export type JobEmailSource = {
  jobNumber: string | null;
  draftNumber: string;
  type: string;
  status: string;
  customer?: { name: string } | null;
  customerReference?: string | null;
  customerPo?: string | null;
  dateReceived?: Date | string | null;
  etaDate?: Date | string | null;
  salesRepresentative?: { name: string } | null;
  stripMechanic?: { name: string } | null;
  buildMechanic?: { name: string } | null;
  machineMake?: string | null;
  machineModel?: string | null;
  machineSerial?: string | null;
  plantNumber?: string | null;
  machineHours?: { toString(): string } | string | number | null;
  component?: string | null;
  componentModel?: string | null;
  componentSerial?: string | null;
  componentPartNumber?: string | null;
  componentType?: string | null;
  quoteNumber?: string | null;
  salesOrderNumber?: string | null;
  purchaseOrderNumber?: string | null;
  invoiceNumber?: string | null;
};

const clean = (value: string | null | undefined) => (value ?? "").trim();

function hoursText(value: JobEmailSource["machineHours"]): string {
  if (value === null || value === undefined) return "";
  const text = value.toString();
  // 12480.0000 -> 12480, 12480.5000 -> 12480.5
  return text.includes(".") ? text.replace(/0+$/, "").replace(/\.$/, "") : text;
}

// The job, machine, component and commercial fields of one job. `machine` keeps its original wording ("make model", or "the unit"
// when neither is known), so an email that already used it reads exactly as before.
export function buildJobFieldValues(job: JobEmailSource, build?: string | null): Record<string, string> {
  const machine = [clean(job.machineMake), clean(job.machineModel)].filter(Boolean).join(" ") || "the unit";
  return {
    jobNumber: job.jobNumber ?? job.draftNumber,
    jobType: (jobTypeLabelsFor(build) as Record<string, string>)[job.type] ?? job.type,
    jobStatus: (jobStatusLabelsFor(build) as Record<string, string>)[job.status] ?? job.status,
    customerName: clean(job.customer?.name),
    customerReference: clean(job.customerReference),
    customerPo: clean(job.customerPo),
    dateIn: formatEmailDate(job.dateReceived),
    etaDate: formatEmailDate(job.etaDate),
    salesRep: clean(job.salesRepresentative?.name),
    machinist: clean(job.stripMechanic?.name) || clean(job.buildMechanic?.name),
    machine,
    machineMake: clean(job.machineMake),
    machineModel: clean(job.machineModel),
    machineSerial: clean(job.machineSerial),
    plantNumber: clean(job.plantNumber),
    machineHours: hoursText(job.machineHours),
    component: clean(job.component),
    componentModel: clean(job.componentModel),
    componentSerial: clean(job.componentSerial),
    componentPartNumber: clean(job.componentPartNumber),
    componentType: clean(job.componentType),
    quoteNumber: clean(job.quoteNumber),
    salesOrderNumber: clean(job.salesOrderNumber),
    purchaseOrderNumber: clean(job.purchaseOrderNumber),
    invoiceNumber: clean(job.invoiceNumber),
  };
}

// "3 parts" / "1 part" / "" (nothing listed).
export function partsCountText(count: number): string {
  return count <= 0 ? "" : `${count} ${count === 1 ? "part" : "parts"}`;
}

// Order numbers typed on the part lines, each once, in the order they appear: "PO-1190, PO-1204".
export function joinOrderNumbers(orderNumbers: ReadonlyArray<string | null | undefined>): string {
  const seen = new Set<string>();
  for (const value of orderNumbers) {
    const text = clean(value);
    if (text) seen.add(text);
  }
  return [...seen].join(", ");
}

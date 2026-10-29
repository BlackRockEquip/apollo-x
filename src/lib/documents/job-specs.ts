import type { DocBlock, DocSpec } from "@/lib/documents/pdf";

// Builds the DocSpec (what the saved PDF contains) for each job document from
// the same data the print views use — see the print functions in
// components/JobWorkspace.tsx. The spec is posted to
// POST /api/v1/jobs/[id]/documents, which renders it with the company
// letterhead and stores it in the job's folder as "<JOB NUMBER> - <title>.pdf".
// Pure functions: no DOM, no fetch — safe to unit test.

type Rec = Record<string, unknown>;

// Form fields can be undefined (never filled in); the saved-document schema
// wants plain strings everywhere, so every cell is coerced on the way out.
function cleanBlocks(blocks: DocBlock[]): DocBlock[] {
  return blocks.map((b): DocBlock => {
    if (b.type === "kv") return { ...b, rows: b.rows.map(([k, v]) => [String(k ?? ""), v == null ? "" : String(v)] as [string, string]) };
    if (b.type === "table") return { ...b, headers: b.headers.map((h) => String(h ?? "")), rows: b.rows.map((r) => r.map((c) => (c == null ? "" : String(c)))) };
    if (b.type === "lines") return { ...b, lines: b.lines.map((l) => (l == null ? "" : String(l))) };
    if (b.type === "paragraph" || b.type === "heading") return { ...b, text: b.text == null ? "" : String(b.text) };
    if (b.type === "twoCol") return { ...b, left: cleanBlocks(b.left), right: cleanBlocks(b.right) };
    return b;
  });
}
const clean = (spec: DocSpec): DocSpec => ({ ...spec, blocks: cleanBlocks(spec.blocks) });
const str = (value: unknown) => (value == null ? "" : String(value));
const dateText = (value: string | null | undefined) => (value ? new Date(value).toLocaleDateString("en-ZA") : "—");
const decimal = (value: unknown) => (value == null || value === "" ? "0" : String(value));
const words = (value: unknown) => str(value).replaceAll("_", " ");

export type JobDocJob = {
  type: string;
  status: string;
  jobNumber?: string | null;
  draftNumber?: string | null;
  customer?: { name?: string | null; tradingName?: string | null; addresses?: unknown[]; contacts?: unknown[] } | null;
  partLines: Rec[];
  outworkItems: Rec[];
};

/** The job form's string fields (everything the print views read from `form`). */
export type JobDocForm = Record<string, string>;

export type JobDocLabels = {
  jobType: string;
  status: string;
  salesRepresentative: string;
  stripMechanic: string;
  buildMechanic: string;
  /** Field names for the two staff fields (Engineering calls them Machinist 'Assess' / 'Final'). */
  stripLabel?: string;
  etaLabel?: string;
  buildLabel?: string;
  /** Display label of the job's PEX status (e.g. "Awaiting core"), when it has a PEX record. */
  pexStatus?: string;
};

function customerAddressLine(job: JobDocJob) {
  const address = (job.customer?.addresses || [])[0] as Rec | undefined;
  return address ? [address.line1, address.line2, address.city, address.province, address.postalCode].filter(Boolean).map(String).join(", ") : "";
}

function customerContactLine(job: JobDocJob) {
  const contact = (job.customer?.contacts || [])[0] as Rec | undefined;
  return contact ? [[contact.firstName, contact.lastName].filter(Boolean).join(" "), contact.telephone || contact.mobile, contact.email].filter(Boolean).map(String).join(" · ") : "";
}

const machineRows = (form: JobDocForm): [string, string][] => [
  ["Machine make", form.machineMake],
  ["Machine model", form.machineModel],
  ["Machine serial", form.machineSerial],
  ["Component model", form.componentModel],
  ["Component", form.component],
  ["Component serial", form.componentSerial],
  ["Part number", form.componentPartNumber],
  ["Plant number", form.plantNumber],
  ["Machine hours", form.machineHours],
];

const PART_HEADERS = ["Part number", "Description", "Qty", "Received", "Order number", "Supplier", "Status"];
const PART_WIDTHS = [1.3, 3, 0.6, 0.9, 1.2, 1.5, 1.3];

function partRows(lines: Rec[]) {
  return lines.map((line) => [
    str(line.partNumber),
    str(line.description),
    decimal(line.quantity),
    decimal(line.receivedQuantity ?? 0),
    str(line.orderNumber) || "—",
    str((line.orderedFromSupplier as Rec | null | undefined)?.name) || "—",
    words(line.status),
  ]);
}

// 2026-10-07, user request: redesign the Print job card as simple mechanic
// instructions (mockup approved in chat): job number + job type up top, date
// in / previous job / customer ref-PO, machine and component, the job
// description, notes, and a lined space for the mechanic's findings. No
// customer name, prices, parts or outwork (that is Job History / Parts List).
// What varies by job type lives here so the print window (JobWorkspace.tsx's
// printJobCard) and the saved PDF (buildJobCardSpec below) always agree:
//   - Partial repair: the description is headed "Agreed scope of repair".
//   - Warranty: warranty status tag + a Warranty block; findings are headed
//     "Cause of failure / findings".
//   - PEX supply / return: PEX status tag + a PEX block (linked job).
//   - Directly allocated to PEX Inventory: an extra "Pex" tag.
//   - Outright sale: no strip/assembly, so no lined findings space.
export type JobCardLayout = {
  typeTag: string;
  extraTags: string[];
  descriptionHeading: string;
  /** null = no lined "mechanic notes" space on this job type. */
  findingsHeading: string | null;
  findingsHint: string;
  extra: { title: string; rows: [string, string][] } | null;
};

const jobRefText = (ref: unknown) => {
  const r = (ref ?? null) as Rec | null;
  return r ? str(r.jobNumber) || str(r.draftNumber) : "";
};

export function jobCardLayout(job: JobDocJob, form: JobDocForm, labels: JobDocLabels): JobCardLayout {
  const record = job as unknown as Rec;
  const pexSupply = (record.pexAsSupply ?? null) as Rec | null;
  const pexReturn = (record.pexAsReturn ?? null) as Rec | null;
  const layout: JobCardLayout = {
    typeTag: (labels.jobType || "").toUpperCase(),
    extraTags: [],
    descriptionHeading: "Job description",
    findingsHeading: "Mechanic notes",
    findingsHint: "Findings on strip-down",
    extra: null,
  };
  if (job.type === "PARTIAL_REPAIR") layout.descriptionHeading = "Agreed scope of repair";
  if (job.type === "OUTRIGHT_SALE") layout.findingsHeading = null;
  if (job.type === "WARRANTY") {
    const status = words(form.warrantyStatus || "PENDING").toLowerCase();
    const label = status.charAt(0).toUpperCase() + status.slice(1);
    layout.extraTags.push(`Warranty: ${label}`);
    layout.findingsHeading = "Cause of failure / findings";
    layout.extra = { title: "Warranty", rows: [["Warranty status", label], ["Warranty notes", form.warrantyNotes || "—"]] };
  }
  if (job.type === "PEX_SUPPLY" && pexSupply) {
    if (labels.pexStatus) layout.extraTags.push(`PEX: ${labels.pexStatus}`);
    layout.extra = { title: "PEX", rows: [["Return job", jobRefText(pexSupply.returnJob) || "Not linked yet"], ["Supply date", dateText(str(pexSupply.supplyDate) || null)]] };
  }
  if (job.type === "PEX_RETURN" && pexReturn) {
    if (labels.pexStatus) layout.extraTags.push(`PEX: ${labels.pexStatus}`);
    layout.extra = { title: "PEX", rows: [["Supply job", jobRefText(pexReturn.supplyJob) || "—"], ["Core received", "[   ]   Date: ________"]] };
  }
  // A job sent straight to PEX Inventory (no supply/return chain) carries a plain "Pex" tag.
  if (job.type !== "PEX_RETURN" && pexReturn && !pexReturn.supplyJob && str(pexReturn.status) !== "SCRAPPED") layout.extraTags.push("Pex");
  return layout;
}

function buildJobCardSpecRaw(input: { title: string; jobLabel: string; job: JobDocJob; form: JobDocForm; labels: JobDocLabels }): DocSpec {
  const { title, jobLabel, job, form, labels } = input;
  const layout = jobCardLayout(job, form, labels);
  const customerRef = [form.customerReference, form.purchaseOrderNumber].filter(Boolean).join(" / ");
  const blocks: DocBlock[] = [
    { type: "table", headers: ["Date in", "Previous job", "Customer ref / PO"], rows: [[dateText(form.dateReceived), form.previousJobNumber || "—", customerRef || "—"]] },
    { type: "heading", text: "Machine / component" },
    {
      type: "twoCol",
      left: [{ type: "kv", rows: [["Machine make", form.machineMake], ["Machine model", form.machineModel], ["Machine serial", form.machineSerial], ["Plant number", form.plantNumber]] }],
      right: [{ type: "kv", rows: [["Component model", form.componentModel], ["Component", form.component], ["Component serial", form.componentSerial], ["Part number", form.componentPartNumber], ["Machine hours", form.machineHours]] }],
    },
  ];
  if (layout.extra) blocks.push({ type: "heading", text: layout.extra.title }, { type: "kv", rows: layout.extra.rows });
  blocks.push(
    { type: "heading", text: layout.descriptionHeading },
    { type: "paragraph", text: form.description || "—" },
    { type: "heading", text: "Notes" },
    { type: "paragraph", text: form.notes || "—" },
  );
  if (layout.findingsHeading) blocks.push({ type: "heading", text: `${layout.findingsHeading} (${layout.findingsHint.toLowerCase()})` }, { type: "lined", count: 12 });
  blocks.push({ type: "signatures", labels: ["Mechanic", "Date"], fields: [""] });
  return {
    title: `${title} — mechanic instructions`,
    rightLines: [`Job ${jobLabel}`, [layout.typeTag, ...layout.extraTags].join(" · ")],
    blocks,
  };
}

// 2026-10-07, user request: Job History gets the same look as the new job
// card (mockup approved in chat). Page 1 is the full office record; parts and
// outwork follow on page 2. Same fields as before, no activity history.
// Tags, per-type headings and the Warranty / PEX / Field service blocks are
// shared with the printed window (JobWorkspace.tsx printJobHistory) so the
// print and the saved PDF always agree.
export type JobHistoryLayout = {
  tags: string[];
  descriptionHeading: string;
  extras: Array<{ title: string; rows: [string, string][] }>;
};

export function jobHistoryLayout(job: JobDocJob, form: JobDocForm, labels: JobDocLabels): JobHistoryLayout {
  const card = jobCardLayout(job, form, labels);
  const extras: JobHistoryLayout["extras"] = [];
  if (job.type === "FIELD_SERVICE") {
    extras.push({ title: "Field service", rows: [["Site", form.fieldSite], ["Technician", form.fieldTechnician], ["Vehicle", form.fieldVehicle], ["Hours", form.fieldHours], ["Kms travelled", form.kmsTravelled], ["Report", form.fieldReport]] });
  }
  if (job.type === "WARRANTY") {
    extras.push({ title: "Warranty", rows: [["Warranty status", words(form.warrantyStatus)], ["Historical source status", words(form.warrantyHistorical)], ["Warranty notes", form.warrantyNotes]] });
  }
  // The job card's PEX block carries a write-in "Core received" line; the record only needs the linked job.
  if (card.extra && card.extra.title === "PEX") extras.push({ title: "PEX", rows: card.extra.rows.filter(([label]) => label !== "Core received") });
  return {
    tags: [card.typeTag, labels.status ? `Status: ${labels.status}` : "", ...card.extraTags].filter(Boolean),
    descriptionHeading: card.descriptionHeading,
    extras,
  };
}

/** "QT-20418 · 02/10/2026": number and date on one row, blank when neither is set. */
export const numberAndDate = (number: string | undefined, date: string | undefined, extra = "") =>
  [number || "", date ? dateText(date) : "", extra].filter(Boolean).join(" · ");

function buildJobHistorySpecRaw(input: { title: string; jobLabel: string; job: JobDocJob; form: JobDocForm; labels: JobDocLabels }): DocSpec {
  const { title, jobLabel, job, form, labels } = input;
  const layout = jobHistoryLayout(job, form, labels);
  const blocks: DocBlock[] = [
    { type: "table", headers: ["Date in", "Previous job", "Customer ref", "Report number"], rows: [[dateText(form.dateReceived), form.previousJobNumber || "—", form.customerReference || "—", form.reportNumber || "—"]] },
    {
      type: "twoCol",
      left: [
        { type: "heading", text: "Customer" },
        { type: "kv", rows: [["Customer", str(job.customer?.name)], ["Trading name", str(job.customer?.tradingName)], ["Address", customerAddressLine(job)], ["Contact", customerContactLine(job)], ["Sales rep", labels.salesRepresentative]] },
      ],
      right: [
        { type: "heading", text: "Machine / component" },
        { type: "kv", rows: [["Machine make", form.machineMake], ["Machine model", form.machineModel], ["Machine serial", form.machineSerial], ["Plant number", form.plantNumber], ["Machine hours", form.machineHours], ["Component model", form.componentModel], ["Component", form.component], ["Component serial", form.componentSerial], ["Part number", form.componentPartNumber]] },
      ],
    },
    { type: "heading", text: layout.descriptionHeading },
    { type: "paragraph", text: form.description || "—" },
  ];
  if (form.notes) blocks.push({ type: "heading", text: "Notes" }, { type: "paragraph", text: form.notes });
  blocks.push({
    type: "twoCol",
    left: [
      { type: "heading", text: "Workshop" },
      { type: "kv", rows: [["ETA date", dateText(form.etaDate)], [labels.etaLabel ?? "Mechanic ETA", dateText(form.mechanicEtaDate)], [labels.stripLabel ?? "Mechanic strip", labels.stripMechanic], [labels.buildLabel ?? "Mechanic assemble", labels.buildMechanic], ["Import tracking", form.importTrackingNumber]] },
    ],
    right: [
      { type: "heading", text: "Commercial & logistics" },
      {
        type: "kv",
        rows: [
          ["Quote", numberAndDate(form.quoteNumber, form.quoteDate)],
          ["Sales order", numberAndDate(form.salesOrderNumber, form.salesOrderDate)],
          ["Invoice", numberAndDate(form.invoiceNumber, form.invoiceDate)],
          ["Payment received", form.paymentNotApplicable === "true" ? "N/A" : form.paymentDateReceived ? dateText(form.paymentDateReceived) : ""],
          ["Purchase order", numberAndDate(form.purchaseOrderNumber, form.purchaseOrderDate, words(form.purchaseOrderStatus))],
          ["Receiving transport", words(form.receivingTransport)],
          ["Delivery", numberAndDate(words(form.deliveryType), form.deliveryDate)],
        ],
      },
    ],
  });
  for (const extra of layout.extras) blocks.push({ type: "heading", text: extra.title }, { type: "kv", rows: extra.rows });
  blocks.push({ type: "pageBreak" }, { type: "heading", text: "Parts list" });
  if (job.partLines.length > 0) blocks.push({ type: "table", headers: PART_HEADERS, widths: PART_WIDTHS, center: [2, 3], rows: partRows(job.partLines) });
  else blocks.push({ type: "paragraph", text: "No parts on this job." });
  blocks.push({ type: "heading", text: "Outwork" });
  if (job.outworkItems.length > 0) {
    blocks.push({
      type: "table",
      headers: ["Description", "Qty", "Supplier", "Date sent out", "Date received", "Status"],
      widths: [3, 0.6, 1.6, 1.2, 1.2, 1.2],
      center: [1],
      rows: job.outworkItems.map((item) => [
        str(item.description),
        str(item.quantity),
        str((item.supplier as Rec | null | undefined)?.name) || "—",
        dateText(str(item.dateSentOut)),
        dateText(str(item.dateReceived)),
        words(item.status),
      ]),
    });
  } else blocks.push({ type: "paragraph", text: "No outwork on this job." });
  return { title: `${title} — full job record`, rightLines: [`Job ${jobLabel}`, layout.tags.join(" · ")], blocks };
}

// 2026-10-29: `deliveryDate` is the date on THIS note (a multi-item job delivers in stages); left out, the job's own delivery date is used.
function buildJobDeliveryNoteSpecRaw(input: { title: string; jobLabel: string; job: JobDocJob; form: JobDocForm; items?: Array<{ description: string; quantity: string }>; notes?: string; deliveryDate?: string | null }): DocSpec {
  const { title, jobLabel, job, form } = input;
  const address = (job.customer?.addresses || [])[0] as Rec | undefined;
  const addressLines = address ? [address.line1, address.line2, address.city, address.province, address.postalCode].filter((v) => v && String(v).trim()).map(String) : [];
  // 2026-10-13: no contact name or email on the delivery note; only the contact's phone number.
  const firstContact = (job.customer?.contacts || [])[0] as Rec | undefined;
  const contact = firstContact ? String(firstContact.telephone || firstContact.mobile || "") : "";
  const commercial: string[] = [];
  if (form.quoteNumber) commercial.push(`Quote number: ${form.quoteNumber}`);
  if (form.salesOrderNumber) commercial.push(`Sales order number: ${form.salesOrderNumber}`);
  if (form.invoiceNumber) commercial.push(`Invoice number: ${form.invoiceNumber}`);
  if (form.purchaseOrderNumber) commercial.push(`Purchase order number: ${form.purchaseOrderNumber}`);
  if (form.deliveryType) commercial.push(`Delivery type: ${words(form.deliveryType)}`);
  const description = [form.machineMake, form.machineModel, form.component, form.componentSerial].filter(Boolean).join(" · ");
  return deliveryNoteTemplate({
    title,
    jobLabel,
    dateLabel: "Delivery date",
    date: input.deliveryDate !== undefined ? input.deliveryDate : form.deliveryDate,
    partyHeading: "Customer details",
    partyLines: [str(job.customer?.name) || "—", str(job.customer?.tradingName), ...addressLines, contact],
    rightHeading: "Commercial & logistics",
    rightLines: commercial,
    items: input.items ? input.items.filter((item) => item.description.trim() || item.quantity.trim()).map((item) => [item.description, item.quantity]) : [[description, "1"]],
    notes: input.notes,
  });
}

// 2026-10-23, user request: "use the blank delivery note template throughout the system". ONE layout for every delivery note
// (job, outwork and blank): title with the job number and date top right, the customer / supplier block on the left (name in
// bold) next to a second block on the right (Commercial & logistics, or the machine details for outwork), a gap, then the
// Description / Qty table, optional notes, any extra lines (e.g. vehicle reg) and the Dispatched by / Received by signatures.
type DeliveryNoteTemplateInput = {
  title: string;
  jobLabel: string;
  dateLabel: string;
  date: string | null | undefined;
  /** Extra right-hand header lines, e.g. a PO reference for the blank note. */
  headerLines?: string[];
  partyHeading: string;
  partyLines: string[];
  rightHeading: string;
  rightLines: string[];
  /** Table headers, default Description + Qty. */
  headers?: string[];
  widths?: number[];
  center?: number[];
  items: string[][];
  /** undefined = no Notes section (outwork); a string (even empty) = Notes section with writing space when empty. */
  notes?: string;
  showNotes?: boolean;
  after?: DocBlock[];
};
function deliveryNoteTemplate(input: DeliveryNoteTemplateInput): DocSpec {
  const blocks: DocBlock[] = [
    {
      type: "twoCol",
      left: [{ type: "heading", text: input.partyHeading }, { type: "lines", boldFirst: true, lines: input.partyLines.filter((line) => line && String(line).trim()) }],
      right: [{ type: "heading", text: input.rightHeading }, { type: "lines", lines: input.rightLines.length ? input.rightLines : ["—"] }],
    },
    // Space between the details above and the table, so the two never touch.
    { type: "spacer", height: 14 },
    { type: "table", headers: input.headers ?? ["Description", "Qty"], widths: input.widths ?? [6, 1], center: input.center ?? [1], rows: input.items },
  ];
  if (input.showNotes !== false) {
    blocks.push({ type: "heading", text: "Notes" }, { type: "paragraph", text: input.notes && input.notes.trim() ? input.notes : " \n \n " });
  }
  if (input.after?.length) blocks.push(...input.after);
  blocks.push({ type: "signatures", labels: ["Dispatched by", "Received by"], fields: ["Name", "Signature", "Date"] });
  return { title: input.title, rightLines: [`Job ${input.jobLabel}`, ...(input.headerLines ?? []), `${input.dateLabel}: ${dateText(input.date)}`], blocks };
}

// 2026-10-21, user request: Print Parts List can print the complete list or only the outstanding parts. "Outstanding" =
// anything not yet fully received (quantity minus received is above zero) - the same test the Parts list uses for its
// Receive button.
export type PartsListScope = "ALL" | "OUTSTANDING";
export function isOutstandingPartLine(line: { quantity?: unknown; receivedQuantity?: unknown }): boolean {
  const quantity = Number(line.quantity ?? 0);
  const received = Number(line.receivedQuantity ?? 0);
  return (Number.isFinite(quantity) ? quantity : 0) - (Number.isFinite(received) ? received : 0) > 0;
}
export function partLinesForScope<T extends { quantity?: unknown; receivedQuantity?: unknown }>(lines: T[], scope: PartsListScope | undefined): T[] {
  return scope === "OUTSTANDING" ? lines.filter(isOutstandingPartLine) : lines;
}

function buildPartsListSpecRaw(input: { title: string; jobLabel: string; job: JobDocJob; scope?: PartsListScope; printedAt?: Date }): DocSpec {
  const { title, jobLabel, job, scope } = input;
  const lines = partLinesForScope(job.partLines, scope);
  const outstanding = scope === "OUTSTANDING";
  return {
    title: `${title}${outstanding ? " (outstanding parts)" : ""} — Job ${jobLabel}`,
    // 2026-10-23, user request: the date the parts list was printed is on the sheet.
    rightLines: [`Printed: ${(input.printedAt ?? new Date()).toLocaleDateString("en-ZA")}`],
    blocks: [
      lines.length > 0
        ? { type: "table", headers: PART_HEADERS, widths: PART_WIDTHS, center: [2, 3], rows: partRows(lines) }
        : { type: "paragraph", text: outstanding && job.partLines.length > 0 ? "No outstanding parts on this job - everything has been received." : "No parts on this job." },
    ],
  };
}

function buildPickSlipSpecRaw(input: { title: string; jobLabel: string; lines: Array<{ partNumber: string; supersededNumbers?: string | null; description?: string | null; quantity: unknown; binLocationLabel?: string | null }> }): DocSpec {
  const { title, jobLabel, lines } = input;
  return {
    title: `${title} — Job ${jobLabel}`,
    blocks: [
      {
        type: "table",
        headers: ["Part number", "Superseded no.", "Description", "Qty", "Qty picked", "Bin location"],
        widths: [1.3, 1.3, 2.7, 0.6, 0.9, 1.5],
        center: [3, 4],
        rows: lines.map((line) => [line.partNumber, line.supersededNumbers || "—", line.description || "", str(line.quantity), "", line.binLocationLabel || "—"]),
      },
      // 2026-10-12, user request: a picked by / date / signature area below the table.
      { type: "signatures", labels: ["Picked by", "Date", "Signature"], fields: [""] },
    ],
  };
}

function buildOutworkDeliveryNoteSpecRaw(input: {
  title: string;
  note: { jobNumber: string; supplierName: string; supplierAddressLines: string[]; supplierVat: string | null; dateCaptured: string | null; make?: string; model?: string; serial?: string; items: Array<{ description: string; quantity: number }> };
}): DocSpec {
  const { title, note } = input;
  return deliveryNoteTemplate({
    title,
    jobLabel: note.jobNumber,
    dateLabel: "Date captured",
    date: note.dateCaptured,
    partyHeading: "Supplier details",
    partyLines: [note.supplierName, ...note.supplierAddressLines, note.supplierVat ? `VAT: ${note.supplierVat}` : ""],
    rightHeading: "Machine details",
    rightLines: [`Make: ${note.make || "—"}`, `Model: ${note.model || "—"}`, `Serial: ${note.serial || "—"}`],
    headers: ["Description", "Quantity", "Checked"],
    widths: [5, 1, 1],
    center: [1, 2],
    items: note.items.map((item) => [item.description, String(item.quantity), ""]),
    showNotes: false,
    after: [{ type: "spacer", height: 8 }, { type: "paragraph", text: "Vehicle reg: ______________________________" }],
  });
}

// Field Report (field-service jobs only) — what was saved on the job: customer
// and site, machine, who attended and when, hours and kms, and the work
// performed. Empty values print as a dash. See printFieldReport in
// components/JobWorkspace.tsx for the print-window version.
function fieldHoursTotal(form: JobDocForm) {
  const parts = [form.fieldHoursNormal, form.fieldHoursOvertime, form.fieldHoursTravelled];
  if (parts.every((value) => !value)) return "";
  const total = parts.reduce((sum, value) => sum + (Number(value) || 0), 0);
  return String(Math.round(total * 100) / 100);
}

function buildFieldReportSpecRaw(input: { title: string; jobLabel: string; job: JobDocJob; form: JobDocForm; labels: JobDocLabels }): DocSpec {
  const { title, jobLabel, job, form, labels } = input;
  const blocks: DocBlock[] = [
    {
      type: "twoCol",
      left: [
        { type: "heading", text: "Customer" },
        {
          type: "kv",
          rows: [
            ["Customer", str(job.customer?.name)],
            ["Date in", dateText(form.dateReceived)],
            ["Customer reference", form.customerReference],
            ["Report number", form.reportNumber],
            ["Sales representative", labels.salesRepresentative],
          ],
        },
      ],
      right: [
        { type: "heading", text: "Site" },
        {
          type: "kv",
          rows: [
            ["Site contact", [form.siteContactName, form.siteContactPhone].filter(Boolean).join(" · ")],
            ["Site address", form.siteAddress],
            ["Access / induction", form.accessNotes],
          ],
        },
      ],
    },
    {
      type: "twoCol",
      left: [{ type: "heading", text: "Machine / component details" }, { type: "kv", rows: machineRows(form).filter(([label]) => label !== "Part number") }],
      right: [
        { type: "heading", text: "Job details" },
        {
          type: "kv",
          rows: [
            ["Job type", labels.jobType],
            ["Technician", form.fieldTechnician],
            ["Vehicle", form.fieldVehicle],
            ["Scheduled date", dateText(form.fieldScheduledDate)],
            ["Purchase order", form.purchaseOrderNumber],
            ["Quote / Sales order", [form.quoteNumber, form.salesOrderNumber].filter(Boolean).join(" / ")],
            ["Invoice number", form.invoiceNumber],
          ],
        },
        { type: "heading", text: "Job description" },
        { type: "paragraph", text: form.description || "—" },
      ],
    },
    { type: "heading", text: "Time & travel" },
    {
      type: "kv",
      rows: [
        ["Normal time (h)", form.fieldHoursNormal],
        ["Overtime (h)", form.fieldHoursOvertime],
        ["Travel (h)", form.fieldHoursTravelled],
        ["Total hours", fieldHoursTotal(form)],
        ["Kms travelled", form.kmsTravelled],
      ],
    },
    { type: "heading", text: "Report" },
    { type: "paragraph", text: form.fieldReport || "—" },
    { type: "heading", text: "Work done" },
    { type: "paragraph", text: form.fieldWorkDone || "—" },
    { type: "heading", text: "Recommendations" },
    { type: "paragraph", text: form.fieldRecommendations || "—" },
    { type: "heading", text: "Follow-up visit" },
    { type: "kv", rows: [["Follow-up needed", form.fieldFollowUp === "true" ? "Yes" : "No"], ["Follow-up date", form.fieldFollowUp === "true" ? dateText(form.fieldFollowUpDate) : ""]] },
  ];
  return { title, rightLines: [`Job ${jobLabel}`, ...(form.fieldScheduledDate ? [`Scheduled ${dateText(form.fieldScheduledDate)}`] : [])], blocks };
}

export const buildJobCardSpec: typeof buildJobCardSpecRaw = (input) => clean(buildJobCardSpecRaw(input));

export const buildJobHistorySpec: typeof buildJobHistorySpecRaw = (input) => clean(buildJobHistorySpecRaw(input));

export const buildJobDeliveryNoteSpec: typeof buildJobDeliveryNoteSpecRaw = (input) => clean(buildJobDeliveryNoteSpecRaw(input));

export const buildPartsListSpec: typeof buildPartsListSpecRaw = (input) => clean(buildPartsListSpecRaw(input));

export const buildPickSlipSpec: typeof buildPickSlipSpecRaw = (input) => clean(buildPickSlipSpecRaw(input));

export const buildOutworkDeliveryNoteSpec: typeof buildOutworkDeliveryNoteSpecRaw = (input) => clean(buildOutworkDeliveryNoteSpecRaw(input));

export const buildFieldReportSpec: typeof buildFieldReportSpecRaw = (input) => clean(buildFieldReportSpecRaw(input));

// 2026-10-22, user request: Outwork page > "Blank Delivery Note". A delivery note that is not built from a job: the user picks a
// customer or supplier, types the job number and a PO reference (typed in - never pulled from a job), lists what is being
// delivered and adds notes. Same look as the outwork / job delivery notes: party block, Description + Qty table, Notes and the
// Dispatched by / Received by signature fields.
export type BlankDeliveryNoteParty = { kind: "CUSTOMER" | "SUPPLIER"; name: string; tradingName?: string | null; addressLines: string[]; vatNumber?: string | null; telephone?: string | null };
function buildBlankDeliveryNoteSpecRaw(input: { title: string; party: BlankDeliveryNoteParty; jobNumber: string; poReference: string; deliveryDate: string | null; items: Array<{ description: string; quantity: string }>; notes?: string }): DocSpec {
  const { title, party } = input;
  const partyLines = [party.name, party.tradingName && party.tradingName !== party.name ? party.tradingName : "", ...party.addressLines, party.vatNumber ? `VAT: ${party.vatNumber}` : "", party.telephone ? `Tel: ${party.telephone}` : ""];
  return deliveryNoteTemplate({
    title,
    jobLabel: input.jobNumber,
    dateLabel: "Delivery date",
    date: input.deliveryDate,
    partyHeading: party.kind === "CUSTOMER" ? "Customer details" : "Supplier details",
    partyLines,
    rightHeading: "Commercial & logistics",
    rightLines: input.poReference.trim() ? [`PO reference: ${input.poReference.trim()}`] : [],
    items: input.items.filter((item) => item.description.trim() || item.quantity.trim()).map((item) => [item.description, item.quantity]),
    notes: input.notes,
  });
}
export const buildBlankDeliveryNoteSpec: typeof buildBlankDeliveryNoteSpecRaw = (input) => clean(buildBlankDeliveryNoteSpecRaw(input));

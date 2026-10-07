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
      right: [{ type: "kv", rows: [["Component", form.component], ["Component serial", form.componentSerial], ["Part number", form.componentPartNumber], ["Machine hours", form.machineHours]] }],
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

function buildJobHistorySpecRaw(input: { title: string; jobLabel: string; job: JobDocJob; form: JobDocForm; labels: JobDocLabels }): DocSpec {
  const { title, jobLabel, job, form, labels } = input;
  const left: DocBlock[] = [
    { type: "heading", text: "Customer details" },
    {
      type: "kv",
      rows: [
        ["Customer", str(job.customer?.name)],
        ["Trading name", str(job.customer?.tradingName)],
        ["Address", customerAddressLine(job)],
        ["Contact", customerContactLine(job)],
        ["Date in", dateText(form.dateReceived)],
        ["Customer reference", form.customerReference],
        ["Sales representative", labels.salesRepresentative],
        ["Report number", form.reportNumber],
      ],
    },
  ];
  const blocks: DocBlock[] = [
    { type: "twoCol", left, right: [{ type: "heading", text: "Machine / component details" }, { type: "kv", rows: machineRows(form) }] },
  ];
  if (form.notes) blocks.push({ type: "heading", text: "Notes" }, { type: "paragraph", text: form.notes });
  blocks.push({
    type: "twoCol",
    left: [
      { type: "heading", text: "Job details" },
      {
        type: "kv",
        rows: [
          ["Job type", labels.jobType],
          ["Status", labels.status],
          ["ETA date", dateText(form.etaDate)],
          ["Mechanic ETA date", dateText(form.mechanicEtaDate)],
          ["Mechanic strip", labels.stripMechanic],
          ["Mechanic assemble", labels.buildMechanic],
          ["Import tracking number", form.importTrackingNumber],
          ["Previous job number", form.previousJobNumber],
          ["Job description", form.description],
        ],
      },
    ],
    right: [
      { type: "heading", text: "Commercial & logistics" },
      {
        type: "kv",
        rows: [
          ["Quote number", form.quoteNumber],
          ["Quote date", dateText(form.quoteDate)],
          ["Sales order number", form.salesOrderNumber],
          ["Sales order date", dateText(form.salesOrderDate)],
          ["Invoice number", form.invoiceNumber],
          ["Invoice date", dateText(form.invoiceDate)],
          ["Payment date received", form.paymentNotApplicable === "true" ? "N/A" : dateText(form.paymentDateReceived)],
          ["Purchase order number", form.purchaseOrderNumber],
          ["Purchase order date", dateText(form.purchaseOrderDate)],
          ["Purchase order status", words(form.purchaseOrderStatus)],
          ["Receiving transport", words(form.receivingTransport)],
          ["Delivery type", words(form.deliveryType)],
          ["Delivery date", dateText(form.deliveryDate)],
        ],
      },
    ],
  });
  if (job.type === "FIELD_SERVICE") {
    blocks.push(
      { type: "heading", text: "Field service" },
      { type: "kv", rows: [["Site", form.fieldSite], ["Technician", form.fieldTechnician], ["Vehicle", form.fieldVehicle], ["Hours", form.fieldHours], ["Kms travelled", form.kmsTravelled], ["Report", form.fieldReport]] }
    );
  }
  if (job.type === "WARRANTY") {
    blocks.push(
      { type: "heading", text: "Warranty" },
      { type: "kv", rows: [["Warranty status", form.warrantyStatus], ["Historical source status", form.warrantyHistorical], ["Warranty notes", form.warrantyNotes]] }
    );
  }
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
  return { title, rightLines: [`Job ${jobLabel}`], blocks };
}

function buildJobDeliveryNoteSpecRaw(input: { title: string; jobLabel: string; job: JobDocJob; form: JobDocForm; items?: Array<{ description: string; quantity: string }>; notes?: string }): DocSpec {
  const { title, jobLabel, job, form } = input;
  const address = (job.customer?.addresses || [])[0] as Rec | undefined;
  const addressLines = address ? [address.line1, address.line2, address.city, address.province, address.postalCode].filter((v) => v && String(v).trim()).map(String) : [];
  const contact = customerContactLine(job);
  const commercial: string[] = [];
  if (form.quoteNumber) commercial.push(`Quote number: ${form.quoteNumber}`);
  if (form.salesOrderNumber) commercial.push(`Sales order number: ${form.salesOrderNumber}`);
  if (form.invoiceNumber) commercial.push(`Invoice number: ${form.invoiceNumber}`);
  if (form.purchaseOrderNumber) commercial.push(`Purchase order number: ${form.purchaseOrderNumber}`);
  if (form.deliveryType) commercial.push(`Delivery type: ${words(form.deliveryType)}`);
  const description = [form.machineMake, form.machineModel, form.component, form.componentSerial].filter(Boolean).join(" · ");
  return {
    title,
    rightLines: [`Job ${jobLabel}`, `Delivery date: ${dateText(form.deliveryDate)}`],
    blocks: [
      {
        type: "twoCol",
        left: [{ type: "heading", text: "Customer details" }, { type: "lines", lines: [str(job.customer?.name) || "—", str(job.customer?.tradingName), ...addressLines, contact].filter(Boolean) }],
        right: [{ type: "heading", text: "Commercial & logistics" }, { type: "lines", lines: commercial.length ? commercial : ["—"] }],
      },
      { type: "table", headers: ["Description", "Qty"], widths: [6, 1], center: [1], rows: input.items ? input.items.filter((item) => item.description.trim() || item.quantity.trim()).map((item) => [item.description, item.quantity]) : [[description, "1"]] },
      { type: "heading", text: "Notes" },
      { type: "paragraph", text: input.notes && input.notes.trim() ? input.notes : " \n \n " },
      { type: "signatures", labels: ["Dispatched by", "Received by"], fields: ["Name", "Signature", "Date"] },
    ],
  };
}

function buildPartsListSpecRaw(input: { title: string; jobLabel: string; job: JobDocJob }): DocSpec {
  const { title, jobLabel, job } = input;
  return {
    title: `${title} — Job ${jobLabel}`,
    blocks: [
      job.partLines.length > 0
        ? { type: "table", headers: PART_HEADERS, widths: PART_WIDTHS, center: [2, 3], rows: partRows(job.partLines) }
        : { type: "paragraph", text: "No parts on this job." },
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
    ],
  };
}

function buildOutworkDeliveryNoteSpecRaw(input: {
  title: string;
  note: { jobNumber: string; supplierName: string; supplierAddressLines: string[]; supplierVat: string | null; dateCaptured: string | null; make?: string; model?: string; serial?: string; items: Array<{ description: string; quantity: number }> };
}): DocSpec {
  const { title, note } = input;
  return {
    title,
    rightLines: [`Job ${note.jobNumber}`, `Date captured: ${dateText(note.dateCaptured)}`],
    blocks: [
      { type: "lines", lines: [note.supplierName, ...note.supplierAddressLines, note.supplierVat ? `VAT: ${note.supplierVat}` : ""].filter(Boolean) },
      // 2026-10-06 — Make / Model / Serial as one line of small bold text, not a table.
      { type: "lines", bold: true, lines: [`Make: ${note.make || "—"}  ·  Model: ${note.model || "—"}  ·  Serial: ${note.serial || "—"}`] },
      { type: "table", headers: ["Description", "Quantity", "Checked"], widths: [5, 1, 1], center: [1, 2], rows: note.items.map((item) => [item.description, String(item.quantity), ""]) },
      { type: "paragraph", text: "Vehicle reg: ______________________________" },
      { type: "signatures", labels: ["Dispatched by", "Received by"], fields: ["Name", "Signature", "Date"] },
    ],
  };
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

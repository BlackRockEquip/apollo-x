// ---------------------------------------------------------------------------
// Failure Reports (2026-11-25): the Failure Report Builder (github.com/BoshoffGP/failure-report-builder, v8) brought into
// Apollo as its own module. Pure helpers shared by the server and the browser - no database, no React - so the rules
// for what a report holds, and what is pulled in from a job, can be tested on their own.
//
// User decisions (2026-11-25) on what comes from the job:
//   Date of delivery = the date the unit was received at the workshop (Job.dateReceived)
//   Serial number    = the component's serial, else the machine's
//   Site             = never filled from the job (left for the user)
//   Artisan          = the strip mechanic (the report is done before assembly)
//   Repair type      = the job type ("Standard repair" ...)
//   Warranty outcome = never set from the job - someone always chooses it
// Every field stays editable after it is pulled in.
// ---------------------------------------------------------------------------

/** The builder's own field names, kept so its layout code and drafts carry straight over. */
export const FIELD_KEYS = [
  "job", "client", "component", "serial", "make", "model", "plant", "site", "date_delivery", "date_report", "repair_type", "artisan",
  "doc_no", "impl_date", "rev_no", "rev_date", "intro", "comments", "notes",
] as const;
export type FieldKey = (typeof FIELD_KEYS)[number];
export type ReportFields = Record<FieldKey, string>;

/** The fields a linked job fills in. Site is deliberately not one of them. */
export const JOB_FIELD_KEYS = ["job", "client", "component", "serial", "make", "model", "plant", "date_delivery", "repair_type", "artisan"] as const satisfies readonly FieldKey[];
export type JobFieldKey = (typeof JOB_FIELD_KEYS)[number];

export const WARRANTY_VALUES = ["na", "granted", "declined"] as const;
export type WarrantyValue = (typeof WARRANTY_VALUES)[number];

export const PER_PAGE_VALUES = [1, 2, 3, 4] as const;

export const DESC_HEADING_DEFAULT = "DESCRIPTION";

/** The lists printed on the Findings page. */
export const LIST_KEYS = ["replace", "repair", "missing"] as const;
export type ListKey = (typeof LIST_KEYS)[number];

export const FIELD_LABELS: Record<FieldKey, string> = {
  job: "Job number", client: "Client name", component: "Component", serial: "Serial number", make: "Make", model: "Model",
  plant: "Plant number", site: "Site", date_delivery: "Date of delivery", date_report: "Date of report", repair_type: "Repair type",
  artisan: "Artisan", doc_no: "Reference number", impl_date: "Implementation date", rev_no: "Revision number", rev_date: "Revision date",
  intro: "Opening remark", comments: "Comments", notes: "Notes",
};

/** Fields whose earlier values are offered as suggestions while typing (the builder's remembered drop-downs). */
export const SUGGEST_KEYS = ["client", "site", "component", "make", "model", "plant", "artisan", "repair_type", "doc_no"] as const satisfies readonly FieldKey[];

export const todayIso = (now = new Date()) => new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);

/** A new blank report, with the builder's defaults for the document-control block. */
export function blankFields(today = todayIso()): ReportFields {
  return {
    job: "", client: "", component: "", serial: "", make: "", model: "", plant: "", site: "", date_delivery: "", date_report: today,
    repair_type: "", artisan: "", doc_no: "BRE/QC//VR/02", impl_date: "01/03/2023", rev_no: "0", rev_date: today, intro: "", comments: "", notes: "",
  };
}

/** Whatever was stored, as a full set of strings (unknown keys dropped, missing ones blank). */
export function normaliseFields(value: unknown, today = todayIso()): ReportFields {
  const base = blankFields(today);
  if (!value || typeof value !== "object") return base;
  const raw = value as Record<string, unknown>;
  for (const key of FIELD_KEYS) if (typeof raw[key] === "string") base[key] = (raw[key] as string).slice(0, key === "intro" || key === "comments" || key === "notes" ? 6000 : 300);
  return base;
}

export type JobSource = {
  jobNumber: string | null;
  draftNumber?: string | null;
  customerName: string | null;
  component: string | null;
  componentSerial: string | null;
  machineSerial: string | null;
  machineMake: string | null;
  machineModel: string | null;
  plantNumber: string | null;
  dateReceived: Date | string | null;
  jobTypeLabel: string | null;
  stripMechanicName: string | null;
};

const clean = (value: string | null | undefined) => (value ?? "").trim();
const isoDay = (value: Date | string | null) => {
  if (!value) return "";
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? "" : value.toISOString().slice(0, 10);
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(value);
  return match ? match[1] : "";
};

/** The job's details in the report's field names (see the decisions at the top of this file). */
export function jobToFields(job: JobSource): Record<JobFieldKey, string> {
  return {
    job: clean(job.jobNumber) || clean(job.draftNumber),
    client: clean(job.customerName),
    component: clean(job.component),
    serial: clean(job.componentSerial) || clean(job.machineSerial),
    make: clean(job.machineMake),
    model: clean(job.machineModel),
    plant: clean(job.plantNumber),
    date_delivery: isoDay(job.dateReceived),
    repair_type: clean(job.jobTypeLabel),
    artisan: clean(job.stripMechanicName),
  };
}

export type RefreshResult = { fields: ReportFields; updated: JobFieldKey[]; keptEdited: JobFieldKey[] };

/**
 * "Refresh from job": brings the report up to date with the job. A field still holding what the job gave last time (or
 * empty) takes the job's new value; a field the user has changed is kept, unless `overwriteEdited` is set.
 * `previous` is what the job gave last time (null for a report that was never linked).
 */
export function refreshFromJob(current: ReportFields, previous: Partial<Record<JobFieldKey, string>> | null, next: Record<JobFieldKey, string>, overwriteEdited = false): RefreshResult {
  const fields = { ...current };
  const updated: JobFieldKey[] = [];
  const keptEdited: JobFieldKey[] = [];
  for (const key of JOB_FIELD_KEYS) {
    const now = fields[key].trim();
    const was = (previous?.[key] ?? "").trim();
    if (now === next[key]) continue;
    const untouched = now === "" || now === was;
    if (untouched || overwriteEdited) { fields[key] = next[key]; updated.push(key); }
    else keptEdited.push(key);
  }
  return { fields, updated, keptEdited };
}

/** Fields the user has changed away from what the job gives now. */
export function editedJobFields(current: ReportFields, fromJob: Record<JobFieldKey, string>): JobFieldKey[] {
  return JOB_FIELD_KEYS.filter((key) => current[key].trim() !== "" && current[key].trim() !== fromJob[key]);
}

/**
 * Where a photo goes (2026-11-26, user: "photos should be added from page 3, page 1 and 2 a user should be able to select
 * individually"): the cover photo (page 1) and the page 2 photo are chosen one at a time; everything added in bulk goes to the
 * photo pages, page 3 onwards. At most one cover and one page 2 photo per report.
 */
export const PHOTO_ROLES = ["cover", "intro", "page"] as const;
export type PhotoRoleKey = (typeof PHOTO_ROLES)[number];
export const PHOTO_ROLE_LABELS: Record<PhotoRoleKey, string> = { cover: "Page 1 - cover photo", intro: "Page 2 - with the opening remark", page: "Photo pages" };

const perOf = (perPage: number) => Math.max(1, Math.min(4, Math.round(perPage) || 4));

/** Page count: cover + page 2 + the photo pages (from the photos on the photo pages only) + findings. */
export function reportPageCount(pagePhotoCount: number, perPage: number): number {
  return 3 + Math.ceil(Math.max(0, pagePhotoCount) / perOf(perPage));
}

/** Where the k-th photo on the photo pages lands (page 3 onwards). */
export function photoPlace(k: number, perPage: number): string {
  const per = perOf(perPage);
  return `Page ${3 + Math.floor(k / per)} · row ${(k % per) + 1}`;
}

/** File name for the made report, like the builder: "<JOB>_Failure_Report.pptx". */
export function reportFileName(job: string): string {
  const safe = job.trim().replace(/[^A-Za-z0-9._-]+/g, "_") || "Report";
  return `${safe}_Failure_Report.pptx`;
}

export type PhotoMark = { t: "arrow" | "ellipse" | "box" | "text"; x1: number; y1: number; x2?: number; y2?: number; c: string; th: number; text?: string };

const MARK_TYPES = new Set(["arrow", "ellipse", "box", "text"]);
const unit = (n: unknown) => typeof n === "number" && Number.isFinite(n) ? Math.max(-0.5, Math.min(1.5, n)) : null;

/** Marks as stored, with anything malformed dropped (and old [x1,y1,x2,y2] arrows converted, as the builder does). */
export function normaliseMarks(value: unknown): PhotoMark[] {
  if (!Array.isArray(value)) return [];
  const out: PhotoMark[] = [];
  for (const item of value.slice(0, 200)) {
    if (Array.isArray(item) && item.length === 4) {
      const [x1, y1, x2, y2] = item.map(unit);
      if (x1 !== null && y1 !== null && x2 !== null && y2 !== null) out.push({ t: "arrow", x1, y1, x2, y2, c: "#FFE600", th: 2 });
      continue;
    }
    if (!item || typeof item !== "object") continue;
    const m = item as Record<string, unknown>;
    const t = typeof m.t === "string" && MARK_TYPES.has(m.t) ? (m.t as PhotoMark["t"]) : null;
    const x1 = unit(m.x1), y1 = unit(m.y1);
    if (!t || x1 === null || y1 === null) continue;
    const c = typeof m.c === "string" && /^#[0-9a-f]{6}$/i.test(m.c) ? m.c : "#FFE600";
    const th = m.th === 1 || m.th === 3 ? m.th : 2;
    const mark: PhotoMark = { t, x1, y1, c, th };
    const x2 = unit(m.x2), y2 = unit(m.y2);
    if (x2 !== null && y2 !== null) { mark.x2 = x2; mark.y2 = y2; }
    if (t === "text") {
      const text = typeof m.text === "string" ? m.text.trim().slice(0, 80) : "";
      if (!text) continue;
      mark.text = text;
    } else if (mark.x2 === undefined) continue;
    out.push(mark);
  }
  return out;
}

/** List lines as typed (empty lines kept while editing; the report leaves them out), at most 40 lines of 200 characters. */
export function normaliseList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string").map((v) => v.slice(0, 200)).slice(0, 40);
}

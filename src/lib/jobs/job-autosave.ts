// 2026-11-05, user request: saving on the job screen was slow, and typing in one field then moving to the next could lose or overwrite
// the next field. These are the pure pieces of the fix (JobWorkspace wires them up):
//  - jobPayloadFromForm / diffPayload: send only the fields that changed since the server last confirmed them;
//  - mergeServerForm: when the job is reloaded, keep anything the person has typed that the server has not confirmed yet;
//  - createSerialRunner: one save at a time, with exactly one follow-up when more edits arrive during a save.

/** The form keys the job screen's autosave looks after (every key that feeds jobPayloadFromForm). */
export const JOB_FORM_KEYS = [
  "customerId", "dateReceived", "customerReference", "purchaseOrderNumber", "machineMake", "machineModel", "machineSerial",
  "component", "componentModel", "componentType", "componentSerial", "componentPartNumber", "description", "notes", "type",
  "etaDate", "mechanicEtaDate", "stripMechanicId", "buildMechanicId", "relationshipNotes", "quoteNumber", "quoteDate",
  "salesOrderNumber", "salesOrderDate", "invoiceNumber", "invoiceDate", "purchaseOrderDate", "purchaseOrderStatus",
  "deliveryDate", "deliveryType", "receivingTransport", "kmsTravelled", "siteContactName", "siteContactPhone", "siteAddress",
  "accessNotes", "paymentDateReceived", "paymentNotApplicable", "machineHours", "plantNumber", "reportNumber",
  "importTrackingNumber", "previousJobNumber", "salesRepresentativeId",
] as const;

/** Payload fields that change names / people shown elsewhere on the screen, so the job is reloaded soon after they are saved. */
export const RELATION_PAYLOAD_KEYS = ["customerId", "stripMechanicId", "buildMechanicId", "salesRepresentativeId", "type"];

export type JobFormValues = Record<string, string>;
export type JobSavePayload = Record<string, string | number | boolean | null>;

/** Every scalar job field the edit grid can set, in the shape PATCH /api/v1/jobs/:id takes. */
export function jobPayloadFromForm(form: JobFormValues): JobSavePayload {
  return {
    customerId: form.customerId,
    dateReceived: form.dateReceived || null,
    customerReference: form.customerReference || null,
    customerPo: form.purchaseOrderNumber || null,
    machineMake: form.machineMake || null,
    machineModel: form.machineModel || null,
    machineSerial: form.machineSerial || null,
    component: form.component || null,
    componentModel: form.componentModel || null,
    componentType: form.componentType || null,
    componentSerial: form.componentSerial || null,
    componentPartNumber: form.componentPartNumber || null,
    description: form.description || null,
    notes: form.notes || null,
    type: form.type,
    etaDate: form.etaDate || null,
    mechanicEtaDate: form.mechanicEtaDate || null,
    stripMechanicId: form.stripMechanicId || null,
    buildMechanicId: form.buildMechanicId || null,
    relationshipNotes: form.relationshipNotes || null,
    quoteNumber: form.quoteNumber || null,
    quoteDate: form.quoteDate || null,
    salesOrderNumber: form.salesOrderNumber || null,
    salesOrderDate: form.salesOrderDate || null,
    invoiceNumber: form.invoiceNumber || null,
    invoiceDate: form.invoiceDate || null,
    purchaseOrderNumber: form.purchaseOrderNumber || null,
    purchaseOrderDate: form.purchaseOrderDate || null,
    purchaseOrderStatus: form.purchaseOrderStatus || null,
    deliveryDate: form.deliveryDate || null,
    deliveryType: form.deliveryType || null,
    receivingTransport: form.receivingTransport || null,
    kmsTravelled: form.kmsTravelled ? Number(form.kmsTravelled) : null,
    siteContactName: form.siteContactName || null,
    siteContactPhone: form.siteContactPhone || null,
    siteAddress: form.siteAddress || null,
    accessNotes: form.accessNotes || null,
    paymentDateReceived: form.paymentDateReceived || null,
    paymentNotApplicable: form.paymentNotApplicable === "true",
    machineHours: form.machineHours || null,
    plantNumber: form.plantNumber || null,
    reportNumber: form.reportNumber || null,
    importTrackingNumber: form.importTrackingNumber || null,
    previousJobNumber: form.previousJobNumber || null,
    salesRepresentativeId: form.salesRepresentativeId || null,
  };
}

/** Only the fields of `next` that differ from `saved` (what the server last confirmed). Empty = nothing to save. */
export function diffPayload(next: JobSavePayload, saved: JobSavePayload | null): JobSavePayload {
  if (!saved) return {};
  const changed: JobSavePayload = {};
  for (const key of Object.keys(next)) if (next[key] !== saved[key]) changed[key] = next[key];
  return changed;
}

export function pickFormKeys(form: JobFormValues, keys: readonly string[] = JOB_FORM_KEYS): JobFormValues {
  const out: JobFormValues = {};
  for (const key of keys) if (key in form) out[key] = form[key];
  return out;
}

/**
 * The values a reload of the job should put in the form. Anything the person has changed since the server last confirmed it
 * (current differs from `baseline`) is kept as typed; everything else takes the server's value. With no baseline yet (first load) the
 * server's values are used as they are.
 */
export function mergeServerForm(current: JobFormValues, server: JobFormValues, baseline: JobFormValues | null): JobFormValues {
  if (!baseline) return server;
  const merged: JobFormValues = { ...server };
  for (const key of JOB_FORM_KEYS) {
    if (!(key in current)) continue;
    // Unsaved typing is kept. So is a value that only differs from the server's by spaces at the ends: the server trims what it stores,
    // and swapping "hello " for "hello" while the person is mid-sentence would eat the space they just typed.
    if (current[key] !== baseline[key] || current[key].trim() === (server[key] ?? "").trim()) merged[key] = current[key];
  }
  return merged;
}

/**
 * What the server is known to hold after a reload: its own values, except where the form kept a value that differs only by spaces (so
 * that value is not mistaken for an unsaved edit and sent again).
 */
export function nextBaseline(server: JobFormValues, merged: JobFormValues): JobFormValues {
  const baseline = pickFormKeys(server);
  for (const key of JOB_FORM_KEYS) {
    if (key in merged && key in server && merged[key] !== server[key] && merged[key].trim() === server[key].trim()) baseline[key] = merged[key];
  }
  return baseline;
}

/**
 * Runs saves one at a time. A call while one is running does not start a second one; it asks for one more run once the current one is
 * done (however many calls arrive meanwhile), using the task from the latest call. A task returns false when it failed, which stops
 * the follow-up (the caller retries later).
 */
export function createSerialRunner() {
  let running = false;
  let again = false;
  async function run(task: () => Promise<boolean>): Promise<void> {
    latest = task;
    if (running) { again = true; return; }
    running = true;
    try {
      let ok = true;
      do {
        again = false;
        ok = await latest();
      } while (again && ok);
    } finally {
      running = false;
    }
  }
  let latest: () => Promise<boolean> = async () => true;
  return { run, isRunning: () => running };
}

import { z } from "zod";

// Input rules for the Testing Reports module (templates and readings). Kept apart from the database code so the tests can
// use them directly. Row ids are short slugs the screen makes ("1st", "fwd-hi-1"); they only have to be unique per list.

const num = z.number().finite().min(-1_000_000).max(1_000_000);
const id = z.string().trim().min(1).max(60).regex(/^[A-Za-z0-9_-]+$/, "Row ids use letters, numbers, - and _ only.");
const text = (max: number) => z.string().trim().max(max);

export const testLimitInput = z.discriminatedUnion("type", [
  z.object({ type: z.literal("PLUS_MINUS"), nominal: num, tol: num.min(0) }),
  z.object({ type: z.literal("MIN"), min: num }),
  z.object({ type: z.literal("MAX"), max: num }),
  z.object({ type: z.literal("RANGE"), min: num, max: num }),
  z.object({ type: z.literal("BELOW_FIRST"), amount: num.min(0) }),
  z.object({ type: z.literal("RECORD") }),
  z.object({ type: z.literal("NA") }),
]).refine((v) => v.type !== "RANGE" || v.min <= v.max, "Range minimum must not be above the maximum.");

const parameterRow = z.object({
  id,
  name: text(120).min(1, "Every parameter needs a name."),
  unit: text(20).default(""),
  note: text(200).optional().transform((value) => value || undefined),
  limit: testLimitInput,
});

const clutchCell = z.object({
  id,
  label: text(60).min(1, "Every clutch needs a name."),
  limit: testLimitInput,
});

const clutchRow = z.object({
  id,
  name: text(60).min(1, "Every clutch row needs a name."),
  a: testLimitInput.nullable().default(null),
  b: testLimitInput.nullable().default(null),
  cells: z.array(clutchCell).max(12).optional().refine((cells) => !cells || uniqueIds(cells), "A gear lists the same clutch twice."),
});

function uniqueIds(rows: Array<{ id: string }>) {
  return new Set(rows.map((r) => r.id)).size === rows.length;
}

export const testTemplateInput = z.object({
  name: text(120).min(2, "Give the template a name."),
  machineModels: z.array(text(60).min(1)).max(40).default([]).transform((models) => Array.from(new Set(models))),
  layout: z.enum(["FORWARD_REVERSE", "P1_P2", "ENGAGED"]),
  inputRpm: z.number().int().min(0).max(20000).nullable().optional().transform((value) => value ?? null),
  labelA: text(30).min(1).default("Forward"),
  labelB: text(30).min(1).default("Reverse"),
  parameters: z.array(parameterRow).max(60).default([]).refine(uniqueIds, "Two parameters share the same id."),
  clutchRows: z.array(clutchRow).max(80).default([]).refine(uniqueIds, "Two clutch rows share the same id."),
}).superRefine((value, ctx) => {
  if (value.layout === "FORWARD_REVERSE") {
    // BELOW_FIRST only makes sense on the second column of a P1 / P2 sheet.
    for (const r of value.clutchRows) {
      if (r.a?.type === "BELOW_FIRST" || r.b?.type === "BELOW_FIRST") ctx.addIssue({ code: "custom", message: `${r.name}: "Below the first reading" is only for P1 / P2 sheets.` });
    }
  }
  for (const r of value.clutchRows) {
    if (value.layout === "ENGAGED") {
      if (r.a || r.b) ctx.addIssue({ code: "custom", message: `${r.name}: list the engaged clutches, not Forward / Reverse readings.` });
      if (!r.cells || r.cells.length === 0) ctx.addIssue({ code: "custom", message: `${r.name}: add at least one engaged clutch.` });
    } else if (r.cells && r.cells.length > 0) {
      ctx.addIssue({ code: "custom", message: `${r.name}: engaged clutches need the "Engaged clutches per gear" layout.` });
    }
    for (const c of r.cells ?? []) {
      if (c.limit.type === "BELOW_FIRST") ctx.addIssue({ code: "custom", message: `${r.name}, ${c.label}: "Below the first reading" is only for P1 / P2 sheets.` });
    }
    if (r.a?.type === "BELOW_FIRST") ctx.addIssue({ code: "custom", message: `${r.name}: the first column cannot depend on itself.` });
  }
  for (const p of value.parameters) {
    if (p.limit.type === "BELOW_FIRST") ctx.addIssue({ code: "custom", message: `${p.name}: "Below the first reading" is only for the clutch table.` });
  }
});

export type TestTemplateInput = z.infer<typeof testTemplateInput>;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD.");

export const testReportCreateInput = z.object({
  templateId: z.string().cuid(),
  jobId: z.string().cuid().nullable().optional(),
  machineModel: text(60).optional(),
  serialNumber: text(80).optional(),
  testDate: isoDate.optional(),
  testType: text(60).optional(),
});

const reading = z.object({
  actual: text(40).default(""),
  note: text(300).optional(),
  override: z.object({ reason: text(300) }).nullable().optional(),
});

const readingsInput = z.object({
  params: z.record(z.string(), reading).default({}),
  clutches: z.record(z.string(), z.object({ a: reading.optional(), b: reading.optional(), cells: z.record(z.string(), reading).optional() })).default({}),
});

export const testReportUpdateInput = z.object({
  machineModel: text(60).optional(),
  serialNumber: text(80).optional(),
  customerName: text(120).optional(),
  testDate: isoDate.optional(),
  inputRpm: z.number().int().min(0).max(20000).nullable().optional(),
  testType: text(60).optional(),
  testers: z.array(text(60).min(1)).max(6).optional(),
  comments: text(2000).optional(),
  readings: readingsInput.optional(),
});

export type TestReportUpdateInput = z.infer<typeof testReportUpdateInput>;

// ---------------------------------------------------------------------------
// Testing Reports (2026-11-07): the rules behind a transmission dyno test sheet.
//
// A spec template lists the readings to take (flows, pressures, one row per clutch or gear) and the limit each reading
// must meet. A report copies that list when it is created and holds what was typed against it. Everything in this file is
// plain data and arithmetic (no database, no React), so the server, the screens, the printout and the tests all give the
// same answer for "is this reading in spec" and "what is the overall result".
// ---------------------------------------------------------------------------

export type TestLimit =
  | { type: "PLUS_MINUS"; nominal: number; tol: number } // 110 ± 15
  | { type: "MIN"; min: number } // at least 0.6
  | { type: "MAX"; max: number } // at most 50
  | { type: "RANGE"; min: number; max: number } // 12 to 24
  | { type: "BELOW_FIRST"; amount: number } // second reading column only: at most (first reading minus amount), the R1700G "60 Less P1"
  | { type: "RECORD" } // written down, no limit to check
  | { type: "NA" }; // not tested on this machine

export type TestLayoutId = "FORWARD_REVERSE" | "P1_P2" | "ENGAGED";

export type TestParameterRow = { id: string; name: string; unit: string; note?: string; limit: TestLimit };
// Engaged-clutch layout (2026-11-09): a gear lists only the clutches engaged in it, so one gear can have two readings and the next four.
// "id" is the clutch (named once per template, e.g. "c1"), "label" its name as shown ("C1 Forward").
export type TestClutchCell = { id: string; label: string; limit: TestLimit };
export type TestClutchRow = { id: string; name: string; a: TestLimit | null; b: TestLimit | null; cells?: TestClutchCell[] };

export type TestSpec = {
  name: string;
  layout: TestLayoutId;
  revision: number;
  labelA: string;
  labelB: string;
  parameters: TestParameterRow[];
  clutchRows: TestClutchRow[];
};

export type TestOverride = { reason: string; by: string; at: string };
export type TestReading = { actual: string; note?: string; override?: TestOverride | null };
export type TestReadings = {
  params?: Record<string, TestReading | undefined>;
  clutches?: Record<string, { a?: TestReading; b?: TestReading; cells?: Record<string, TestReading | undefined> } | undefined>;
};

export type ReadingState =
  | "PASS" // in spec
  | "FAIL" // out of spec
  | "OVERRIDDEN" // out of spec, passed by hand with a reason
  | "EMPTY" // needs a value and has none
  | "WAITING" // depends on another reading that is not entered yet
  | "INVALID" // the text is not a number
  | "RECORDED" // record-only row
  | "NA"; // not tested

export type ReadingEvaluation = {
  state: ReadingState;
  value: number | null;
  min: number | null;
  max: number | null;
  // How far outside the limit a failing reading is (always positive), null otherwise.
  outBy: number | null;
};

const EPS = 1e-9;

export const LAYOUT_LABELS: Record<TestLayoutId, string> = {
  FORWARD_REVERSE: "Forward and Reverse",
  P1_P2: "P1 and P2 per gear",
  ENGAGED: "Engaged clutches per gear",
};

export const DEFAULT_COLUMN_LABELS: Record<TestLayoutId, { a: string; b: string }> = {
  FORWARD_REVERSE: { a: "Forward", b: "Reverse" },
  P1_P2: { a: "P1", b: "P2" },
  ENGAGED: { a: "Pressure", b: "Pressure 2" }, // not shown for this layout; every clutch has its own name
};

export const LIMIT_TYPE_LABELS: Record<TestLimit["type"], string> = {
  PLUS_MINUS: "± tolerance",
  MIN: "Minimum",
  MAX: "Maximum",
  RANGE: "Range",
  BELOW_FIRST: "Below the first reading",
  RECORD: "Record only",
  NA: "Not applicable",
};

export const TEST_RESULT_LABELS = { PASS: "Pass", FAIL: "Fail", PASS_WITH_NOTE: "Pass with note" } as const;
export type TestResultId = keyof typeof TEST_RESULT_LABELS;

// The words for a result. A test the tester passed on the strength of their comments (2026-11-09) reads "Pass with comment" everywhere,
// so it can be told apart from a test with readings passed one by one with a note.
export function resultLabel(result: TestResultId | null, passedOnComments = false): string {
  if (!result) return "In progress";
  return result === "PASS_WITH_NOTE" && passedOnComments ? "Pass with comment" : TEST_RESULT_LABELS[result];
}

export function reportNumberLabel(number: number): string {
  return `TR-${String(number).padStart(4, "0")}`;
}

// "1,5" and "1.5" both read as 1.5; "390 psi" reads as 390. Anything that does not start with a number is not a number.
export function parseReadingNumber(text: string | null | undefined): number | null {
  if (text === null || text === undefined) return null;
  const match = String(text).trim().replace(",", ".").match(/^[-+]?\d+(\.\d+)?|^[-+]?\.\d+/);
  if (!match) return null;
  const value = Number(match[0]);
  return Number.isFinite(value) ? value : null;
}

export function formatNumber(value: number): string {
  return String(Number(value.toFixed(4)));
}

// The smallest and largest value a limit allows. `first` is the first reading of the row, used by BELOW_FIRST.
export function limitBounds(limit: TestLimit, first: number | null = null): { min: number | null; max: number | null } | null {
  switch (limit.type) {
    case "PLUS_MINUS": return { min: limit.nominal - limit.tol, max: limit.nominal + limit.tol };
    case "MIN": return { min: limit.min, max: null };
    case "MAX": return { min: null, max: limit.max };
    case "RANGE": return { min: limit.min, max: limit.max };
    case "BELOW_FIRST": return first === null ? null : { min: null, max: first - limit.amount };
    default: return { min: null, max: null };
  }
}

export function limitNeedsValue(limit: TestLimit | null): boolean {
  return !!limit && limit.type !== "RECORD" && limit.type !== "NA";
}

// How a limit is written on the sheet: "110 ± 15", "Min 0.6", "Max 50", "12 to 24", "≤ P1 − 60".
export function formatLimit(limit: TestLimit | null, firstLabel = "P1"): string {
  if (!limit) return "";
  switch (limit.type) {
    case "PLUS_MINUS": return limit.tol === 0 ? formatNumber(limit.nominal) : `${formatNumber(limit.nominal)} ± ${formatNumber(limit.tol)}`;
    case "MIN": return `Min ${formatNumber(limit.min)}`;
    case "MAX": return `Max ${formatNumber(limit.max)}`;
    case "RANGE": return `${formatNumber(limit.min)} to ${formatNumber(limit.max)}`;
    case "BELOW_FIRST": return `≤ ${firstLabel} − ${formatNumber(limit.amount)}`;
    case "RECORD": return "Record only";
    case "NA": return "N/A";
  }
}

// The plain numbers a limit works out to: "95 to 125", "0.6 or more", "up to 340".
export function formatBounds(limit: TestLimit | null, first: number | null = null): string {
  if (!limit) return "";
  const b = limitBounds(limit, first);
  if (!b) return limit.type === "BELOW_FIRST" ? "needs the first reading" : "";
  if (b.min !== null && b.max !== null) return b.min === b.max ? `exactly ${formatNumber(b.min)}` : `${formatNumber(b.min)} to ${formatNumber(b.max)}`;
  if (b.min !== null) return `${formatNumber(b.min)} or more`;
  if (b.max !== null) return `up to ${formatNumber(b.max)}`;
  return "";
}

export function evaluateReading(limit: TestLimit | null, reading: TestReading | undefined | null, first: number | null = null): ReadingEvaluation {
  const empty = (state: ReadingState): ReadingEvaluation => ({ state, value: null, min: null, max: null, outBy: null });
  if (!limit || limit.type === "NA") return empty("NA");
  const text = (reading?.actual ?? "").trim();
  const value = parseReadingNumber(text);
  if (limit.type === "RECORD") return { ...empty("RECORDED"), value };
  if (!text) return empty("EMPTY");
  if (value === null) return empty("INVALID");
  const bounds = limitBounds(limit, first);
  if (!bounds) return { ...empty("WAITING"), value };
  let outBy = 0;
  if (bounds.min !== null && value < bounds.min - EPS) outBy = bounds.min - value;
  if (bounds.max !== null && value > bounds.max + EPS) outBy = value - bounds.max;
  if (outBy <= EPS) return { state: "PASS", value, min: bounds.min, max: bounds.max, outBy: null };
  const overridden = !!reading?.override && reading.override.reason.trim().length > 0;
  return { state: overridden ? "OVERRIDDEN" : "FAIL", value, min: bounds.min, max: bounds.max, outBy: Number(outBy.toFixed(4)) };
}

export type EvaluatedRow = {
  key: string; // "p:<id>", "c:<id>:a", "c:<id>:b", "c:<id>:x:<clutch id>"
  label: string; // "Input flow", "6th clutch, Reverse"
  limit: TestLimit;
  evaluation: ReadingEvaluation;
};

// Every reading that has a limit worth looking at, in sheet order, with its evaluation.
export function evaluateAll(spec: TestSpec, readings: TestReadings | null | undefined): EvaluatedRow[] {
  const rows: EvaluatedRow[] = [];
  for (const row of spec.parameters) {
    rows.push({ key: `p:${row.id}`, label: row.name, limit: row.limit, evaluation: evaluateReading(row.limit, readings?.params?.[row.id]) });
  }
  for (const row of spec.clutchRows) {
    const cell = readings?.clutches?.[row.id];
    for (const c of row.cells ?? []) {
      rows.push({ key: `c:${row.id}:x:${c.id}`, label: `${row.name}, ${c.label}`, limit: c.limit, evaluation: evaluateReading(c.limit, cell?.cells?.[c.id]) });
    }
    const aEval = row.a ? evaluateReading(row.a, cell?.a) : null;
    if (row.a && aEval) rows.push({ key: `c:${row.id}:a`, label: `${row.name}, ${spec.labelA}`, limit: row.a, evaluation: aEval });
    if (row.b) {
      const first = aEval && aEval.state !== "EMPTY" && aEval.state !== "INVALID" ? aEval.value : null;
      rows.push({ key: `c:${row.id}:b`, label: `${row.name}, ${spec.labelB}`, limit: row.b, evaluation: evaluateReading(row.b, cell?.b, first) });
    }
  }
  return rows;
}

export type ReportSummary = {
  // Readings that must be typed (rows with a limit, not record-only, not N/A).
  total: number;
  entered: number;
  pass: number;
  fail: number;
  overridden: number;
  missing: number;
  invalid: number;
  complete: boolean;
  // FAIL / PASS_WITH_NOTE / PASS as it stands now. null while readings are still missing and nothing has failed yet.
  result: TestResultId | null;
  failures: Array<{ key: string; label: string; value: number | null; min: number | null; max: number | null; outBy: number | null }>;
};

export function summarizeReport(spec: TestSpec, readings: TestReadings | null | undefined): ReportSummary {
  const rows = evaluateAll(spec, readings).filter((row) => limitNeedsValue(row.limit));
  let pass = 0, fail = 0, overridden = 0, missing = 0, invalid = 0;
  const failures: ReportSummary["failures"] = [];
  for (const row of rows) {
    const { state } = row.evaluation;
    if (state === "PASS") pass += 1;
    else if (state === "FAIL") { fail += 1; failures.push({ key: row.key, label: row.label, value: row.evaluation.value, min: row.evaluation.min, max: row.evaluation.max, outBy: row.evaluation.outBy }); }
    else if (state === "OVERRIDDEN") overridden += 1;
    else if (state === "INVALID") invalid += 1;
    else missing += 1; // EMPTY and WAITING
  }
  const total = rows.length;
  const complete = missing === 0 && invalid === 0;
  const result: TestResultId | null = fail > 0 ? "FAIL" : !complete ? null : overridden > 0 ? "PASS_WITH_NOTE" : "PASS";
  return { total, entered: total - missing - invalid, pass, fail, overridden, missing, invalid, complete, result, failures };
}

// What stops a test being marked complete. Empty list = ready.
export function completionProblems(summary: ReportSummary, testers: readonly string[]): string[] {
  const problems: string[] = [];
  if (!testers.some((name) => name.trim())) problems.push("Add at least one tester.");
  if (summary.invalid > 0) problems.push(`${summary.invalid} reading${summary.invalid === 1 ? " is" : "s are"} not a number.`);
  if (summary.missing > 0) problems.push(`${summary.missing} reading${summary.missing === 1 ? " is" : "s are"} still empty.`);
  return problems;
}

// One-line reason for the result banner, for example "6th clutch, Reverse is 2 under its minimum (390, minimum 392)".
export function failureSentence(failure: ReportSummary["failures"][number]): string {
  const value = failure.value === null ? "" : formatNumber(failure.value);
  if (failure.outBy === null) return failure.label;
  if (failure.min !== null && failure.value !== null && failure.value < failure.min) return `${failure.label}: ${value}, minimum ${formatNumber(failure.min)} (${formatNumber(failure.outBy)} under)`;
  if (failure.max !== null) return `${failure.label}: ${value}, maximum ${formatNumber(failure.max)} (${formatNumber(failure.outBy)} over)`;
  return `${failure.label}: ${value}`;
}

// A machine model matches a template when it equals one of the template's models, ignoring case and spaces.
export function normalizeModel(model: string): string {
  return model.toLowerCase().replace(/\s+/g, "");
}

export function templateMatchesModel(template: { machineModels: readonly string[] }, model: string): boolean {
  const wanted = normalizeModel(model);
  return wanted.length > 0 && template.machineModels.some((m) => normalizeModel(m) === wanted);
}

// ---------------------------------------------------------------------------
// Starter templates, taken from the three Black Rock dyno sheets (R1700G, 777D and the 120K to 160K family).
// Limits that the sheets do not spell out as a limit (the 24 V supply, the R1700G input flow) are Record only, so nothing
// fails by accident; tighten them in the template editor.
// ---------------------------------------------------------------------------
export type StarterTemplate = {
  name: string;
  machineModels: string[];
  layout: TestLayoutId;
  inputRpm: number;
  labelA: string;
  labelB: string;
  parameters: TestParameterRow[];
  clutchRows: TestClutchRow[];
};

const pm = (nominal: number, tol: number): TestLimit => ({ type: "PLUS_MINUS", nominal, tol });
const row = (id: string, name: string, a: TestLimit | null, b: TestLimit | null): TestClutchRow => ({ id, name, a, b });

export const STARTER_TEMPLATES: StarterTemplate[] = [
  {
    name: "CAT 777D",
    machineModels: ["777D"],
    layout: "FORWARD_REVERSE",
    inputRpm: 800,
    labelA: "Forward",
    labelB: "Reverse",
    parameters: [
      { id: "input-flow", name: "Input flow", unit: "L/min", limit: pm(110, 15) },
      { id: "lube-flow", name: "Lube flow", unit: "L/min", limit: { type: "MIN", min: 0.6 } },
      { id: "system-voltage", name: "System voltage", unit: "V", limit: { type: "RECORD" } },
    ],
    clutchRows: [
      row("neutral", "Neutral", pm(425, 33), null),
      row("reverse", "Reverse", pm(425, 33), pm(400, 40)),
      row("1st", "1st", pm(345, 40), pm(375, 40)),
      row("2nd", "2nd", pm(425, 33), pm(375, 40)),
      row("3rd", "3rd", pm(375, 40), pm(270, 40)),
      row("4th", "4th", pm(425, 33), pm(360, 40)),
      row("5th", "5th", pm(360, 40), pm(270, 40)),
      row("6th", "6th", pm(205, 40), pm(425, 33)),
      row("7th", "7th", pm(205, 40), pm(270, 40)),
    ],
  },
  {
    name: "CAT R1700G",
    machineModels: ["R1700G"],
    layout: "P1_P2",
    inputRpm: 800,
    labelA: "P1",
    labelB: "P2",
    parameters: [
      { id: "input-flow", name: "Input flow", unit: "L/min", limit: { type: "RECORD" } },
      { id: "lube-flow", name: "Lube flow", unit: "L/min", limit: { type: "NA" } },
      { id: "system-voltage", name: "System voltage", unit: "V", limit: { type: "RANGE", min: 12, max: 24 } },
      { id: "lockup", name: "Lockup", unit: "", limit: { type: "NA" } },
      { id: "p3-out", name: "P3 out", unit: "psi", limit: { type: "MAX", max: 50 } },
    ],
    clutchRows: ["Neutral", "1st", "2nd", "3rd", "4th"].map((name) => row(name.toLowerCase(), name, { type: "MIN", min: 320 }, { type: "BELOW_FIRST", amount: 60 })),
  },
  {
    name: "CAT 120K to 160K",
    machineModels: ["120K", "120K Series 2J", "120KJ", "140K", "140K Series 2J", "140KJ", "160K"],
    layout: "FORWARD_REVERSE",
    inputRpm: 800,
    labelA: "Forward",
    labelB: "Reverse",
    parameters: [
      { id: "input-flow", name: "Input flow", unit: "L/min", note: "High idle: 106 ± 8 L/min", limit: pm(42, 7.6) },
      { id: "input-pressure", name: "Input pressure", unit: "psi", limit: pm(440, 20) },
      { id: "main-relief", name: "Main relief pressure", unit: "psi", limit: pm(410, 10) },
      { id: "lube-flow", name: "Lube flow", unit: "L/min", note: "High idle: 95 ± 8 L/min", limit: pm(30, 7.6) },
      { id: "park-brake", name: "Park brake release", unit: "psi", limit: { type: "MIN", min: 80 } },
    ],
    clutchRows: [
      ["fwd-hi-1", "Fwd Hi (1)"], ["fwd-low-2", "Fwd Low (2)"], ["rev-3", "Rev (3)"], ["2nd-4", "2ND (4)"], ["3rd-5", "3RD (5)"],
      ["low-6", "Low (6)"], ["low-7", "Low (7)"], ["high-8", "High (8)"], ["neutral", "Neutral"],
    ].map(([id, name]) => row(id, name, pm(380, 10), pm(380, 10))),
  },
];

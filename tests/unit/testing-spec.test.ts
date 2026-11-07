import { describe, expect, it } from "vitest";
import {
  STARTER_TEMPLATES, completionProblems, evaluateReading, failureSentence, formatBounds, formatLimit, parseReadingNumber,
  reportNumberLabel, summarizeReport, templateMatchesModel, type TestReadings, type TestSpec,
} from "@/lib/testing/spec";
import { testTemplateInput } from "@/lib/testing/validation";

const spec = (name: string): TestSpec => {
  const t = STARTER_TEMPLATES.find((s) => s.name === name)!;
  return { name: t.name, layout: t.layout, revision: 1, labelA: t.labelA, labelB: t.labelB, parameters: t.parameters, clutchRows: t.clutchRows };
};

// The 777D sheet from 2026-06-30, typed exactly as it was written.
const SHEET_777D: TestReadings = {
  params: { "input-flow": { actual: "120" }, "lube-flow": { actual: "1,5" }, "system-voltage": { actual: "24" } },
  clutches: {
    neutral: { a: { actual: "400" } },
    reverse: { a: { actual: "400" }, b: { actual: "390" } },
    "1st": { a: { actual: "320" }, b: { actual: "360" } },
    "2nd": { a: { actual: "400" }, b: { actual: "360" } },
    "3rd": { a: { actual: "360" }, b: { actual: "280" } },
    "4th": { a: { actual: "400" }, b: { actual: "350" } },
    "5th": { a: { actual: "360" }, b: { actual: "280" } },
    "6th": { a: { actual: "220" }, b: { actual: "390" } },
    "7th": { a: { actual: "220" }, b: { actual: "270" } },
  },
};

describe("reading numbers", () => {
  it("accepts a decimal comma or point and trailing units", () => {
    expect(parseReadingNumber("1,5")).toBe(1.5);
    expect(parseReadingNumber(" 390 psi ")).toBe(390);
    expect(parseReadingNumber(".6")).toBe(0.6);
    expect(parseReadingNumber("")).toBeNull();
    expect(parseReadingNumber("abc")).toBeNull();
  });
  it("numbers reports TR-0001", () => {
    expect(reportNumberLabel(7)).toBe("TR-0007");
    expect(reportNumberLabel(12345)).toBe("TR-12345");
  });
});

describe("limits", () => {
  it("checks plus and minus including the exact edges", () => {
    const limit = { type: "PLUS_MINUS", nominal: 425, tol: 33 } as const;
    expect(evaluateReading(limit, { actual: "392" }).state).toBe("PASS");
    expect(evaluateReading(limit, { actual: "458" }).state).toBe("PASS");
    const low = evaluateReading(limit, { actual: "390" });
    expect(low.state).toBe("FAIL");
    expect(low.outBy).toBe(2);
    expect(low.min).toBe(392);
    expect(evaluateReading(limit, { actual: "459" }).outBy).toBe(1);
  });

  it("handles decimal tolerances without floating point noise", () => {
    const limit = { type: "PLUS_MINUS", nominal: 42, tol: 7.6 } as const;
    expect(evaluateReading(limit, { actual: "34.4" }).state).toBe("PASS");
    expect(evaluateReading(limit, { actual: "49.6" }).state).toBe("PASS");
    expect(evaluateReading(limit, { actual: "49.7" }).state).toBe("FAIL");
  });

  it("checks minimum, maximum and range", () => {
    expect(evaluateReading({ type: "MIN", min: 80 }, { actual: "79" }).state).toBe("FAIL");
    expect(evaluateReading({ type: "MIN", min: 80 }, { actual: "80" }).state).toBe("PASS");
    expect(evaluateReading({ type: "MAX", max: 50 }, { actual: "120" }).outBy).toBe(70);
    expect(evaluateReading({ type: "RANGE", min: 12, max: 24 }, { actual: "24" }).state).toBe("PASS");
    expect(evaluateReading({ type: "RANGE", min: 12, max: 24 }, { actual: "11.9" }).state).toBe("FAIL");
  });

  it("measures the second pressure against the first", () => {
    const limit = { type: "BELOW_FIRST", amount: 60 } as const;
    expect(evaluateReading(limit, { actual: "320" }, 400).state).toBe("PASS"); // limit is 340
    expect(evaluateReading(limit, { actual: "341" }, 400).state).toBe("FAIL");
    expect(evaluateReading(limit, { actual: "320" }, null).state).toBe("WAITING");
  });

  it("leaves record-only and not-applicable rows alone", () => {
    expect(evaluateReading({ type: "RECORD" }, { actual: "" }).state).toBe("RECORDED");
    expect(evaluateReading({ type: "RECORD" }, { actual: "24" }).value).toBe(24);
    expect(evaluateReading({ type: "NA" }, { actual: "5" }).state).toBe("NA");
    expect(evaluateReading(null, { actual: "5" }).state).toBe("NA");
  });

  it("flags empty and non-numeric readings", () => {
    const limit = { type: "MIN", min: 1 } as const;
    expect(evaluateReading(limit, undefined).state).toBe("EMPTY");
    expect(evaluateReading(limit, { actual: "ok" }).state).toBe("INVALID");
  });

  it("passes a failing reading by hand only with a reason", () => {
    const limit = { type: "MAX", max: 50 } as const;
    expect(evaluateReading(limit, { actual: "120", override: { reason: "Max relief when restricted", by: "Mornay", at: "2026-10-30" } }).state).toBe("OVERRIDDEN");
    expect(evaluateReading(limit, { actual: "120", override: { reason: "  ", by: "Mornay", at: "2026-10-30" } }).state).toBe("FAIL");
    // An override on a reading that is in spec changes nothing.
    expect(evaluateReading(limit, { actual: "40", override: { reason: "x", by: "a", at: "b" } }).state).toBe("PASS");
  });

  it("writes limits the way the sheets do", () => {
    expect(formatLimit({ type: "PLUS_MINUS", nominal: 110, tol: 15 })).toBe("110 ± 15");
    expect(formatLimit({ type: "PLUS_MINUS", nominal: 24, tol: 0 })).toBe("24");
    expect(formatLimit({ type: "MIN", min: 0.6 })).toBe("Min 0.6");
    expect(formatLimit({ type: "RANGE", min: 12, max: 24 })).toBe("12 to 24");
    expect(formatLimit({ type: "BELOW_FIRST", amount: 60 })).toBe("≤ P1 − 60");
    expect(formatBounds({ type: "PLUS_MINUS", nominal: 110, tol: 15 })).toBe("95 to 125");
    expect(formatBounds({ type: "BELOW_FIRST", amount: 60 }, 400)).toBe("up to 340");
  });
});

describe("report result", () => {
  it("catches the 777D reading that the paper sheet called in spec", () => {
    const summary = summarizeReport(spec("CAT 777D"), SHEET_777D);
    expect(summary.total).toBe(2 + 17); // input flow, lube flow, and 17 clutch readings; voltage is record only
    expect(summary.fail).toBe(1);
    expect(summary.pass).toBe(summary.total - 1);
    expect(summary.result).toBe("FAIL");
    expect(failureSentence(summary.failures[0])).toBe("6th, Reverse: 390, minimum 392 (2 under)");
  });

  it("passes once that reading is in spec", () => {
    const fixed: TestReadings = { ...SHEET_777D, clutches: { ...SHEET_777D.clutches, "6th": { a: { actual: "220" }, b: { actual: "395" } } } };
    const summary = summarizeReport(spec("CAT 777D"), fixed);
    expect(summary.result).toBe("PASS");
    expect(summary.complete).toBe(true);
    expect(completionProblems(summary, ["Mornay"])).toEqual([]);
  });

  it("reads the R1700G sheet: P3 out passed with a note makes Pass with note", () => {
    const readings: TestReadings = {
      params: {
        "input-flow": { actual: "130" }, "system-voltage": { actual: "24", note: "Partial engagement at 12 V, tested at 24 V" },
        "p3-out": { actual: "120", override: { reason: "Max relief when restricted", by: "Mornay", at: "2026-10-30" } },
      },
      clutches: Object.fromEntries(["neutral", "1st", "2nd", "3rd", "4th"].map((id) => [id, { a: { actual: "400" }, b: { actual: "320" } }])),
    };
    const summary = summarizeReport(spec("CAT R1700G"), readings);
    expect(summary.fail).toBe(0);
    expect(summary.overridden).toBe(1);
    expect(summary.result).toBe("PASS_WITH_NOTE");
  });

  it("shows no result until every reading is in, but fails straight away on a bad one", () => {
    const partial = summarizeReport(spec("CAT 777D"), { params: { "input-flow": { actual: "120" } } });
    expect(partial.result).toBeNull();
    expect(partial.complete).toBe(false);
    expect(partial.missing).toBe(partial.total - 1);
    expect(completionProblems(partial, [])).toEqual(["Add at least one tester.", `${partial.missing} readings are still empty.`]);
    const bad = summarizeReport(spec("CAT 777D"), { params: { "input-flow": { actual: "300" } } });
    expect(bad.result).toBe("FAIL");
  });

  it("does not count N/A or record-only rows as missing", () => {
    const summary = summarizeReport(spec("CAT R1700G"), { params: {}, clutches: {} });
    // voltage, P3 out, five gears with two readings each; input flow is record only, lube flow and lockup are N/A
    expect(summary.total).toBe(2 + 10);
  });
});

describe("templates", () => {
  it("matches a machine model without caring about case or spaces", () => {
    const t = STARTER_TEMPLATES[2];
    expect(templateMatchesModel(t, "140k series 2j")).toBe(true);
    expect(templateMatchesModel(t, "793F")).toBe(false);
    expect(templateMatchesModel(t, "")).toBe(false);
  });

  it("starter templates pass the template input rules", () => {
    for (const t of STARTER_TEMPLATES) expect(() => testTemplateInput.parse(t)).not.toThrow();
  });

  it("rejects duplicate row ids and a P1/P2 rule on a Forward/Reverse sheet", () => {
    const base = STARTER_TEMPLATES[0];
    expect(() => testTemplateInput.parse({ ...base, parameters: [base.parameters[0], base.parameters[0]] })).toThrow(/same id/);
    expect(() => testTemplateInput.parse({ ...base, clutchRows: [{ id: "x", name: "X", a: { type: "MIN", min: 1 }, b: { type: "BELOW_FIRST", amount: 5 } }] })).toThrow(/only for P1/);
  });
});

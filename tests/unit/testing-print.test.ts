import { describe, expect, it } from "vitest";
import { evaluateReading } from "@/lib/testing/spec";
import { gaugeShape } from "@/components/testing/printTestReport";

describe("the test certificate gauge", () => {
  it("puts the marker inside the green window for a reading in spec", () => {
    const shape = gaugeShape(evaluateReading({ type: "PLUS_MINUS", nominal: 400, tol: 20 }, { actual: "400" }));
    expect(shape).not.toBeNull();
    expect(shape!.tone).toBe("ok");
    expect(shape!.marker).toBeGreaterThan(shape!.bandLeft);
    expect(shape!.marker).toBeLessThan(shape!.bandLeft + shape!.bandWidth);
  });

  it("puts the marker outside the window, in red, for a reading out of spec", () => {
    const shape = gaugeShape(evaluateReading({ type: "PLUS_MINUS", nominal: 400, tol: 20 }, { actual: "450" }));
    expect(shape!.tone).toBe("bad");
    expect(shape!.marker).toBeGreaterThan(shape!.bandLeft + shape!.bandWidth);
  });

  it("holds a reading far outside the window at the edge of the track", () => {
    expect(gaugeShape(evaluateReading({ type: "PLUS_MINUS", nominal: 400, tol: 20 }, { actual: "9000" }))!.marker).toBeLessThanOrEqual(97);
    expect(gaugeShape(evaluateReading({ type: "PLUS_MINUS", nominal: 400, tol: 20 }, { actual: "-500" }))!.marker).toBeGreaterThanOrEqual(3);
  });

  it("draws a window for a minimum or a maximum on its own", () => {
    const min = gaugeShape(evaluateReading({ type: "MIN", min: 100 }, { actual: "120" }));
    const max = gaugeShape(evaluateReading({ type: "MAX", max: 50 }, { actual: "30" }));
    expect(min!.tone).toBe("ok");
    expect(max!.tone).toBe("ok");
  });

  it("marks a reading passed with a note in gold", () => {
    const shape = gaugeShape(evaluateReading({ type: "PLUS_MINUS", nominal: 400, tol: 20 }, { actual: "450", override: { reason: "Bench gauge reads high", by: "Mornay", at: "2026-11-12T08:00:00Z" } }));
    expect(shape!.tone).toBe("note");
  });

  it("draws nothing for a record-only reading or an empty one", () => {
    expect(gaugeShape(evaluateReading({ type: "RECORD" }, { actual: "95" }))).toBeNull();
    expect(gaugeShape(evaluateReading({ type: "PLUS_MINUS", nominal: 400, tol: 20 }, { actual: "" }))).toBeNull();
  });
});

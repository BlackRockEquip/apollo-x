import { describe, expect, it } from "vitest";
import { JOB_FORM_KEYS, RELATION_PAYLOAD_KEYS, createSerialRunner, diffPayload, jobPayloadFromForm, mergeServerForm, nextBaseline, pickFormKeys } from "@/lib/jobs/job-autosave";

// 2026-11-05, user request: job saving was slow and typing in one field then the next lost / overwrote the next field.
const base = (): Record<string, string> => ({
  customerId: "c1", type: "STANDARD_REPAIR", description: "", notes: "", machineSerial: "", purchaseOrderNumber: "", purchaseOrderStatus: "TBA",
  paymentNotApplicable: "", kmsTravelled: "",
});

describe("jobPayloadFromForm / diffPayload", () => {
  it("sends nothing when nothing changed, and only the changed fields when something did", () => {
    const saved = jobPayloadFromForm(base());
    expect(diffPayload(jobPayloadFromForm(base()), saved)).toEqual({});
    expect(diffPayload(jobPayloadFromForm({ ...base(), description: "Gearbox" }), saved)).toEqual({ description: "Gearbox" });
    expect(diffPayload(jobPayloadFromForm({ ...base(), machineSerial: "A1", notes: "n" }), saved)).toEqual({ machineSerial: "A1", notes: "n" });
  });

  it("the purchase order number feeds both customerPo and purchaseOrderNumber", () => {
    const saved = jobPayloadFromForm(base());
    expect(diffPayload(jobPayloadFromForm({ ...base(), purchaseOrderNumber: "PO9" }), saved)).toEqual({ customerPo: "PO9", purchaseOrderNumber: "PO9" });
  });

  it("clearing a field is a change, and numbers / flags compare as values", () => {
    const saved = jobPayloadFromForm({ ...base(), notes: "x", kmsTravelled: "12", paymentNotApplicable: "true" });
    expect(diffPayload(jobPayloadFromForm({ ...base(), notes: "", kmsTravelled: "12", paymentNotApplicable: "true" }), saved)).toEqual({ notes: null });
    expect(diffPayload(jobPayloadFromForm({ ...base(), notes: "x", kmsTravelled: "12", paymentNotApplicable: "" }), saved)).toEqual({ paymentNotApplicable: false });
  });

  it("with nothing confirmed by the server yet, there is nothing to send", () => {
    expect(diffPayload(jobPayloadFromForm(base()), null)).toEqual({});
  });

  it("every form key is covered and the relation keys exist in the payload", () => {
    const payload = jobPayloadFromForm(Object.fromEntries(JOB_FORM_KEYS.map((key) => [key, "v"])));
    for (const key of RELATION_PAYLOAD_KEYS) expect(payload).toHaveProperty(key);
    expect(Object.keys(pickFormKeys({ ...base(), other: "z" }))).not.toContain("other");
  });
});

describe("mergeServerForm", () => {
  it("keeps what is being typed and takes the server's value for everything else", () => {
    const baseline = { ...base(), description: "Old", notes: "N" };
    const current = { ...baseline, description: "Old, then typed more" };
    const server = { ...baseline, description: "Old", notes: "N changed by someone else" };
    const merged = mergeServerForm(current, server, baseline);
    expect(merged.description).toBe("Old, then typed more");
    expect(merged.notes).toBe("N changed by someone else");
  });

  it("keeps a value that only differs by spaces at the ends (the server trims), without treating it as an unsaved edit", () => {
    const baseline = { ...base(), notes: "hello" };
    const current = { ...baseline, notes: "hello " };
    const server = { ...baseline, notes: "hello" };
    const merged = mergeServerForm(current, server, baseline);
    expect(merged.notes).toBe("hello ");
    const next = nextBaseline(server, merged);
    expect(next.notes).toBe("hello ");
    expect(diffPayload(jobPayloadFromForm({ ...base(), ...merged }), jobPayloadFromForm({ ...base(), ...next }))).toEqual({});
  });

  it("takes the server's values on the first load", () => {
    expect(mergeServerForm({ description: "x" }, { description: "server" }, null)).toEqual({ description: "server" });
  });

  it("a field typed in while the previous field's save was in flight is not overwritten by the reload", () => {
    // Field A saved as "A1"; while that was in flight the person moved on and typed "B1" in field B.
    const baselineAfterSave = { ...base(), machineSerial: "A1" };
    const current = { ...baselineAfterSave, notes: "B1" };
    const reloaded = { ...base(), machineSerial: "A1", notes: "" };
    const merged = mergeServerForm(current, reloaded, baselineAfterSave);
    expect(merged.machineSerial).toBe("A1");
    expect(merged.notes).toBe("B1");
    // ...and B is still seen as unsaved, so the next save sends it.
    const nextBaseline = pickFormKeys(reloaded);
    expect(diffPayload(jobPayloadFromForm({ ...reloaded, ...merged }), jobPayloadFromForm({ ...base(), ...nextBaseline }))).toEqual({ notes: "B1" });
  });
});

describe("createSerialRunner", () => {
  it("never runs two saves at once, and runs exactly one follow-up for any number of requests during a save", async () => {
    let active = 0; let maxActive = 0; let runs = 0;
    let release: () => void = () => {};
    const runner = createSerialRunner();
    const task = async () => {
      runs += 1; active += 1; maxActive = Math.max(maxActive, active);
      await new Promise<void>((resolve) => { release = resolve; });
      active -= 1;
      return true;
    };
    const first = runner.run(task);
    expect(runner.isRunning()).toBe(true);
    void runner.run(task); void runner.run(task); void runner.run(task);
    expect(runs).toBe(1);
    release();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(runs).toBe(2);
    release();
    await first;
    expect(runs).toBe(2);
    expect(maxActive).toBe(1);
    expect(runner.isRunning()).toBe(false);
  });

  it("does not chase a failed save with an immediate retry, and can run again afterwards", async () => {
    let runs = 0; let ok = false;
    const runner = createSerialRunner();
    const task = async () => { runs += 1; return ok; };
    const p = runner.run(task);
    void runner.run(task);
    await p;
    expect(runs).toBe(1);
    ok = true;
    await runner.run(task);
    expect(runs).toBe(2);
  });
});

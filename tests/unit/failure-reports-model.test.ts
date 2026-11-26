import { describe, expect, it } from "vitest";
import {
  JOB_FIELD_KEYS, blankFields, editedJobFields, jobToFields, normaliseFields, normaliseMarks, photoPlace, refreshFromJob, reportFileName, reportPageCount,
  type JobSource,
} from "@/lib/failure-reports/model";
import { buildJobTabs } from "@/components/job-screen/job-tabs";
import { BUILDS, TILES } from "@/lib/builds/definitions";
import { fitDesc, estLines } from "@/components/failure-reports/buildPptx";
import { themeOf, FALLBACK_PROFILE } from "@/components/failure-reports/theme";

const job: JobSource = {
  jobNumber: "BRE1220", draftNumber: "x", customerName: "Kumba Iron Ore", component: "Transmission", componentSerial: "4MR03122", machineSerial: "AFX0099",
  machineMake: "CAT", machineModel: "777D", plantNumber: "HT-14", dateReceived: new Date("2026-11-03T08:30:00Z"), jobTypeLabel: "Standard repair", stripMechanicName: "Sipho Ndlovu",
};

describe("what a linked job fills in (user decisions 2026-11-25)", () => {
  it("maps the job onto the report's fields", () => {
    expect(jobToFields(job)).toEqual({
      job: "BRE1220", client: "Kumba Iron Ore", component: "Transmission", serial: "4MR03122", make: "CAT", model: "777D", plant: "HT-14",
      date_delivery: "2026-11-03", repair_type: "Standard repair", artisan: "Sipho Ndlovu",
    });
  });

  it("uses the component's serial, else the machine's", () => {
    expect(jobToFields({ ...job, componentSerial: null }).serial).toBe("AFX0099");
    expect(jobToFields({ ...job, componentSerial: "  " }).serial).toBe("AFX0099");
  });

  it("takes Date of delivery from the date the unit was received at the workshop", () => {
    expect(jobToFields({ ...job, dateReceived: "2026-10-30" }).date_delivery).toBe("2026-10-30");
    expect(jobToFields({ ...job, dateReceived: null }).date_delivery).toBe("");
  });

  it("never fills in Site or the warranty outcome", () => {
    expect(JOB_FIELD_KEYS).not.toContain("site");
    expect(Object.keys(jobToFields(job))).not.toContain("site");
  });

  it("falls back to the draft number for a job with no number yet", () => {
    expect(jobToFields({ ...job, jobNumber: null, draftNumber: "D-77" }).job).toBe("D-77");
  });
});

describe("Refresh from job", () => {
  const before = jobToFields(job);
  const base = { ...blankFields("2026-11-25"), ...before };

  it("updates fields the user has not changed", () => {
    const next = { ...before, plant: "HT-15", artisan: "Thabo M" };
    const r = refreshFromJob(base, before, next);
    expect(r.fields.plant).toBe("HT-15");
    expect(r.fields.artisan).toBe("Thabo M");
    expect(r.updated.sort()).toEqual(["artisan", "plant"]);
    expect(r.keptEdited).toEqual([]);
  });

  it("keeps a field the user changed, unless asked to replace it", () => {
    const edited = { ...base, model: "777D (rebuilt)" };
    const next = { ...before, model: "777E" };
    const kept = refreshFromJob(edited, before, next);
    expect(kept.fields.model).toBe("777D (rebuilt)");
    expect(kept.keptEdited).toEqual(["model"]);
    const replaced = refreshFromJob(edited, before, next, true);
    expect(replaced.fields.model).toBe("777E");
  });

  it("fills empty fields when a blank report is linked, and keeps what was typed", () => {
    const typed = { ...blankFields("2026-11-25"), client: "Typed client" };
    const r = refreshFromJob(typed, null, before);
    expect(r.fields.job).toBe("BRE1220");
    expect(r.fields.client).toBe("Typed client");
    expect(r.keptEdited).toEqual(["client"]);
  });

  it("names the fields that differ from the job", () => {
    expect(editedJobFields({ ...base, make: "Caterpillar" }, before)).toEqual(["make"]);
    expect(editedJobFields({ ...base, make: "" }, before)).toEqual([]);
  });
});

describe("report layout helpers (as in the builder)", () => {
  it("counts pages: cover + page 2 + photo pages (photo-page photos only) + findings", () => {
    expect(reportPageCount(0, 4)).toBe(3);
    expect(reportPageCount(1, 4)).toBe(4);
    expect(reportPageCount(4, 4)).toBe(4);
    expect(reportPageCount(8, 4)).toBe(5);
    expect(reportPageCount(8, 1)).toBe(11);
  });

  it("says where each photo on the photo pages lands (page 3 onwards)", () => {
    expect(photoPlace(0, 4)).toBe("Page 3 · row 1");
    expect(photoPlace(4, 4)).toBe("Page 4 · row 1");
    expect(photoPlace(1, 2)).toBe("Page 3 · row 2");
  });

  it("names the file after the job", () => {
    expect(reportFileName("BRE1220")).toBe("BRE1220_Failure_Report.pptx");
    expect(reportFileName(" BRE 12/20 ")).toBe("BRE_12_20_Failure_Report.pptx");
    expect(reportFileName("")).toBe("Report_Failure_Report.pptx");
  });

  it("shrinks a long description to fit and trims only as a last resort", () => {
    const short = fitDesc("Yoke sealing area worn.", 80, 30, 10.5, 8);
    expect(short.pt).toBe(10.5);
    const long = fitDesc("worn ".repeat(400), 80, 30, 10.5, 8);
    expect(long.pt).toBe(8);
    expect(long.text.endsWith("…")).toBe(true);
    expect(estLines("a\nb", 100, 10)).toBe(2);
  });

  it("keeps N/A from looking like GRANTED or DECLINED", () => {
    expect(themeOf(FALLBACK_PROFILE).naFill).toBe("F0B429");
    expect(themeOf({ ...FALLBACK_PROFILE, accent: "EC1F25", dark: "35363A" }).naFill).toBe("35363A");
  });
});

describe("stored data is cleaned", () => {
  it("drops unknown fields and fills missing ones", () => {
    const f = normaliseFields({ job: "BRE1", nonsense: "x", client: 5 }, "2026-11-25");
    expect(f.job).toBe("BRE1");
    expect(f.client).toBe("");
    expect(f.date_report).toBe("2026-11-25");
    expect("nonsense" in f).toBe(false);
  });

  it("keeps good marks, converts the builder's old arrows and drops the rest", () => {
    const marks = normaliseMarks([
      { t: "arrow", x1: 0.1, y1: 0.2, x2: 0.5, y2: 0.6, c: "#E11D2E", th: 3 },
      [0.1, 0.1, 0.3, 0.3],
      { t: "text", x1: 0.5, y1: 0.5, c: "#FFFFFF", th: 2, text: "  Cracked  " },
      { t: "text", x1: 0.5, y1: 0.5, c: "#FFFFFF", th: 2, text: "" },
      { t: "box", x1: 0.5, y1: 0.5 },
      { t: "laser", x1: 0, y1: 0, x2: 1, y2: 1 },
    ]);
    expect(marks).toHaveLength(3);
    expect(marks[1]).toMatchObject({ t: "arrow", c: "#FFE600", th: 2 });
    expect(marks[2].text).toBe("Cracked");
  });
});

describe("module wiring", () => {
  it("is a switchable tile on both industry builds", () => {
    expect(TILES.FAILURE_REPORTS.modules).toEqual(["FAILURE_REPORTS"]);
    expect(TILES.FAILURE_REPORTS.core).toBeFalsy();
    expect(BUILDS.WORKSHOP.tiles).toContain("FAILURE_REPORTS");
    expect(BUILDS.ENGINEERING.tiles).toContain("FAILURE_REPORTS");
    expect(BUILDS.WORKSHOP.defaultOn).not.toContain("FAILURE_REPORTS");
  });

  it("adds a Failure reports tab to the job screen only when the module is on", () => {
    const input = { showParts: false, showPickSlips: false, showFollowup: false, showOutwork: false, showSpecifications: false, showPex: false, showWarranty: false, showActivity: false, partsCount: 0, pickSlipsCount: 0, followupCount: 0, outworkCount: 0, attachmentsCount: 0 };
    expect(buildJobTabs(input).map((t) => t.key)).not.toContain("failure");
    expect(buildJobTabs({ ...input, showTesting: true, showFailureReports: true }).map((t) => t.key)).toEqual(["overview", "testing", "failure", "attachments"]);
  });
});

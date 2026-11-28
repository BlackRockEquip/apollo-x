import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  attemptsLeft, certificateNumber, chaptersOf, checkSaIdNumber, courseCodeOk, csvCell, diffLessons, estimateMinutes, formatElapsed, formatSeconds, heartbeatSeconds,
  htmlToSections, isCorrect, lessonsFromPrototype, lessonsFromSections, markQuiz, maskIdNumber, matrixCell, nextCardBox, nextRevisionNumber, normalisePrototypeText, revisionLabel,
  sectionsFromPlainText, splitIntoPages, toCsv, troubleQuestions, wordDiff, workingDaysBetween, type DraftLesson, type PrototypeCourse,
} from "@/lib/training/model";
import { DEFAULT_TENANT_PERMISSIONS } from "@/lib/auth/permissions";
import { BUILDS, TILES } from "@/lib/builds/definitions";

const lesson = (key: string, patch: Partial<DraftLesson> = {}): DraftLesson => ({ stableKey: key, chapterKey: "c1", chapterTitle: "One", topicTitle: "", title: key, format: "TEXT", objective: "", pages: ["text"], pageImages: [""], pdfAssetId: null, videoUrl: null, safetyPoint: "", practicalTask: "", estMinutes: 2, ...patch });

describe("Tech Training: SA ID numbers", () => {
  it("accepts a valid ID and reads the birth date", () => {
    const r = checkSaIdNumber("8001015009087");
    expect(r.valid).toBe(true);
    expect(r.birthDate).toBe("1980-01-01");
  });
  it("rejects a wrong length, a bad date and a bad check digit", () => {
    expect(checkSaIdNumber("12345").valid).toBe(false);
    expect(checkSaIdNumber("8013015009087").message).toMatch(/birth date/);
    expect(checkSaIdNumber("8001015009088").message).toMatch(/check digit/);
  });
  it("ignores spaces, picks the right century, and masks for non-admins", () => {
    expect(checkSaIdNumber("800101 5009 087").valid).toBe(true);
    expect(checkSaIdNumber("0001015009085", new Date("2026-11-28")).birthDate?.startsWith("2000")).toBe(true);
    expect(maskIdNumber("9204125831086")).toBe("920412 •••• 086");
  });
});

describe("Tech Training: revisions, codes and certificate numbers", () => {
  it("numbers revisions by change level", () => {
    expect(nextRevisionNumber(null, "MINOR")).toEqual({ major: 1, minor: 0 });
    expect(nextRevisionNumber({ major: 3, minor: 0 }, "MINOR")).toEqual({ major: 3, minor: 1 });
    expect(nextRevisionNumber({ major: 3, minor: 1 }, "MAJOR")).toEqual({ major: 4, minor: 0 });
    expect(revisionLabel({ major: 4, minor: 1 })).toBe("Rev 4.1");
    expect(revisionLabel({ major: 2, minor: 0 })).toBe("Rev 2");
  });
  it("builds certificate numbers PREFIX-CODE-YYYYMMDD-XXXX", () => {
    const n = certificateNumber("bre", "hyd-3", new Date(2026, 10, 27), () => 0);
    expect(n).toBe("BRE-HYD-3-20261127-AAAA");
    expect(certificateNumber("BRE", "SAF2", new Date(2026, 0, 5))).toMatch(/^BRE-SAF2-20260105-[A-Z2-9]{4}$/);
  });
  it("checks course codes", () => {
    expect(courseCodeOk("SAF-2")).toBe(true);
    expect(courseCodeOk("bad code")).toBe(false);
    expect(courseCodeOk("-X")).toBe(false);
  });
});

describe("Tech Training: quizzes and attempts", () => {
  const qs = [{ id: "a", answer: [1], lessonKey: "l1" }, { id: "b", answer: [0, 2], lessonKey: "l2" }, { id: "c", answer: [3], lessonKey: "l2" }, { id: "d", answer: [0], lessonKey: "" }];
  it("needs every right option for a multi-answer question", () => {
    expect(isCorrect({ answer: [0, 2] }, [2, 0])).toBe(true);
    expect(isCorrect({ answer: [0, 2] }, [0])).toBe(false);
    expect(isCorrect({ answer: [1] }, undefined)).toBe(false);
  });
  it("marks, passes at the pass mark and lists the weakest lessons first", () => {
    const r = markQuiz(qs, { a: [1], b: [0], c: [1], d: [0] }, 50);
    expect(r).toMatchObject({ correct: 2, total: 4, score: 50, passed: true });
    expect(r.weakLessonKeys).toEqual(["l2"]);
    expect(markQuiz(qs, {}, 80).passed).toBe(false);
    expect(markQuiz([], {}, 0).passed).toBe(false);
  });
  it("gives a fresh set of attempts for each reset, never below zero", () => {
    expect(attemptsLeft(3, 0, 0)).toBe(3);
    expect(attemptsLeft(3, 3, 0)).toBe(0);
    expect(attemptsLeft(3, 3, 1)).toBe(3);
    expect(attemptsLeft(3, 9, 0)).toBe(0);
  });
});

describe("Tech Training: time", () => {
  it("formats course duration and active time", () => {
    expect(formatElapsed("2026-11-03T07:42:00Z", "2026-11-21T14:18:00Z")).toBe("18 days 6 h");
    expect(formatElapsed("2026-11-03T07:42:00Z", "2026-11-03T10:54:00Z")).toBe("3 h 12 min");
    expect(formatElapsed(null, "2026-11-03T10:54:00Z")).toBe("—");
    expect(formatSeconds(42000)).toBe("11 h 40 min");
    expect(formatSeconds(30)).toBe("under a minute");
  });
  it("caps heartbeats so an open tab does not count as learning", () => {
    const now = new Date("2026-11-28T10:00:00Z");
    expect(heartbeatSeconds(new Date("2026-11-28T09:59:30Z"), now, 30)).toBe(30);
    expect(heartbeatSeconds(new Date("2026-11-28T09:00:00Z"), now, 3600)).toBe(90);
    expect(heartbeatSeconds(new Date("2026-11-28T09:59:58Z"), now, 60)).toBe(7);
  });
  it("counts working days for the approval escalation", () => {
    expect(workingDaysBetween(new Date("2026-11-27T10:00:00"), new Date("2026-12-04T10:00:00"))).toBe(5);
    expect(workingDaysBetween(new Date("2026-11-28T10:00:00"), new Date("2026-11-30T10:00:00"))).toBe(1);
  });
  it("spaces revision cards out and starts again after a wrong answer", () => {
    expect(nextCardBox(1, true)).toEqual({ box: 2, days: 3 });
    expect(nextCardBox(5, true)).toEqual({ box: 5, days: 30 });
    expect(nextCardBox(4, false)).toEqual({ box: 1, days: 1 });
  });
});

describe("Tech Training: course content", () => {
  it("finds changed, new and removed lessons between revisions", () => {
    const live = [lesson("a"), lesson("b"), lesson("c")];
    const draft = [lesson("a"), lesson("b", { pages: ["new text"] }), lesson("d")];
    const d = diffLessons(live, draft);
    expect(d.changes).toEqual({ a: "SAME", b: "CHANGED", d: "NEW" });
    expect(d.removed.map((l) => l.stableKey)).toEqual(["c"]);
    expect(d.counts).toEqual({ changed: 1, added: 1, removed: 1 });
  });
  it("shows word changes for Compare with live", () => {
    const runs = wordDiff("Wooden blocks may be used.", "Rated stands must be used.");
    expect(runs.some((r) => r.kind === "del" && r.text.includes("Wooden"))).toBe(true);
    expect(runs.some((r) => r.kind === "add" && r.text.includes("Rated"))).toBe(true);
    expect(runs.filter((r) => r.kind === "same").map((r) => r.text).join("")).toContain("be used.");
  });
  it("splits long text into pages only at paragraph breaks", () => {
    const para = Array(120).fill("word").join(" ");
    const pages = splitIntoPages([para, para, para, para].join("\n\n"), 250);
    expect(pages.length).toBe(2);
    expect(pages.every((p) => !p.startsWith("\n"))).toBe(true);
    expect(estimateMinutes(pages)).toBeGreaterThanOrEqual(2);
  });
  it("groups lessons into chapters in order", () => {
    const ch = chaptersOf([lesson("a", { chapterKey: "x", chapterTitle: "X" }), lesson("b", { chapterKey: "y", chapterTitle: "Y" }), lesson("c", { chapterKey: "x", chapterTitle: "X" })]);
    expect(ch.map((c) => [c.title, c.lessons.length])).toEqual([["X", 2], ["Y", 1]]);
  });
});

describe("Tech Training: imports", () => {
  it("turns Word headings into chapters and lessons, keeping lists and tables", () => {
    const html = "<h1>Permits</h1><p>Intro to permits.</p><h2>Hot work permit</h2><p>Get a <strong>permit</strong> first.</p><ul><li>Check area</li><li>Fire watch</li></ul><h2>Gas cylinders</h2><table><tr><th>Gas</th><th>Colour</th></tr><tr><td>Oxygen</td><td>Black</td></tr></table><h1>Fire</h1><h2>Extinguishers</h2><p>Use CO2.</p>";
    const { lessons, warnings } = lessonsFromSections(htmlToSections(html), "Hot work", () => 0.5);
    expect(lessons.map((l) => [l.chapterTitle, l.title])).toEqual([["Permits", "Hot work permit"], ["Permits", "Gas cylinders"], ["Fire", "Extinguishers"]]);
    expect(lessons[0].pages[0]).toContain("Intro to permits.");
    expect(lessons[0].pages[0]).toContain("**permit**");
    expect(lessons[0].pages[0]).toContain("- Check area");
    expect(lessons[1].pages[0]).toContain("| Gas | Colour |");
    expect(warnings).toEqual([]);
  });
  it("makes one lesson (with a warning) from a document with no headings", () => {
    const { lessons, warnings } = lessonsFromSections(htmlToSections("<p>Just text.</p><p>More text.</p>"), "Policy");
    expect(lessons).toHaveLength(1);
    expect(lessons[0].title).toBe("Policy");
    expect(warnings[0].message).toMatch(/no headings/);
  });
  it("reads headings from PDF text", () => {
    const sections = sectionsFromPlainText("WORKSHOP SAFETY\nAll staff wear PPE in the workshop at all times.\n\n1.1 Signing in\nSign the register when you arrive.\n• Visitors sign too");
    expect(sections.map((s) => s.title)).toEqual(["Workshop Safety", "1.1 Signing in"]);
    expect(sections[1].body).toContain("- Visitors sign too");
  });
  it("imports the seven Cat Basics courses from the prototype with stable lesson keys", () => {
    const courses = JSON.parse(readFileSync(path.join(process.cwd(), "training-seed/cat-basics/courses.json"), "utf8")) as PrototypeCourse[];
    expect(courses).toHaveLength(7);
    const all = courses.map((c) => lessonsFromPrototype(c));
    expect(all.reduce((n, ls) => n + ls.length, 0)).toBe(187);
    expect(all.reduce((n, ls) => n + ls.reduce((m, l) => m + l.pages.length, 0), 0)).toBe(1681);
    const hyd3 = all[6];
    expect(new Set(hyd3.map((l) => l.stableKey)).size).toBe(hyd3.length);
    expect(hyd3[0].stableKey.startsWith("hyd-3-")).toBe(true);
    expect(hyd3.every((l) => l.format === "TEXT")).toBe(true);
    const pack = JSON.parse(readFileSync(path.join(process.cwd(), "training-seed/cat-basics/img/hyd-3.json"), "utf8")) as { pages: Record<string, string> };
    const withImages = lessonsFromPrototype(courses[6], (id, page) => (pack.pages[`${id}|${page}`] ? "asset" : ""));
    expect(withImages.some((l) => l.format === "TEXT_IMAGES")).toBe(true);
  });
  it("turns the prototype's bullets into list items", () => {
    expect(normalisePrototypeText("Parts:\n• Pump\n• Valve")).toBe("Parts:\n- Pump\n- Valve");
  });
});

describe("Tech Training: compliance and exports", () => {
  const now = new Date("2026-11-28");
  it("sorts each matrix cell", () => {
    expect(matrixCell({ required: true, status: "CERTIFIED", dueDate: null, progressPct: 100, now })).toBe("CERTIFIED");
    expect(matrixCell({ required: true, status: "IN_PROGRESS", dueDate: new Date("2026-11-01"), progressPct: 40, now })).toBe("OVERDUE");
    expect(matrixCell({ required: false, status: null, dueDate: null, progressPct: 0, now })).toBe("NOT_REQUIRED");
    expect(matrixCell({ required: true, status: null, dueDate: null, progressPct: 0, now })).toBe("NOT_STARTED");
    expect(matrixCell({ required: true, status: "AWAITING_APPROVAL", dueDate: null, progressPct: 100, now })).toBe("AWAITING");
  });
  it("flags questions most people get wrong", () => {
    const t = troubleQuestions([{ questionKey: "a", prompt: "A", asked: 10, wrong: 7 }, { questionKey: "b", prompt: "B", asked: 3, wrong: 3 }, { questionKey: "c", prompt: "C", asked: 10, wrong: 2 }]);
    expect(t.map((x) => x.questionKey)).toEqual(["a"]);
  });
  it("writes CSV safely (quotes, and no formula injection)", () => {
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell("=SUM(A1)")).toBe(`"'=SUM(A1)"`);
    expect(toCsv(["a", "b"], [[1, null]])).toBe("a,b\r\n1,\r\n");
  });
});

describe("Tech Training: access", () => {
  it("lets every user type take courses, managers approve, and only Company Admins manage employees and settings", () => {
    for (const role of Object.keys(DEFAULT_TENANT_PERMISSIONS) as Array<keyof typeof DEFAULT_TENANT_PERMISSIONS>) expect(DEFAULT_TENANT_PERMISSIONS[role].has("TRAINING_VIEW")).toBe(true);
    expect(DEFAULT_TENANT_PERMISSIONS.MANAGER.has("TRAINING_APPROVE")).toBe(true);
    expect(DEFAULT_TENANT_PERMISSIONS.MANAGER.has("TRAINING_CONTENT_EDIT")).toBe(true);
    expect(DEFAULT_TENANT_PERMISSIONS.MANAGER.has("TRAINING_EMPLOYEES_MANAGE")).toBe(false);
    expect(DEFAULT_TENANT_PERMISSIONS.MANAGER.has("TRAINING_SETTINGS")).toBe(false);
    expect(DEFAULT_TENANT_PERMISSIONS.COMPANY_ADMIN.has("TRAINING_EMPLOYEES_MANAGE")).toBe(true);
    expect(DEFAULT_TENANT_PERMISSIONS.USER.has("TRAINING_APPROVE")).toBe(false);
  });
  it("is a module tile in both builds, off for new companies", () => {
    expect(TILES.TECH_TRAINING.modules).toEqual(["TECH_TRAINING"]);
    expect(BUILDS.WORKSHOP.tiles).toContain("TECH_TRAINING");
    expect(BUILDS.ENGINEERING.tiles).toContain("TECH_TRAINING");
    expect(BUILDS.WORKSHOP.defaultOn).not.toContain("TECH_TRAINING");
  });
});

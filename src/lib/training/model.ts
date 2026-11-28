// ---------------------------------------------------------------------------
// Tech Training (2026-11-28) - pure rules, no database and no React, so the screens, the services and the tests share them.
// ---------------------------------------------------------------------------

export const TRAINING_MODULE = "TECH_TRAINING" as const;

/** Lesson formats a course can use. A lesson needs no images: Text is the normal format. */
export const LESSON_FORMATS = [
  { id: "TEXT", label: "Text" },
  { id: "TEXT_IMAGES", label: "Text + images" },
  { id: "PDF", label: "Document (PDF)" },
  { id: "VIDEO", label: "Video link" },
] as const;
export type LessonFormat = (typeof LESSON_FORMATS)[number]["id"];

// ---------------------------------------------------------------------------
// South African ID numbers: 13 digits, YYMMDD birth date, Luhn check digit.
// ---------------------------------------------------------------------------

export type IdCheck = { valid: boolean; birthDate: string | null; message: string };

export function checkSaIdNumber(raw: string, today = new Date()): IdCheck {
  const id = (raw ?? "").replace(/\s+/g, "");
  if (!/^\d{13}$/.test(id)) return { valid: false, birthDate: null, message: "An SA ID number has 13 digits." };
  const yy = Number(id.slice(0, 2));
  const mm = Number(id.slice(2, 4));
  const dd = Number(id.slice(4, 6));
  const century = 2000 + yy > today.getFullYear() ? 1900 : 2000;
  const date = new Date(Date.UTC(century + yy, mm - 1, dd));
  if (mm < 1 || mm > 12 || date.getUTCMonth() !== mm - 1 || date.getUTCDate() !== dd) {
    return { valid: false, birthDate: null, message: "The first six digits are not a real birth date (YYMMDD)." };
  }
  if (!luhnValid(id)) return { valid: false, birthDate: null, message: "The check digit does not match. Check the number for a typing mistake." };
  return { valid: true, birthDate: date.toISOString().slice(0, 10), message: "Valid SA ID" };
}

function luhnValid(digits: string): boolean {
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = Number(digits[i]);
    if (double) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

/** ID numbers are shown masked to everyone except Company Admins (POPIA): 920412 •••• 086. */
export function maskIdNumber(id: string): string {
  const clean = (id ?? "").replace(/\s+/g, "");
  if (clean.length < 9) return "••••";
  return `${clean.slice(0, 6)} •••• ${clean.slice(-3)}`;
}

export function fullName(e: { firstName: string; surname: string }): string {
  return `${e.firstName} ${e.surname}`.trim();
}

// ---------------------------------------------------------------------------
// Revisions and certificate numbers
// ---------------------------------------------------------------------------

export function revisionLabel(r: { major: number; minor: number }): string {
  return r.minor > 0 ? `Rev ${r.major}.${r.minor}` : `Rev ${r.major}`;
}

/** The number a new draft gets when it is published at this change level. */
export function nextRevisionNumber(live: { major: number; minor: number } | null, level: "MINOR" | "MAJOR"): { major: number; minor: number } {
  if (!live) return { major: 1, minor: 0 };
  return level === "MAJOR" ? { major: live.major + 1, minor: 0 } : { major: live.major, minor: live.minor + 1 };
}

const BASE32 = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function certificateNumber(prefix: string, courseCode: string, at: Date, random: () => number = Math.random): string {
  const ymd = `${at.getFullYear()}${String(at.getMonth() + 1).padStart(2, "0")}${String(at.getDate()).padStart(2, "0")}`;
  let tail = "";
  for (let i = 0; i < 4; i++) tail += BASE32[Math.floor(random() * BASE32.length) % BASE32.length];
  const code = courseCode.toUpperCase().replace(/[^A-Z0-9-]/g, "");
  return [prefix.toUpperCase().replace(/[^A-Z0-9]/g, ""), code, ymd, tail].filter(Boolean).join("-");
}

export function courseCodeOk(code: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9-]{0,23}$/.test(code);
}

// ---------------------------------------------------------------------------
// Quiz marking
// ---------------------------------------------------------------------------

export type MarkQuestion = { id: string; answer: number[]; lessonKey: string };

export function isCorrect(question: { answer: number[] }, given: number[] | undefined): boolean {
  const want = [...new Set(question.answer)].sort((a, b) => a - b);
  const got = [...new Set(given ?? [])].sort((a, b) => a - b);
  return want.length === got.length && want.every((v, i) => v === got[i]);
}

export type MarkResult = { correct: number; total: number; score: number; passed: boolean; wrongIds: string[]; weakLessonKeys: string[] };

export function markQuiz(questions: MarkQuestion[], answers: Record<string, number[]>, passMark: number): MarkResult {
  let correct = 0;
  const wrongIds: string[] = [];
  const weak = new Map<string, number>();
  for (const q of questions) {
    if (isCorrect(q, answers[q.id])) correct++;
    else {
      wrongIds.push(q.id);
      if (q.lessonKey) weak.set(q.lessonKey, (weak.get(q.lessonKey) ?? 0) + 1);
    }
  }
  const total = questions.length;
  const score = total ? Math.round((100 * correct) / total) : 0;
  const weakLessonKeys = [...weak.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
  return { correct, total, score, passed: total > 0 && score >= passMark, wrongIds, weakLessonKeys };
}

/** Attempts the learner still has. Each "Reset attempts" by an approver gives a fresh set; every attempt stays on record. */
export function attemptsLeft(maxAttempts: number, used: number, resets: number): number {
  return Math.max(0, maxAttempts * (1 + Math.max(0, resets)) - used);
}

export function shuffle<T>(items: readonly T[], random: () => number = Math.random): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export const FINAL_QUIZ_SIZE = 25;
export const PRE_ASSESSMENT_SIZE = 10;
export const MIN_FINAL_QUESTIONS = 5;

// ---------------------------------------------------------------------------
// Time
// ---------------------------------------------------------------------------

/** "18 days 6 h", "3 h 12 min", "27 min" - for elapsed course time. */
export function formatElapsed(fromIso: string | Date | null | undefined, toIso: string | Date | null | undefined): string {
  if (!fromIso || !toIso) return "—";
  const ms = new Date(toIso).getTime() - new Date(fromIso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "—";
  const min = Math.floor(ms / 60000);
  const days = Math.floor(min / 1440);
  const hours = Math.floor((min % 1440) / 60);
  if (days > 0) return `${days} day${days === 1 ? "" : "s"}${hours ? ` ${hours} h` : ""}`;
  if (hours > 0) return `${hours} h ${min % 60} min`;
  return `${min} min`;
}

/** Active learning time from seconds: "11 h 40 min", "27 min", "under a minute". */
export function formatSeconds(seconds: number | null | undefined): string {
  const s = Math.max(0, Math.round(seconds ?? 0));
  if (s < 60) return s === 0 ? "—" : "under a minute";
  const min = Math.floor(s / 60);
  const hours = Math.floor(min / 60);
  return hours ? `${hours} h ${min % 60} min` : `${min} min`;
}

/** A heartbeat adds the seconds since the last one, capped so a tab left open does not count as learning. */
export function heartbeatSeconds(lastSeenAt: Date | null, now: Date, claimed: number): number {
  const cap = 90;
  const sinceLast = lastSeenAt ? Math.floor((now.getTime() - lastSeenAt.getTime()) / 1000) : cap;
  return Math.max(0, Math.min(cap, Math.round(claimed || 0), sinceLast + 5));
}

export function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}

/** Working days between two dates (Mon-Fri), for the approval escalation. */
export function workingDaysBetween(from: Date, to: Date): number {
  let n = 0;
  const d = new Date(from);
  d.setHours(0, 0, 0, 0);
  const end = new Date(to);
  end.setHours(0, 0, 0, 0);
  while (d < end) {
    d.setDate(d.getDate() + 1);
    const day = d.getDay();
    if (day !== 0 && day !== 6) n++;
  }
  return n;
}

// ---------------------------------------------------------------------------
// Revision cards (spaced review): Leitner boxes.
// ---------------------------------------------------------------------------

export const CARD_INTERVAL_DAYS = [1, 3, 7, 14, 30];

export function nextCardBox(box: number, correct: boolean): { box: number; days: number } {
  const next = correct ? Math.min(CARD_INTERVAL_DAYS.length, box + 1) : 1;
  return { box: next, days: CARD_INTERVAL_DAYS[next - 1] };
}

// ---------------------------------------------------------------------------
// Course content: lessons, chapters, keys, change detection
// ---------------------------------------------------------------------------

export type DraftLesson = {
  stableKey: string;
  chapterKey: string;
  chapterTitle: string;
  topicTitle: string;
  title: string;
  format: LessonFormat;
  objective: string;
  pages: string[];
  pageImages: string[];
  pdfAssetId: string | null;
  videoUrl: string | null;
  safetyPoint: string;
  practicalTask: string;
  estMinutes: number;
};

export type DraftQuestion = {
  stableKey: string;
  scope: "FINAL" | "CHECK";
  chapterKey: string;
  lessonKey: string;
  prompt: string;
  options: string[];
  answer: number[];
  explanation: string;
};

export function newKey(prefix = "k", random: () => number = Math.random): string {
  let s = "";
  for (let i = 0; i < 10; i++) s += "abcdefghijkmnpqrstuvwxyz23456789"[Math.floor(random() * 32)];
  return `${prefix}-${s}`;
}

export function wordCount(text: string): number {
  return (text.match(/[A-Za-z0-9À-ɏ']+/g) ?? []).length;
}

/** Reading time from the words on every page: about 180 words a minute for technical text, at least 2 minutes. */
export function estimateMinutes(pages: string[]): number {
  const words = pages.reduce((n, p) => n + wordCount(p), 0);
  return Math.max(2, Math.round(words / 180));
}

export function lessonSignature(l: Pick<DraftLesson, "title" | "format" | "objective" | "pages" | "pageImages" | "pdfAssetId" | "videoUrl" | "safetyPoint" | "practicalTask">): string {
  return JSON.stringify([l.title, l.format, l.objective, l.pages, l.pageImages, l.pdfAssetId ?? "", l.videoUrl ?? "", l.safetyPoint, l.practicalTask]);
}

export type LessonChange = "SAME" | "CHANGED" | "NEW";

/** Compare a draft to the live revision, lesson by lesson (matched on stableKey). */
export function diffLessons(live: DraftLesson[], draft: DraftLesson[]): { changes: Record<string, LessonChange>; removed: DraftLesson[]; counts: { changed: number; added: number; removed: number } } {
  const byKey = new Map(live.map((l) => [l.stableKey, l]));
  const changes: Record<string, LessonChange> = {};
  let changed = 0;
  let added = 0;
  for (const l of draft) {
    const before = byKey.get(l.stableKey);
    if (!before) { changes[l.stableKey] = "NEW"; added++; }
    else if (lessonSignature(before) !== lessonSignature(l)) { changes[l.stableKey] = "CHANGED"; changed++; }
    else changes[l.stableKey] = "SAME";
  }
  const draftKeys = new Set(draft.map((l) => l.stableKey));
  const removed = live.filter((l) => !draftKeys.has(l.stableKey));
  return { changes, removed, counts: { changed, added, removed: removed.length } };
}

export function questionsSignature(qs: DraftQuestion[]): string {
  return JSON.stringify(qs.map((q) => [q.stableKey, q.scope, q.chapterKey, q.lessonKey, q.prompt, q.options, q.answer]));
}

/** Word-level diff for "Compare with live": a list of runs, each same / added / removed. */
export function wordDiff(before: string, after: string): Array<{ kind: "same" | "add" | "del"; text: string }> {
  const a = before.split(/(\s+)/).filter((t) => t.length);
  const b = after.split(/(\s+)/).filter((t) => t.length);
  if (a.length * b.length > 4_000_000) return [{ kind: "del", text: before }, { kind: "add", text: after }];
  const m = a.length;
  const n = b.length;
  const dp: Uint16Array[] = Array.from({ length: m + 1 }, () => new Uint16Array(n + 1));
  for (let i = m - 1; i >= 0; i--) for (let j = n - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out: Array<{ kind: "same" | "add" | "del"; text: string }> = [];
  const push = (kind: "same" | "add" | "del", text: string) => {
    const last = out[out.length - 1];
    if (last && last.kind === kind) last.text += text; else out.push({ kind, text });
  };
  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (a[i] === b[j]) { push("same", a[i]); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { push("del", a[i]); i++; }
    else { push("add", b[j]); j++; }
  }
  while (i < m) push("del", a[i++]);
  while (j < n) push("add", b[j++]);
  return out;
}

/** Group lessons into chapters, in order of first appearance. */
export function chaptersOf<T extends { chapterKey: string; chapterTitle: string }>(lessons: T[]): Array<{ key: string; title: string; lessons: T[] }> {
  const out: Array<{ key: string; title: string; lessons: T[] }> = [];
  const index = new Map<string, number>();
  for (const l of lessons) {
    let i = index.get(l.chapterKey);
    if (i === undefined) { i = out.length; index.set(l.chapterKey, i); out.push({ key: l.chapterKey, title: l.chapterTitle, lessons: [] }); }
    out[i].lessons.push(l);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Splitting long text into pages (imports and the editor's "Split into pages")
// ---------------------------------------------------------------------------

export const PAGE_WORDS = 350;
export const LONG_LESSON_WORDS = 1500;

/** Split text into pages of about PAGE_WORDS words, only at blank lines (paragraphs, lists and tables stay whole). */
export function splitIntoPages(text: string, target = PAGE_WORDS): string[] {
  const blocks = text.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  const pages: string[] = [];
  let current: string[] = [];
  let words = 0;
  for (const block of blocks) {
    const w = wordCount(block);
    if (current.length && words + w > target) { pages.push(current.join("\n\n")); current = []; words = 0; }
    current.push(block);
    words += w;
  }
  if (current.length) pages.push(current.join("\n\n"));
  return pages.length ? pages : [""];
}

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

/** The Service Tech Training prototype's course format (courses.json). */
export type PrototypeCourse = {
  id: string;
  group: string;
  title: string;
  overview?: string[];
  chapters: Array<{ title: string; intro?: string[]; topics: Array<{ title: string; summary?: string; lessons: Array<{ id: string; title: string; objective?: string; pages: string[] }> }> }>;
};

/** The prototype's image pack (img/<course>.json): which image sits on which page, and the images as data URLs. */
export type PrototypeImagePack = { pages: Record<string, string>; img: Record<string, string> };

export function isPrototypeCourse(value: unknown): value is PrototypeCourse {
  const v = value as PrototypeCourse;
  return !!v && typeof v === "object" && typeof v.id === "string" && typeof v.title === "string" && Array.isArray(v.chapters);
}

/** Prototype lessons to draft lessons. `image(lessonId, page)` returns the asset id for a page, or "". */
export function lessonsFromPrototype(course: PrototypeCourse, image: (lessonId: string, page: number) => string = () => ""): DraftLesson[] {
  const out: DraftLesson[] = [];
  course.chapters.forEach((ch, ci) => {
    const chapterKey = `${course.id}-ch${ci}`;
    for (const topic of ch.topics) {
      for (const l of topic.lessons) {
        const pages = (l.pages ?? []).map((p) => normalisePrototypeText(p));
        const pageImages = pages.map((_, i) => image(l.id, i));
        out.push({
          stableKey: l.id, chapterKey, chapterTitle: ch.title, topicTitle: topic.title, title: l.title,
          format: pageImages.some(Boolean) ? "TEXT_IMAGES" : "TEXT", objective: (l.objective ?? "").trim(), pages: pages.length ? pages : [""],
          pageImages, pdfAssetId: null, videoUrl: null, safetyPoint: "", practicalTask: "", estMinutes: estimateMinutes(pages),
        });
      }
    }
  });
  return out;
}

/** The prototype used "•" for bullets; the light markdown uses "- ". */
export function normalisePrototypeText(text: string): string {
  return (text ?? "").replace(/\r\n/g, "\n").split("\n").map((line) => line.replace(/^\s*[•▪●◦]\s*/, "- ")).join("\n").trim();
}

export type ImportWarning = { lesson: string; message: string };

/** Headings from an imported document become chapters and lessons. */
export function lessonsFromSections(sections: Array<{ level: number; title: string; body: string }>, docTitle: string, random: () => number = Math.random): { lessons: DraftLesson[]; warnings: ImportWarning[] } {
  const warnings: ImportWarning[] = [];
  const hasL1 = sections.some((s) => s.level === 1);
  const hasL2 = sections.some((s) => s.level === 2);
  const lessons: DraftLesson[] = [];
  let chapterKey = newKey("ch", random);
  let chapterTitle = hasL1 && hasL2 ? docTitle : "Chapter 1";
  let pendingIntro = "";
  for (const s of sections) {
    const isChapter = hasL1 && hasL2 && s.level === 1;
    const isLesson = hasL1 && hasL2 ? s.level === 2 : s.level >= 1 && s.level <= 2;
    if (isChapter) {
      chapterKey = newKey("ch", random);
      chapterTitle = s.title || "Chapter";
      pendingIntro = s.body.trim();
      continue;
    }
    if (!isLesson) {
      // Text with no heading of its own (or a deeper heading) goes onto the previous lesson.
      const last = lessons[lessons.length - 1];
      const extra = [s.level >= 3 && s.title ? `### ${s.title}` : "", s.body].filter(Boolean).join("\n\n");
      if (last) last.pages = splitIntoPages([last.pages.join("\n\n"), extra].filter(Boolean).join("\n\n"));
      else pendingIntro = [pendingIntro, extra].filter(Boolean).join("\n\n");
      if (last && !s.title && extra.trim()) warnings.push({ lesson: last.title, message: "Text with no heading was added to the lesson before it." });
      continue;
    }
    const body = [pendingIntro, s.body].filter(Boolean).join("\n\n");
    pendingIntro = "";
    const words = wordCount(body);
    const pages = splitIntoPages(body);
    if (words > LONG_LESSON_WORDS) warnings.push({ lesson: s.title, message: `${words} words, split into ${pages.length} pages. Check the page breaks.` });
    if (!body.trim()) warnings.push({ lesson: s.title, message: "This lesson has a heading but no text." });
    lessons.push({ stableKey: newKey("l", random), chapterKey, chapterTitle, topicTitle: "", title: s.title || "Lesson", format: "TEXT", objective: "", pages, pageImages: pages.map(() => ""), pdfAssetId: null, videoUrl: null, safetyPoint: "", practicalTask: "", estMinutes: estimateMinutes(pages) });
  }
  if (!lessons.length && pendingIntro.trim()) {
    const pages = splitIntoPages(pendingIntro);
    lessons.push({ stableKey: newKey("l", random), chapterKey, chapterTitle, topicTitle: "", title: docTitle || "Lesson 1", format: "TEXT", objective: "", pages, pageImages: pages.map(() => ""), pdfAssetId: null, videoUrl: null, safetyPoint: "", practicalTask: "", estMinutes: estimateMinutes(pages) });
    warnings.push({ lesson: docTitle, message: "The document had no headings, so it became one lesson. Add headings in Word to split it into lessons." });
  }
  return { lessons, warnings };
}

/** Very small HTML (from mammoth's Word conversion) to sections of light markdown. Only the tags Word produces are handled. */
export function htmlToSections(html: string): Array<{ level: number; title: string; body: string }> {
  const sections: Array<{ level: number; title: string; body: string }> = [{ level: 0, title: "", body: "" }];
  const add = (text: string) => {
    const cur = sections[sections.length - 1];
    cur.body = cur.body ? `${cur.body}\n\n${text}` : text;
  };
  const tokens = html.replace(/\r?\n/g, " ").match(/<(h[1-6]|p|ul|ol|table)\b[^>]*>[\s\S]*?<\/\1>/gi) ?? [];
  for (const tok of tokens) {
    const tag = tok.slice(1, 3).toLowerCase();
    if (/^h[1-6]$/.test(tag)) {
      sections.push({ level: Number(tag[1]), title: inlineText(tok), body: "" });
    } else if (tag === "ul" || tag === "ol") {
      const items = tok.match(/<li\b[^>]*>[\s\S]*?<\/li>/gi) ?? [];
      add(items.map((li, i) => `${tag === "ol" ? `${i + 1}.` : "-"} ${inlineText(li)}`).join("\n"));
    } else if (tag === "ta") {
      const rows = (tok.match(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi) ?? []).map((tr) => (tr.match(/<t[dh]\b[^>]*>[\s\S]*?<\/t[dh]>/gi) ?? []).map((c) => inlineText(c).replace(/\|/g, "/")));
      if (rows.length) {
        const width = Math.max(...rows.map((r) => r.length));
        const pad = (r: string[]) => `| ${[...r, ...Array(width - r.length).fill("")].join(" | ")} |`;
        add([pad(rows[0]), `|${" --- |".repeat(width)}`, ...rows.slice(1).map(pad)].join("\n"));
      }
    } else {
      const text = inlineText(tok);
      if (text) add(text);
    }
  }
  return sections.filter((s, i) => i > 0 || s.body.trim());
}

function inlineText(html: string): string {
  return decodeEntities(
    html
      .replace(/<(strong|b)\b[^>]*>([\s\S]*?)<\/\1>/gi, (_m, _t, inner) => `**${inner}**`)
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<[^>]+>/g, ""),
  ).replace(/\*\*\s*\*\*/g, "").replace(/\s+/g, " ").trim();
}

function decodeEntities(s: string): string {
  return s.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#(\d+);/g, (_m, n) => String.fromCharCode(Number(n)));
}

/** Text pulled from a PDF, one entry per PDF page, to lessons: lines in capitals or short title-like lines start a lesson. */
export function sectionsFromPlainText(text: string): Array<{ level: number; title: string; body: string }> {
  const lines = text.replace(/\r/g, "").split("\n");
  const sections: Array<{ level: number; title: string; body: string }> = [{ level: 0, title: "", body: "" }];
  let para: string[] = [];
  const flush = () => {
    if (!para.length) return;
    const cur = sections[sections.length - 1];
    const t = para.join(" ").replace(/\s+/g, " ").trim();
    if (t) cur.body = cur.body ? `${cur.body}\n\n${t}` : t;
    para = [];
  };
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) { flush(); continue; }
    const looksHeading = line.length <= 70 && !/[.,;:]$/.test(line) && wordCount(line) <= 9 && (/^[A-Z0-9][A-Z0-9 &/()-]+$/.test(line) || /^\d+(\.\d+)*\s+\S/.test(line));
    if (looksHeading) { flush(); sections.push({ level: /^\d+\.\d+/.test(line) ? 2 : 1, title: toTitle(line), body: "" }); continue; }
    if (/^[•▪●-]\s+/.test(line)) { flush(); const cur = sections[sections.length - 1]; cur.body = `${cur.body}${cur.body && !cur.body.endsWith("\n") ? "\n\n" : ""}- ${line.replace(/^[•▪●-]\s+/, "")}`; continue; }
    para.push(line);
  }
  flush();
  return sections.filter((s, i) => i > 0 || s.body.trim());
}

function toTitle(line: string): string {
  if (line !== line.toUpperCase()) return line;
  return line.toLowerCase().replace(/(^|\s|\/)([a-z])/g, (_m, a, b) => a + b.toUpperCase());
}

// ---------------------------------------------------------------------------
// Compliance
// ---------------------------------------------------------------------------

export type MatrixCell = "CERTIFIED" | "AWAITING" | "IN_PROGRESS" | "ASSIGNED" | "OVERDUE" | "ACKNOWLEDGED" | "NOT_REQUIRED" | "NOT_STARTED";

export function matrixCell(input: { required: boolean; status: string | null; dueDate: Date | null; progressPct: number; now: Date }): MatrixCell {
  const { required, status, dueDate, now } = input;
  if (status === "CERTIFIED") return "CERTIFIED";
  if (status === "ACKNOWLEDGED") return "ACKNOWLEDGED";
  if (status === "AWAITING_APPROVAL") return "AWAITING";
  if (dueDate && dueDate < now && required) return "OVERDUE";
  if (status === "IN_PROGRESS") return "IN_PROGRESS";
  if (status === "ASSIGNED") return "ASSIGNED";
  return required ? "NOT_STARTED" : "NOT_REQUIRED";
}

/** Questions most learners get wrong (at least 5 answers and half wrong) are candidates for a corrective action. */
export function troubleQuestions(stats: Array<{ questionKey: string; prompt: string; asked: number; wrong: number }>, minAsked = 5, failRate = 0.5) {
  return stats.filter((s) => s.asked >= minAsked && s.wrong / s.asked >= failRate).sort((a, b) => b.wrong / b.asked - a.wrong / a.asked);
}

export function csvCell(value: unknown): string {
  const s = value === null || value === undefined ? "" : value instanceof Date ? value.toISOString() : String(value);
  return /[",\n\r]/.test(s) || /^[=+\-@]/.test(s) ? `"${(/^[=+\-@]/.test(s) ? `'${s}` : s).replace(/"/g, '""')}"` : s;
}

export function toCsv(header: string[], rows: unknown[][]): string {
  return [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

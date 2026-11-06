// ---------------------------------------------------------------------------
// Jobs & WIP — the Board view (2026-11-06, user request after the mockup "Jobs & WIP view options"):
// the same jobs as the table, shown as cards in lanes so "where is everything and what is late?" can be
// read at a glance. The table stays the default view; this file is plain logic (no React, no server-only
// imports) so it can be tested on its own and used from the server page and the client board alike.
//
// Lanes are the stage groups the user approved: Receiving, Quote and approval, Workshop, Parts and
// outwork, Delivery. A switch on the board can split them into one lane per status instead. Completed
// jobs are left out unless asked for. Inside a lane the late jobs come first.
// ---------------------------------------------------------------------------

import { ENGINEERING_STATUS_STEPS, MAIN_WORKSHOP_STATUS_STEPS, etaOverdueDays, jobStatusLabelsFor, jobTypeLabelsFor, type BuildKey } from "@/lib/jobs/ui";

// Remembered per browser: the server page reads this cookie so the chosen view is there on first paint (no flash of the table).
export const JOBS_LAYOUT_COOKIE = "apollox.jobsLayout";
export type JobsLayout = "table" | "board";
export function normalizeJobsLayout(value: unknown): JobsLayout {
  return value === "board" ? "board" : "table";
}

export type BoardLaneMode = "stage" | "status";

// The board's own lane style and "show completed" choice, also kept in a cookie (one value, e.g. "status.1") so the server render matches.
export const JOBS_BOARD_PREFS_COOKIE = "apollox.jobsBoardPrefs";
export type BoardPrefs = { mode: BoardLaneMode; showCompleted: boolean };
export function parseBoardPrefs(value: unknown): BoardPrefs {
  const [mode, completed] = typeof value === "string" ? value.split(".") : [];
  return { mode: mode === "status" ? "status" : "stage", showCompleted: completed === "1" };
}
export function serializeBoardPrefs(prefs: BoardPrefs): string {
  return `${prefs.mode}.${prefs.showCompleted ? "1" : "0"}`;
}

export type BoardLaneDef = { key: string; name: string; statuses: string[]; core: boolean };

// Core lanes always show (even empty) in stage mode; the others only appear when a job is in them.
export const STAGE_LANES: BoardLaneDef[] = [
  { key: "receiving", name: "Receiving", statuses: ["TO_BE_COLLECTED", "TO_BE_RECEIVED", "TO_STRIP", "AWAIT_ASSESSMENT", "RECEIVED", "INSPECTING"], core: true },
  { key: "quote", name: "Quote and approval", statuses: ["QUOTE_IN_PROGRESS", "AWAITING_GO_AHEAD"], core: true },
  { key: "workshop", name: "Workshop", statuses: ["STRIPPING", "ASSEMBLY", "TESTING", "TO_PAINT_WRAP", "WORK_IN_PROGRESS", "QC_CONTROL"], core: true },
  { key: "parts", name: "Parts and outwork", statuses: ["AWAIT_OUTWORK", "WAITING_FOR_PARTS"], core: true },
  { key: "delivery", name: "Delivery", statuses: ["TO_BE_DELIVERED", "DELIVERED_AWAITING_PAYMENT"], core: true },
  { key: "field", name: "Field service", statuses: ["TO_ATTEND", "ON_ROUTE", "IN_PROGRESS", "AWAIT_PAYMENT"], core: false },
  { key: "completed", name: "Completed", statuses: ["COMPLETE", "CLOSED", "CANCELLED"], core: false },
  { key: "other", name: "Other", statuses: [], core: false },
];

export const COMPLETED_STATUSES: readonly string[] = ["COMPLETE", "CLOSED", "CANCELLED"];

export function isCompletedStatus(status: string): boolean {
  return COMPLETED_STATUSES.includes(status);
}

export function stageLaneKey(status: string): string {
  return STAGE_LANES.find((lane) => lane.statuses.includes(status))?.key ?? "other";
}

// The wording under a lane's name: the statuses that live in it for this company's build.
export function laneSubtitle(lane: BoardLaneDef, build?: BuildKey): string {
  const labels = jobStatusLabelsFor(build);
  const flow = new Set<string>(flowStatuses(build));
  const shown = lane.statuses.filter((s) => flow.has(s));
  // "To be collected" and "To be received" read as one step on the job screen.
  const deduped = shown.filter((s) => !(s === "TO_BE_COLLECTED" && shown.includes("TO_BE_RECEIVED")));
  return deduped.map((s) => (s === "TO_BE_RECEIVED" && build !== "ENGINEERING" ? "To be received/collected" : labels[s as keyof typeof labels] ?? s)).join(" · ");
}

// The statuses of the company's flow, in order (Field service is added by the lane itself).
function flowStatuses(build?: BuildKey): string[] {
  const base: string[] = build === "ENGINEERING" ? [...ENGINEERING_STATUS_STEPS] : [...MAIN_WORKSHOP_STATUS_STEPS];
  return [...base, "WAITING_FOR_PARTS", "TO_ATTEND", "ON_ROUTE", "IN_PROGRESS", "AWAIT_PAYMENT"];
}

// ---- cards -----------------------------------------------------------------

export type BoardJobInput = {
  id: string;
  href: string;
  jobNumber: string | null;
  draftNumber: string | null;
  customerName: string | null;
  component: string | null;
  machineMake: string | null;
  machineModel: string | null;
  status: string;
  type: string;
  returnedUnrepaired: boolean;
  breakdown: boolean;
  pex: boolean;
  itemStatuses: string[];
  people: Array<string | null | undefined>;
  mechanicEtaDate: Date | string | null;
  etaDate: Date | string | null;
};

export type BoardCard = {
  id: string;
  href: string;
  num: string;
  customer: string | null;
  what: string;
  status: string;
  type: string;
  typeLabel: string;
  returnedUnrepaired: boolean;
  breakdown: boolean;
  pex: boolean;
  itemCount: number;
  mixed: boolean;
  people: string[];
  etaLabel: string | null;
  lateDays: number | null;
  etaSort: number | null;
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

// "03 Nov", worked out on the UTC day like the rest of the ETA logic (etaOverdueDays) so the server render and the browser agree.
export function boardDateLabel(value: Date | string | null | undefined): string | null {
  const date = toDate(value);
  if (!date) return null;
  return `${String(date.getUTCDate()).padStart(2, "0")} ${MONTHS[date.getUTCMonth()]}`;
}

export function toBoardCard(job: BoardJobInput, build?: BuildKey, now: Date = new Date()): BoardCard {
  const machine = [job.machineMake, job.machineModel].filter(Boolean).join(" ");
  // Late means the same as the "ETA Overdue" column and the dashboard's Overdue ETA card: past the Mechanic/Machinist ETA.
  // A job with no Mechanic ETA still shows its customer ETA, but is never marked late from it.
  const shownEta = toDate(job.mechanicEtaDate) ?? toDate(job.etaDate);
  const people: string[] = [];
  for (const name of job.people) if (name && !people.includes(name)) people.push(name);
  return {
    id: job.id,
    href: job.href,
    num: job.jobNumber || job.draftNumber || "—",
    customer: job.customerName,
    what: [job.component, machine].filter(Boolean).join(" · ") || "—",
    status: job.status,
    type: job.type,
    typeLabel: jobTypeLabelsFor(build)[job.type as keyof ReturnType<typeof jobTypeLabelsFor>] ?? job.type,
    returnedUnrepaired: job.returnedUnrepaired,
    breakdown: job.breakdown,
    pex: job.pex,
    itemCount: job.itemStatuses.length > 1 ? job.itemStatuses.length : 0,
    mixed: job.itemStatuses.length > 1 && new Set(job.itemStatuses).size > 1,
    people,
    etaLabel: boardDateLabel(shownEta),
    lateDays: etaOverdueDays(job.mechanicEtaDate, job.status, now),
    etaSort: shownEta ? shownEta.getTime() : null,
  };
}

// Late jobs first (the most late on top), then the nearest ETA, jobs with no ETA last, then newest number.
export function compareBoardCards(a: BoardCard, b: BoardCard): number {
  const lateA = a.lateDays ?? 0;
  const lateB = b.lateDays ?? 0;
  if (lateA !== lateB) return lateB - lateA;
  if (a.etaSort !== b.etaSort) {
    if (a.etaSort === null) return 1;
    if (b.etaSort === null) return -1;
    return a.etaSort - b.etaSort;
  }
  return b.num.localeCompare(a.num, "en", { numeric: true });
}

// ---- lanes -----------------------------------------------------------------

export type BoardLane = { key: string; name: string; subtitle: string; cards: BoardCard[] };

export type BoardFilters = {
  lateOnly?: boolean;
  person?: string;
  type?: string;
  showCompleted?: boolean;
};

export function filterBoardCards(cards: readonly BoardCard[], filters: BoardFilters): BoardCard[] {
  return cards.filter((card) => {
    if (!filters.showCompleted && isCompletedStatus(card.status)) return false;
    if (filters.lateOnly && card.lateDays === null) return false;
    if (filters.person && !card.people.includes(filters.person)) return false;
    if (filters.type && card.type !== filters.type) return false;
    return true;
  });
}

export function buildBoardLanes(cards: readonly BoardCard[], mode: BoardLaneMode, build?: BuildKey): BoardLane[] {
  const sorted = [...cards].sort(compareBoardCards);
  const labels = jobStatusLabelsFor(build);
  if (mode === "status") {
    const flow = (build === "ENGINEERING" ? ENGINEERING_STATUS_STEPS : MAIN_WORKSHOP_STATUS_STEPS).map(String).filter((s) => !isCompletedStatus(s));
    const extra: string[] = [];
    for (const card of sorted) if (!flow.includes(card.status) && !extra.includes(card.status)) extra.push(card.status);
    const order = [...flow, ...extra];
    return order
      .map((status) => ({ key: status, name: labels[status as keyof typeof labels] ?? status, subtitle: "", cards: sorted.filter((c) => c.status === status) }))
      .filter((lane) => lane.cards.length > 0 || flow.includes(lane.key));
  }
  return STAGE_LANES.map((lane) => ({ key: lane.key, name: lane.name, subtitle: laneSubtitle(lane, build), cards: sorted.filter((c) => stageLaneKey(c.status) === lane.key), core: lane.core }))
    .filter((lane) => lane.core || lane.cards.length > 0)
    .map(({ key, name, subtitle, cards: laneCards }) => ({ key, name, subtitle, cards: laneCards }));
}

export function boardSummary(cards: readonly BoardCard[]): { active: number; late: number } {
  const active = cards.filter((c) => !isCompletedStatus(c.status));
  return { active: active.length, late: active.filter((c) => c.lateDays !== null).length };
}

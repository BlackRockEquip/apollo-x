import { Prisma } from "@prisma/client";

type JobStatus = Prisma.JobGetPayload<{ select: { status: true } }>["status"];
type JobType = Prisma.JobGetPayload<{ select: { type: true } }>["type"];

// Wording matched to ModApp's own stepper labels (enumLabel/
// ENUM_LABEL_OVERRIDES in its src/lib/utils.ts), converted to Apollo X's
// sentence-case house style rather than ModApp's Title Case — same
// "borrow ModApp's terminology, keep Apollo's typographic conventions"
// approach used for the PEX table rebuild. Six values changed from the
// wording this file previously had (2026-09-10):
//  - AWAITING_GO_AHEAD "Awaiting go-ahead" -> "Await go ahead" (ModApp:
//    AWAIT_GO_AHEAD, "Await Go Ahead").
//  - AWAIT_OUTWORK "Awaiting outwork" -> "Await outwork" (ModApp renamed
//    its own AWAIT_OUTWORK to "Await Parts and Outwork" on 2026-08-22
//    since ModApp has no separate parts-waiting stage and folded that
//    meaning into this one — Apollo X already has a distinct
//    WAITING_FOR_PARTS step below, so only the "Await" wording is taken
//    here; importing "Parts and" too would make two different Apollo X
//    steps both claim to be about parts).
//  - ASSEMBLY "Assembly" -> "Assembling" (ModApp: ASSEMBLING, "Assembling").
//  - DELIVERED_AWAITING_PAYMENT "Delivered - awaiting payment" ->
//    "Delivered awaiting payment" (ModApp has no hyphen).
//  - COMPLETE "Complete" -> "Completed" (ModApp's equivalent value is
//    literally named COMPLETED; Apollo X's own enum value stays COMPLETE,
//    only this label text changed).
//  - AWAIT_PAYMENT "Awaiting payment" -> "Await payment" (ModApp:
//    AWAIT_PAYMENT, "Await Payment" — same enum value name in both apps).
// Left unchanged: TO_PAINT_WRAP stays "To paint / wrap" — ModApp's own
// code comment says the intended wording is "To Paint/Wrap", but its
// enumLabel() has no override for this value, so ModApp actually renders
// the punctuation-free "To Paint Wrap" on screen today. Matching Apollo X's
// existing slash-separated wording to ModApp's evidently-unintended
// literal output seemed like the wrong call — flagged here in case that
// reasoning should go the other way.
// DRAFT, TO_BE_COLLECTED, QUOTE_IN_PROGRESS and WAITING_FOR_PARTS have no
// ModApp equivalent at all (Apollo X's own 14-step flow is deliberately
// richer than ModApp's 11-step one — see the JOB_FLOW_FAMILIES comment
// below), so there is no ModApp wording to match for those four.
export const JOB_STATUS_LABELS: Record<JobStatus, string> = {
  DRAFT: "Draft",
  TO_BE_COLLECTED: "To be collected",
  TO_BE_RECEIVED: "To be received",
  TO_STRIP: "To strip",
  STRIPPING: "Stripping",
  QUOTE_IN_PROGRESS: "Quote in progress",
  AWAITING_GO_AHEAD: "Await go ahead",
  // Combined with WAITING_FOR_PARTS into a single stepper stage on
  // 2026-09-10 at the user's request ("technically they both are the same
  // thing") — see the MAIN_WORKSHOP_STATUS_STEPS comment below and
  // JobWorkspace.tsx's stepper status-normalization. This label is also
  // still what any job actually stored on AWAIT_OUTWORK shows elsewhere
  // (status pill, header line) — WAITING_FOR_PARTS keeps its own label
  // below for that same purpose, it's just no longer a separate stepper
  // stage.
  AWAIT_OUTWORK: "Await outwork / parts",
  WAITING_FOR_PARTS: "Waiting for parts",
  ASSEMBLY: "Assembling",
  TESTING: "Testing",
  TO_PAINT_WRAP: "To paint / wrap",
  TO_BE_DELIVERED: "To be delivered",
  DELIVERED_AWAITING_PAYMENT: "Delivered awaiting payment",
  COMPLETE: "Completed",
  CLOSED: "Closed",
  CANCELLED: "Cancelled",
  RETURNED_UNREPAIRED: "Returned unrepaired",
  TO_ATTEND: "To attend",
  ON_ROUTE: "On route",
  IN_PROGRESS: "In progress",
  AWAIT_PAYMENT: "Await payment",
  RECEIVED: "Received",
  INSPECTING: "Inspecting",
};

export const JOB_TYPE_LABELS: Record<JobType, string> = {
  STANDARD_REPAIR: "Standard repair",
  PARTIAL_REPAIR: "Partial repair",
  PEX_SUPPLY: "PEX supply",
  PEX_RETURN: "PEX return",
  OUTRIGHT_SALE: "Outright sale",
  FIELD_SERVICE: "Field service",
  WARRANTY: "Warranty",
};

// ----------------------------------------------------------------------------
// Job status-flow families
// ----------------------------------------------------------------------------
// Which ordered set of JobStatus values a job's stepper shows is a pure
// function of its JobType, same pattern as ModApp (isMainWorkshopFlow +
// JOB_STATUS_STEPS/FIELD_JOB_STATUS_STEPS/PARTS_SUPPLY_STATUS_STEPS in its
// jobs/[id]/page.tsx) — not a stored column. Apollo X currently has two
// families in real use: every JobType except FIELD_SERVICE follows the main
// workshop flow, including PEX_SUPPLY/PEX_RETURN. As of the 2026-09-09 full
// replace of Apollo X's PEX bookkeeping with ModApp's own PexRecord/
// PexStatus model (see schema.prisma's PexRecord comment), a PEX job's
// PexStatus is now derived FROM this same ordinary JobStatus field (see
// JOB_STATUS_TO_PEX_STATUS in pex/service.ts) rather than tracked
// separately — there's no independent PEX flow to speak of, just this one.
// The RECEIVED/INSPECTING statuses
// exist on JobStatus already so a dedicated "parts supply" JobType/flow
// (matching ModApp's separate PARTS_SUPPLY job type) can be added later
// without another enum migration — Apollo X doesn't have that JobType yet,
// so there's no third family wired up below until it does.
export const JOB_FLOW_FAMILIES = ["MAIN_WORKSHOP", "FIELD_SERVICE"] as const;
export type JobFlowFamily = (typeof JOB_FLOW_FAMILIES)[number];

export function flowFamilyForJobType(type: JobType): JobFlowFamily {
  return type === "FIELD_SERVICE" ? "FIELD_SERVICE" : "MAIN_WORKSHOP";
}

// Ordered stepper stages per flow family, DRAFT/CLOSED/CANCELLED excluded
// (those are Apollo X's own registration/closure wrapper around every
// flow, handled separately by the register/close/reopen actions already
// built in the Jobs service — not stepper stages themselves).
// AWAIT_OUTWORK is the one stepper stage covering both outwork and parts
// waiting — WAITING_FOR_PARTS deliberately excluded here (2026-09-10, user
// request: "combine the status stepper stage 'Await Outwork' and 'Await
// Parts' as technically they both are the same thing"). The enum value
// itself is untouched (existing jobs already on WAITING_FOR_PARTS keep
// that status), but it's no longer offered as its own stepper step — a job
// on WAITING_FOR_PARTS is shown highlighted on this same AWAIT_OUTWORK step
// instead (see JobWorkspace.tsx's <StatusStepper status={...}> normalizing
// the value it passes in), and clicking that step on such a job moves it to
// AWAIT_OUTWORK going forward.
export const MAIN_WORKSHOP_STATUS_STEPS: JobStatus[] = [
  "TO_BE_COLLECTED",
  "TO_BE_RECEIVED",
  "TO_STRIP",
  "STRIPPING",
  "QUOTE_IN_PROGRESS",
  "AWAITING_GO_AHEAD",
  "AWAIT_OUTWORK",
  "ASSEMBLY",
  "TESTING",
  "TO_PAINT_WRAP",
  "TO_BE_DELIVERED",
  "DELIVERED_AWAITING_PAYMENT",
  "COMPLETE",
];

export const FIELD_SERVICE_STATUS_STEPS: JobStatus[] = [
  "TO_ATTEND",
  "ON_ROUTE",
  "IN_PROGRESS",
  "AWAIT_PAYMENT",
  "COMPLETE",
];

export function statusStepsForJobType(type: JobType): JobStatus[] {
  return flowFamilyForJobType(type) === "FIELD_SERVICE" ? FIELD_SERVICE_STATUS_STEPS : MAIN_WORKSHOP_STATUS_STEPS;
}

// Statuses always selectable regardless of flow family, on top of that
// job's own stepper stages — matches how DRAFT/CLOSED/CANCELLED already
// work in JobWorkspace.tsx's REGISTERABLE_STATUSES/CHANGEABLE_STATUSES.
export const UNIVERSAL_STATUSES: JobStatus[] = ["CANCELLED"];

// RETURNED_UNREPAIRED is deliberately not part of any stepper's ordered
// list (see the JobStatus enum comment in schema.prisma) — it's reachable
// from several earlier main-workshop stages via its own action, and
// reversible back to AWAITING_GO_AHEAD if the client changes their mind.
// Main workshop flow only; not offered for field-service jobs.
export const RETURNED_UNREPAIRED_REOPEN_STATUS: JobStatus = "AWAITING_GO_AHEAD";
export function canMarkReturnedUnrepaired(type: JobType): boolean {
  return flowFamilyForJobType(type) === "MAIN_WORKSHOP";
}

export const JOB_WIP_FILTERS: Array<{ key: string; label: string; statuses?: JobStatus[] }> = [
  { key: "all", label: "All jobs" },
  { key: "drafts", label: "Drafts", statuses: ["DRAFT"] },
  { key: "collection", label: "Collection / receipt", statuses: ["TO_BE_COLLECTED", "TO_BE_RECEIVED", "TO_STRIP"] },
  { key: "workshop", label: "Workshop", statuses: ["STRIPPING", "AWAIT_OUTWORK", "ASSEMBLY", "TESTING", "TO_PAINT_WRAP"] },
  { key: "commercial", label: "Quote / approval", statuses: ["QUOTE_IN_PROGRESS", "AWAITING_GO_AHEAD"] },
  { key: "parts", label: "Waiting for parts", statuses: ["WAITING_FOR_PARTS"] },
  { key: "delivery", label: "Delivery", statuses: ["TO_BE_DELIVERED", "DELIVERED_AWAITING_PAYMENT"] },
  { key: "field", label: "Field service", statuses: ["TO_ATTEND", "ON_ROUTE", "IN_PROGRESS", "AWAIT_PAYMENT"] },
  { key: "returned-unrepaired", label: "Returned unrepaired", statuses: ["RETURNED_UNREPAIRED"] },
  { key: "completed", label: "Completed / closed", statuses: ["COMPLETE", "CLOSED", "CANCELLED"] },
];

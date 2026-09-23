import { JOB_STATUS_LABELS } from "@/lib/jobs/ui";

// Compared directly against ModApp's own equivalent (Badge.tsx's
// JOB_STATUS_TONE) at the user's request ("make the status color coding
// stand out like modapp"): ModApp's actual pill styling turned out to be
// just as subtle/pastel as Apollo X's own (light tint + dark text, no solid
// fill) — the real gap was coverage, not intensity. This map used to name
// only 13 of JobStatus's 24 values; every other status (TO_STRIP,
// AWAIT_OUTWORK, TO_PAINT_WRAP, DELIVERED_AWAITING_PAYMENT,
// RETURNED_UNREPAIRED, and every Field Service status except CANCELLED)
// fell through jobStatusTone's `?? "neutral"` fallback and rendered as a
// flat gray pill regardless of what was actually going on — on a list
// mixing many statuses, that reads as "most rows have no color at all."
// Every value is now named explicitly, mostly matching ModApp's own
// assignment for the statuses both apps share (by grouped meaning: queued/
// not-started -> neutral, waiting on something incoming -> amber, waiting
// on a person/decision -> purple, active hands-on work -> blue, a problem/
// dead-end -> red, actually finished -> green), so nothing new falls back
// to neutral by omission — only DRAFT/TO_BE_COLLECTED/TO_BE_RECEIVED/
// TO_ATTEND keep neutral on purpose, since "hasn't started yet" is the one
// state that should look muted.
// One deliberate change to an already-mapped value: TO_BE_DELIVERED moves
// from green to blue (matching ModApp). Green on a job that ISN'T delivered
// yet was actively misleading — it made an in-progress status look
// "done" — and it also crowded out the one status that actually means
// "delivered," DELIVERED_AWAITING_PAYMENT, which had no color of its own
// before this change and would have inherited the same bland-neutral
// problem this whole pass exists to fix.
const JOB_STATUS_TONE: Record<string, string> = {
  DRAFT: "neutral",
  TO_BE_COLLECTED: "neutral",
  TO_BE_RECEIVED: "neutral",
  TO_STRIP: "amber",
  STRIPPING: "teal",
  QUOTE_IN_PROGRESS: "purple",
  AWAITING_GO_AHEAD: "orange",
  AWAIT_OUTWORK: "purple",
  WAITING_FOR_PARTS: "amber",
  ASSEMBLY: "blue",
  TESTING: "blue",
  TO_PAINT_WRAP: "blue",
  TO_BE_DELIVERED: "blue",
  DELIVERED_AWAITING_PAYMENT: "teal",
  COMPLETE: "green",
  CLOSED: "green",
  CANCELLED: "red",
  RETURNED_UNREPAIRED: "red",
  TO_ATTEND: "neutral",
  ON_ROUTE: "amber",
  IN_PROGRESS: "blue",
  AWAIT_PAYMENT: "purple",
  RECEIVED: "amber",
  INSPECTING: "purple",
};

export function jobStatusTone(status: string) { return JOB_STATUS_TONE[status] ?? "neutral"; }
export function StatusPill({ status, label }: { status: string; label?: string }) { return <span className={`status-pill tone-${jobStatusTone(status)}`}>{label ?? JOB_STATUS_LABELS[status as keyof typeof JOB_STATUS_LABELS] ?? status}</span>; }

// PexRecord's own status lifecycle (TO_BE_DELIVERED -> AWAIT_CORE ->
// OUTSTANDING -> RECEIVED -> IN_REPAIR -> COMPLETED, with SCRAPPED as a
// terminal side-state). This is distinct from JOB_STATUS_TONE above:
// PexStatus is a separate enum on the PexRecord model, not a JobStatus
// value, even though "TO_BE_DELIVERED" is spelled the same as one.
// AWAIT_CORE (added 2026-09-10, at the user's direct request) covers the
// gap between "unit delivered" and "return job exists" — see
// syncPexAwaitCoreFromDeliveryDate in src/lib/pex/service.ts.
//
// 2026-09-23, user request: "make the pex tracking status for outstanding
// and awaiting core the same 'Awaiting Core'." OUTSTANDING and AWAIT_CORE
// both mean "core still owed back from the client" — they used to render
// with different labels/tones deliberately, to keep "before vs. after a
// return job exists" visually distinguishable (see listPexTracking's own
// stat-card comment for the same distinction), but the user now wants
// them to read as one and the same status everywhere a badge shows it —
// on this table, on a job's own PEX Supply/Return panel, wherever
// PexStatusPill is used. The two PexStatus enum values themselves are
// UNCHANGED (a record can still transition OUTSTANDING once a return job
// is linked — see JOB_STATUS_TO_PEX_STATUS below) — only the label/tone
// shown to the user is merged; see also listPexTracking's status filter,
// which now treats the two the same way.
const PEX_STATUS_LABELS: Record<string, string> = {
  TO_BE_DELIVERED: "To be delivered",
  AWAIT_CORE: "Awaiting core",
  OUTSTANDING: "Awaiting core",
  RECEIVED: "Received",
  IN_REPAIR: "In repair",
  COMPLETED: "Completed",
  SCRAPPED: "Scrapped",
};

const PEX_STATUS_TONE: Record<string, string> = {
  TO_BE_DELIVERED: "neutral",
  AWAIT_CORE: "purple",
  OUTSTANDING: "purple",
  RECEIVED: "blue",
  IN_REPAIR: "orange",
  COMPLETED: "green",
  SCRAPPED: "red",
};

export function pexStatusTone(status: string) { return PEX_STATUS_TONE[status] ?? "neutral"; }
export function pexStatusLabel(status: string) { return PEX_STATUS_LABELS[status] ?? status; }
export function PexStatusPill({ status, label }: { status: string; label?: string }) { return <span className={`status-pill tone-${pexStatusTone(status)}`}>{label ?? pexStatusLabel(status)}</span>; }
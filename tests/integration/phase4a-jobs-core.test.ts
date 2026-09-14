import { describe, it } from "vitest";

// 2026-09-14 — STALE TEST FILE, safe to delete (couldn't delete it
// directly — this session has no file-delete capability on this machine,
// only read/write, so it's neutralized here instead; please remove this
// file by hand).
//
// This file tested the old JobPartRequirement/JobPartAllocation/
// JobPartAllocationMovement reserve-issue-return workflow — imported
// addJobPartRequirement/updateJobPartRequirement/reserveJobRequirementStock/
// issueJobAllocationStock/returnJobAllocationStock/
// releaseJobAllocationReservation from jobs/service.ts (none exist),
// queried a `db.jobPartAllocationMovement` Prisma model (doesn't exist),
// and expected getJobById() to return a `partRequirements` array (it
// doesn't).
//
// That whole workflow was removed 2026-09-09, at the user's explicit
// request ("the parts required section in apollo should be removed and the
// parts list section in modapp should be added" — see the dated
// `JobPartLine` model comment in prisma/schema.prisma). Its replacement —
// JobPartLine + addPartLinesBulk/markPartLineReceived/
// unmarkPartLineReceived/updatePartLineOrder/updatePartLineDescription/
// removePartLine in jobs/service.ts, returned as `partLines` from
// getJobById() — is a deliberately much simpler model with no
// reserve/issue/return distinction, so this file isn't a small
// find-and-replace onto new names; it tested a workflow that no longer
// exists in any form. A fresh test file for JobPartLine (if wanted) should
// be written against that real API, not adapted from this one.
describe.skip("phase4a-jobs-core (removed: JobPartRequirement/JobPartAllocation workflow, 2026-09-09)", () => {
  it("superseded by JobPartLine — see file header comment", () => {});
});

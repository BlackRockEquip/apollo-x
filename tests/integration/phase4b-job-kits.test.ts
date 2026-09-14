import { describe, it } from "vitest";

// 2026-09-14 — STALE TEST FILE, safe to delete (couldn't delete it
// directly — this session has no file-delete capability on this machine,
// only read/write, so it's neutralized here instead; please remove this
// file by hand).
//
// This file expected getJobById() to return a `partRequirements` array —
// the old JobPartRequirement/JobPartAllocation model, removed 2026-09-09 at
// the user's explicit request and replaced with the much simpler
// JobPartLine model (returned as `partLines`; see jobs/service.ts and the
// dated `JobPartLine` schema comment in prisma/schema.prisma, and the
// matching note in phase4a-jobs-core.test.ts's own stub in this same
// folder). Whatever this file was covering for Job Kits applying parts
// should be re-tested against JobPartLine/addPartLinesBulk directly if
// still wanted — this file's assertions don't translate.
describe.skip("phase4b-job-kits (removed: partRequirements/JobPartAllocation, 2026-09-09)", () => {
  it("superseded by JobPartLine — see file header comment", () => {});
});

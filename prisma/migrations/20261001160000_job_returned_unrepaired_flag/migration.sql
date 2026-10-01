-- User request: "mark unrepaired return ... instead of closing the job let
-- it add a status pill next to the job status 'Return Unrepaired' and once
-- the job is completed the status will become 'Completed / Unrepaired'."
--
-- RETURNED_UNREPAIRED used to be a real JobStatus value that replaced a
-- job's status outright and ended its stepper. It's now an independent
-- boolean flag instead, so the job keeps moving through its real status's
-- normal stepper — see Job.returnedUnrepaired's own comment in
-- schema.prisma. Postgres can't drop an enum value in place, so
-- JobStatus.RETURNED_UNREPAIRED stays defined but unused going forward
-- (nothing writes it anymore — see SETTABLE_JOB_STATUSES in
-- jobs/validation.ts).
--
-- Every job already sitting on that status is moved off of it here: flagged
-- returnedUnrepaired, and its status reset to AWAITING_GO_AHEAD — the exact
-- status the old "Reopen job" action already sent a returned-unrepaired job
-- back to (RETURNED_UNREPAIRED_REOPEN_STATUS), so this is the same resting
-- place a person would have put it in by hand. Only reachable for
-- MAIN_WORKSHOP-flow job types (canMarkReturnedUnrepaired), so
-- AWAITING_GO_AHEAD is always a valid stepper stage for every row this
-- touches.
ALTER TABLE "Job" ADD COLUMN "returnedUnrepaired" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Job" ADD COLUMN "returnedUnrepairedReason" TEXT;
ALTER TABLE "Job" ADD COLUMN "returnedUnrepairedAt" TIMESTAMP(3);

UPDATE "Job"
SET "returnedUnrepaired" = true,
    "returnedUnrepairedAt" = "updatedAt",
    "status" = 'AWAITING_GO_AHEAD'
WHERE "status" = 'RETURNED_UNREPAIRED';

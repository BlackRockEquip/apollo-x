-- User request: a "Breakdown" button above the job status stepper adds a red "Breakdown" pill to the status.
-- An independent flag on the job (like returnedUnrepaired); the job keeps its place on the stepper.
ALTER TABLE "Job" ADD COLUMN "breakdown" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Job" ADD COLUMN "breakdownAt" TIMESTAMP(3);

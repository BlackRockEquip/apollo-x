-- Engineering Business status flow: three new job statuses (each ADD VALUE sits in its own migration so the
-- new values can be used by the next one).
ALTER TYPE "JobStatus" ADD VALUE IF NOT EXISTS 'AWAIT_ASSESSMENT';
ALTER TYPE "JobStatus" ADD VALUE IF NOT EXISTS 'WORK_IN_PROGRESS';
ALTER TYPE "JobStatus" ADD VALUE IF NOT EXISTS 'QC_CONTROL';

-- AlterEnum
-- Split into its own migration ahead of 20260914150000_job_attachments,
-- same reasoning as 20260909163920_add_status_enum_values: Postgres won't
-- let a newly-added enum value be used in the same transaction that adds
-- it, so these new JobActivityType values (used by the Job Attachments
-- feature's addActivity calls) must land and commit first.
ALTER TYPE "JobActivityType" ADD VALUE 'ATTACHMENT_UPLOADED';

-- AlterEnum
ALTER TYPE "JobActivityType" ADD VALUE 'ATTACHMENT_DELETED';

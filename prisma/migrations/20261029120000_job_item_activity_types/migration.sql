-- AlterEnum
-- Split into its own migration ahead of 20261029120100_job_items, same reasoning as
-- 20260914145000_job_attachment_activity_types: Postgres won't let a newly-added enum value be used in the
-- same transaction that adds it.
ALTER TYPE "JobActivityType" ADD VALUE 'ITEM_ADDED';

-- AlterEnum
ALTER TYPE "JobActivityType" ADD VALUE 'ITEM_UPDATED';

-- AlterEnum
ALTER TYPE "JobActivityType" ADD VALUE 'ITEM_REMOVED';

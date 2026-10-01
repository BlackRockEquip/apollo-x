-- User request: "when a mechanic user adds parts to a job, notification
-- should be sent to Admins/Managers." Adds the one new NotificationType
-- value addPartLinesBulk (jobs/service.ts) now fires via the existing
-- notifyAdminsAndManagers helper — see schema.prisma's NotificationType
-- comment.
ALTER TYPE "NotificationType" ADD VALUE 'JOB_PARTS_ADDED_BY_MECHANIC';

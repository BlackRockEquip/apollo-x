-- Tech Training module: the new module key and notification types.
-- ADD VALUE needs its own migration (a new enum value cannot be used in the same transaction).
ALTER TYPE "ModuleKey" ADD VALUE IF NOT EXISTS 'TECH_TRAINING';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'TRAINING_CERTIFICATE_REQUESTED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'TRAINING_CERTIFICATE_DECIDED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'TRAINING_COURSE_ASSIGNED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'TRAINING_MENTOR_QUESTION';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'TRAINING_REVIEW_DUE';

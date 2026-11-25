-- Failure Reports module: the new module key.
-- ADD VALUE needs its own migration (a new enum value cannot be used in the same transaction).
ALTER TYPE "ModuleKey" ADD VALUE IF NOT EXISTS 'FAILURE_REPORTS';

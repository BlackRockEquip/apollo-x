-- Testing Reports module: the new module key and the Testing Technician user type.
-- ADD VALUE needs its own migration (a new enum value cannot be used in the same transaction).
ALTER TYPE "ModuleKey" ADD VALUE IF NOT EXISTS 'TESTING_REPORTS';
ALTER TYPE "TenantRole" ADD VALUE IF NOT EXISTS 'TESTING_TECHNICIAN';

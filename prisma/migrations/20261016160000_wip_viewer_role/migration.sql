-- WIP View (View Only) user type. ADD VALUE needs its own migration (it cannot be used in the same transaction).
ALTER TYPE "TenantRole" ADD VALUE IF NOT EXISTS 'WIP_VIEWER';
